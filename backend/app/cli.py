import argparse
import sys

from sqlalchemy.orm import Session

from app.auth.service import AuthError, set_role
from app.db import get_engine
from app.models import USER_ROLES


def main(argv: list[str] | None = None) -> int:
    """Admin commands that run outside the API, e.g. making the first moderator."""
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    role = commands.add_parser("set-role", help="change a user's role, e.g. to create the first moderator")
    role.add_argument("email")
    role.add_argument("role", choices=USER_ROLES)
    args = parser.parse_args(argv)

    with Session(get_engine()) as session:
        try:
            user = set_role(session, args.email, args.role)
        except AuthError as exc:
            print(exc.detail, file=sys.stderr)
            return 1
        print(f"{user.email} is now a {user.role}")  # inside the session: the user is reloaded after commit
    return 0


if __name__ == "__main__":
    sys.exit(main())
