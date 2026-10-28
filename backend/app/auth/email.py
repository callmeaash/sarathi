import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr
from typing import Protocol

from app.auth.messages import LOGO, LOGO_CID, Email
from app.config import AuthSettings

log = logging.getLogger(__name__)


class EmailSender(Protocol):
    def send(self, to: str, email: Email) -> None:
        """Send one email."""


class ConsoleEmail:
    def send(self, to: str, email: Email) -> None:
        """Print the email's plain-text version to the server log instead of sending it (development)."""
        log.info("email to %s | %s\n%s", to, email.subject, email.text)


@dataclass
class MemoryEmail:
    outbox: list[tuple[str, str, str]] = field(default_factory=list)  # (to, subject, text), for tests
    sent: list[Email] = field(default_factory=list)

    def send(self, to: str, email: Email) -> None:
        """Keep the email in memory (tests)."""
        self.outbox.append((to, email.subject, email.text))
        self.sent.append(email)


SSL_PORT = 465  # implicit TLS; other ports (usually 587) upgrade a plain connection with STARTTLS


def build_message(sender: str, to: str, email: Email) -> EmailMessage:
    """A MIME message: plain text, plus HTML with the logo attached inline when there is HTML."""
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = sender, to, email.subject
    message["Date"] = formatdate(localtime=True)
    domain = parseaddr(sender)[1].rpartition("@")[2] or None
    message["Message-ID"] = make_msgid(domain=domain)  # mail providers trust messages with proper ids more
    message.set_content(email.text)
    if email.html:
        message.add_alternative(email.html, subtype="html")
        html_part = message.get_payload()[-1]
        html_part.add_related(LOGO.read_bytes(), "image", "png", cid=f"<{LOGO_CID}>", filename="sarathi.png")
    return message


@dataclass
class SmtpEmail:
    settings: AuthSettings

    def send(self, to: str, email: Email) -> None:
        """Send the email through the configured SMTP server."""
        message = build_message(self.settings.smtp_from, to, email)
        ssl = self.settings.smtp_port == SSL_PORT
        connect = smtplib.SMTP_SSL if ssl else smtplib.SMTP
        with connect(self.settings.smtp_host, self.settings.smtp_port, timeout=15) as smtp:
            if not ssl:
                smtp.starttls()
            if self.settings.smtp_user:
                smtp.login(self.settings.smtp_user, self.settings.smtp_password)
            smtp.send_message(message)


def email_sender(settings: AuthSettings) -> EmailSender:
    """Choose the email sender from the settings."""
    return SmtpEmail(settings) if settings.email_backend == "smtp" else ConsoleEmail()
