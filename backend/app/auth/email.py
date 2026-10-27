import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Protocol

from app.config import AuthSettings

log = logging.getLogger(__name__)


class EmailSender(Protocol):
    def send(self, to: str, subject: str, body: str) -> None:
        """Send one plain-text email."""


class ConsoleEmail:
    def send(self, to: str, subject: str, body: str) -> None:
        """Print the email to the server log instead of sending it (development)."""
        log.info("email to %s | %s\n%s", to, subject, body)


@dataclass
class MemoryEmail:
    outbox: list[tuple[str, str, str]] = field(default_factory=list)

    def send(self, to: str, subject: str, body: str) -> None:
        """Keep the email in memory (tests)."""
        self.outbox.append((to, subject, body))


@dataclass
class SmtpEmail:
    settings: AuthSettings

    def send(self, to: str, subject: str, body: str) -> None:
        """Send the email through the configured SMTP server."""
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = self.settings.smtp_from, to, subject
        message.set_content(body)
        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if self.settings.smtp_user:
                smtp.login(self.settings.smtp_user, self.settings.smtp_password)
            smtp.send_message(message)


def email_sender(settings: AuthSettings) -> EmailSender:
    """Choose the email sender from the settings."""
    return SmtpEmail(settings) if settings.email_backend == "smtp" else ConsoleEmail()


def code_email(purpose: str, code: str, name: str, minutes: int) -> tuple[str, str]:
    """Subject and body of a verification or password-reset email."""
    if purpose == "verify":
        subject = f"{code} is your Sarathi verification code"
        action = "verify your email address"
    else:
        subject = f"{code} is your Sarathi password reset code"
        action = "reset your password"
    body = (f"Hello {name},\n\nUse this code to {action}:\n\n    {code}\n\n"
            f"It expires in {minutes} minutes. If you did not ask for it, you can ignore this email.\n\n"
            "Sarathi")
    return subject, body
