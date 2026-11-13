import io
import os
import re
import secrets
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import BACKEND_DIR
from app.errors import Conflict, Forbidden, InvalidInput
from app.incidents.service import locked_incident
from app.models import IncidentPhoto, User

MAX_PHOTOS = 3                        # per report
MAX_UPLOAD_BYTES = 8 * 1024 * 1024    # phones resize before sending; this is the limit for what arrives
MAX_PIXELS = 50_000_000               # refuse images that would take too much memory to open
MAX_SIDE_PX = 1600                    # stored photos are scaled down to fit this
JPEG_QUALITY = 82
FORMATS = ("JPEG", "PNG", "WEBP")
FILE_NAME = re.compile(r"[0-9a-f]{32}\.jpg")


def upload_dir() -> Path:
    """Folder where report photos are kept: UPLOAD_DIR, or data/uploads in the project."""
    return Path(os.getenv("UPLOAD_DIR") or BACKEND_DIR.parent / "data" / "uploads")


def prepare(data: bytes) -> tuple[bytes, int, int]:
    """Check an upload is a real photo and return it as a JPEG without metadata, with its width and height."""
    try:
        image = Image.open(io.BytesIO(data), formats=FORMATS)
        if image.width * image.height > MAX_PIXELS:
            raise InvalidInput("this photo is too large; choose a smaller one")
        # Turn the photo the right way up, then drop everything but the pixels: phone photos carry the
        # place they were taken, the device and more in their metadata.
        image = ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise InvalidInput("photos must be JPEG, PNG or WebP images") from None
    image.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue(), image.width, image.height


def add_photo(session: Session, user: User, incident_id: int, data: bytes, folder: Path, now: datetime) -> None:
    """Attach a photo to the user's own report while it is still waiting for review."""
    incident = locked_incident(session, incident_id)  # the lock stops two uploads passing the limit together
    if incident.reporter_id != user.id:
        raise Forbidden("you can only add photos to your own reports")
    if incident.status != "pending":
        raise Conflict("photos can only be added while a report is waiting for review")
    count = session.scalar(select(func.count()).where(IncidentPhoto.incident_id == incident_id))
    if count >= MAX_PHOTOS:
        raise Conflict(f"a report can have at most {MAX_PHOTOS} photos")

    jpeg, width, height = prepare(data)
    name = f"{secrets.token_hex(16)}.jpg"  # unguessable, so a photo can only be opened by someone given its address
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(jpeg)
    try:
        session.add(IncidentPhoto(incident_id=incident_id, file_name=name, width=width, height=height,
                                  size_bytes=len(jpeg), created_at=now))
        session.commit()
    except Exception:
        path.unlink(missing_ok=True)  # never leave a file that no report points to
        raise


def photo_path(folder: Path, name: str) -> Path | None:
    """The stored file for a photo name, or None if the name is not one of ours or the file is gone."""
    if not FILE_NAME.fullmatch(name):
        return None
    path = folder / name
    return path if path.is_file() else None
