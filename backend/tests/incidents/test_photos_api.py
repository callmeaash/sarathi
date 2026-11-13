import io
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.auth.tokens import create_access_token
from app.incidents.photos import MAX_PHOTOS, MAX_SIDE_PX, MAX_UPLOAD_BYTES
from app.main import create_app
from tests.conftest import TEST_AUTH, needs_db
from tests.incidents.conftest import USERS, WEST_ROAD
from tests.incidents.test_incidents_api import MAP, act, as_, reported, sql
from tests.seed import seed_network

pytestmark = needs_db

KATHMANDU_GPS = {1: "N", 2: (27.0, 42.0, 0.0), 3: "E", 4: (85.0, 18.0, 0.0)}


@pytest.fixture(scope="module")
def app_client(db_engine, tmp_path_factory):
    seed_network(db_engine, road_names={(0, 4): WEST_ROAD})
    ids = {}
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE users RESTART IDENTITY CASCADE"))
        for key, (name, role, verified) in USERS.items():
            ids[key] = conn.execute(text("""
                INSERT INTO users (email, full_name, password_hash, role, email_verified)
                VALUES (:email, :name, 'not-a-real-hash', :role, :verified) RETURNING id
            """), {"email": f"{key}@example.com", "name": name, "role": role, "verified": verified}).scalar_one()
    now = datetime.now(timezone.utc)
    folder = tmp_path_factory.mktemp("uploads") / "photos"  # not created yet: the first upload makes it
    app = create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail(), upload_dir=folder)
    with TestClient(app) as c:
        c.db = db_engine
        c.folder = folder
        c.tokens = {key: create_access_token(TEST_AUTH, ids[key], USERS[key][1], now) for key in USERS}
        yield c


@pytest.fixture
def client(app_client):
    yield app_client
    sql(app_client, "TRUNCATE incidents, audit_log RESTART IDENTITY CASCADE")
    for path in app_client.folder.glob("*"):
        path.unlink()


def picture(size=(640, 480), kind="JPEG", colour=(200, 60, 40), **save) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, colour).save(out, format=kind, **save)
    return out.getvalue()


def upload(client, incident_id, data=None, who="asha", name="photo.jpg", content_type="image/jpeg"):
    files = {"file": (name, picture() if data is None else data, content_type)}
    return client.post(f"/api/incidents/{incident_id}/photos", files=files, headers=as_(client, who))


def stored(client) -> list:
    return sorted(client.folder.glob("*")) if client.folder.exists() else []


def test_a_photo_is_attached_and_shown_with_the_report(client):
    incident_id = reported(client)
    response = upload(client, incident_id)
    assert response.status_code == 201, response.text
    (photo,) = response.json()["photos"]
    assert (photo["width"], photo["height"]) == (640, 480)
    assert photo["url"].startswith("/api/photos/") and photo["url"].endswith(".jpg")

    assert client.get(f"/api/incidents/{incident_id}").json()["photos"] == [photo]
    assert client.get("/api/incidents", params={"bbox": MAP}).json()[0]["photos"] == [photo]
    assert client.get("/api/incidents/mine", headers=as_(client, "asha")).json()[0]["photos"] == [photo]
    assert client.get("/api/moderation/queue", headers=as_(client, "mod")).json()[0]["photos"] == [photo]


def test_a_report_without_photos_has_an_empty_list(client):
    assert client.get(f"/api/incidents/{reported(client)}").json()["photos"] == []


def test_the_photo_can_be_opened_by_its_address_without_signing_in(client):
    url = upload(client, reported(client)).json()["photos"][0]["url"]
    response = client.get(url)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "immutable" in response.headers["cache-control"]
    assert Image.open(io.BytesIO(response.content)).size == (640, 480)


@pytest.mark.parametrize("name", ["nope.jpg", "0" * 32 + ".jpg", "0" * 32 + ".png", "..%2F..%2F.env",
                                  "%2e%2e%2fsecret.jpg"])
def test_unknown_or_odd_photo_names_are_not_found(client, name):
    upload(client, reported(client))
    assert client.get(f"/api/photos/{name}").status_code == 404


def test_png_and_webp_are_accepted_and_stored_as_jpeg(client):
    incident_id = reported(client)
    assert upload(client, incident_id, picture(kind="PNG"), name="a.png", content_type="image/png").status_code == 201
    response = upload(client, incident_id, picture(kind="WEBP"), name="b.webp", content_type="image/webp")
    assert response.status_code == 201
    for photo in response.json()["photos"]:
        assert Image.open(io.BytesIO(client.get(photo["url"]).content)).format == "JPEG"


def test_large_photos_are_scaled_down(client):
    response = upload(client, reported(client), picture(size=(4000, 3000)))
    (photo,) = response.json()["photos"]
    assert (photo["width"], photo["height"]) == (MAX_SIDE_PX, 1200)
    assert Image.open(stored(client)[0]).size == (MAX_SIDE_PX, 1200)


def test_location_and_other_metadata_are_removed(client):
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"
    exif.get_ifd(0x8825).update(KATHMANDU_GPS)
    original = picture(exif=exif)
    assert Image.open(io.BytesIO(original)).getexif().get_ifd(0x8825)  # the upload really carries a location

    upload(client, reported(client), original)
    saved = Image.open(stored(client)[0]).getexif()
    assert not saved.get_ifd(0x8825) and 0x010F not in saved


def test_sideways_phone_photos_are_turned_upright(client):
    exif = Image.Exif()
    exif[0x0112] = 6  # the camera was held on its side
    (photo,) = upload(client, reported(client), picture(size=(640, 480), exif=exif)).json()["photos"]
    assert (photo["width"], photo["height"]) == (480, 640)


@pytest.mark.parametrize("data, content_type", [
    (b"this is not an image", "image/jpeg"),
    (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml"),
    (b"GIF89a" + b"\x00" * 40, "image/gif"),
    (b"", "image/jpeg"),
    (picture()[:200], "image/jpeg"),
])
def test_files_that_are_not_photos_are_rejected(client, data, content_type):
    incident_id = reported(client)
    response = upload(client, incident_id, data, content_type=content_type)
    assert response.status_code == 422 and "JPEG, PNG or WebP" in response.json()["detail"]
    assert stored(client) == [] and sql(client, "SELECT count(*) FROM incident_photos")[0][0] == 0


def test_uploads_over_the_size_limit_are_refused(client):
    response = upload(client, reported(client), b"\xff" * (MAX_UPLOAD_BYTES + 1))
    assert response.status_code == 413 and "8 MB" in response.json()["detail"]
    assert stored(client) == []


def test_a_report_takes_a_limited_number_of_photos(client):
    incident_id = reported(client)
    for _ in range(MAX_PHOTOS):
        assert upload(client, incident_id).status_code == 201
    response = upload(client, incident_id)
    assert response.status_code == 409 and f"at most {MAX_PHOTOS} photos" in response.json()["detail"]
    assert len(stored(client)) == MAX_PHOTOS
    assert len({path.name for path in stored(client)}) == MAX_PHOTOS


def test_only_the_reporter_can_add_photos(client):
    incident_id = reported(client)
    assert upload(client, incident_id, who=None).status_code == 401
    assert upload(client, incident_id, who="chandra").status_code == 403  # email not verified
    for who in ("bikash", "mod"):
        response = upload(client, incident_id, who=who)
        assert response.status_code == 403 and "your own reports" in response.json()["detail"]
    assert stored(client) == []


def test_photos_cannot_be_added_to_a_missing_report(client):
    assert upload(client, 999).status_code == 404


@pytest.mark.parametrize("action, body", [("verify", {}), ("reject", {"reason": "Could not confirm"})])
def test_photos_can_only_be_added_while_the_report_is_pending(client, action, body):
    incident_id = reported(client)
    assert act(client, incident_id, action, **body).status_code == 200
    response = upload(client, incident_id)
    assert response.status_code == 409 and "waiting for review" in response.json()["detail"]


def test_photos_stay_with_the_report_after_review(client):
    incident_id = reported(client)
    photo = upload(client, incident_id).json()["photos"][0]
    assert act(client, incident_id, "verify").json()["incident"]["photos"] == [photo]
    assert client.get(photo["url"]).status_code == 200


def test_the_file_field_is_required(client):
    response = client.post(f"/api/incidents/{reported(client)}/photos", headers=as_(client, "asha"))
    assert response.status_code == 422
