from dataclasses import dataclass
from html import escape
from pathlib import Path

LOGO = Path(__file__).parent / "assets" / "logo-white.png"
LOGO_CID = "sarathi-logo"  # the logo travels inside the email, so it shows without loading anything from the web

# Brand colours (brand/ and the design system).
BLUE = "#1F55E0"
TINT = "#F3F6FD"
INK = "#1B1C1E"
MUTED = "#5A5F66"
BORDER = "#D0D7DE"
FONT = "Roboto, 'Segoe UI', Helvetica, Arial, sans-serif"


@dataclass(frozen=True)
class Email:
    subject: str
    text: str           # plain-text version, for clients that don't show HTML
    html: str | None = None
    preheader: str = ""  # the preview line shown after the subject in the inbox list


# Email clients ignore stylesheets, so the layout is tables with inline styles, at most 560 px wide.
CODE_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:{tint};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
{preheader}&#8203;&#847;&#8203;&#847;&#8203;&#847;
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{tint};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:560px;background:#ffffff;border:1px solid {border};border-radius:16px;overflow:hidden;">
    <tr><td style="background:{blue};padding:24px 32px;">
      <img src="cid:{logo_cid}" width="144" height="48" alt="Sarathi" style="display:block;border:0;">
    </td></tr>
    <tr><td style="padding:32px;font-family:{font};color:{ink};">
      <p style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:700;">{heading}</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:{muted};">
        Hi {name}, use this code to {action}.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background:{tint};border:1px solid {border};border-radius:12px;padding:16px 24px;
                       font-family:'Roboto Mono',Consolas,'Courier New',monospace;font-size:34px;line-height:40px;
                       font-weight:700;letter-spacing:10px;color:{ink};">{code}</td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:15px;line-height:22px;color:{ink};">
        The code expires in <strong>{minutes} minutes</strong>.
      </p>
      <p style="margin:0;padding:16px;background:{tint};border-radius:12px;font-size:14px;line-height:20px;
                color:{muted};">
        {safety} Never share this code: Sarathi will never ask you for it.
      </p>
    </td></tr>
    <tr><td style="padding:20px 32px;border-top:1px solid {border};font-family:{font};font-size:12px;
                   line-height:18px;color:{muted};">
      Sarathi · Verified road closures and the nearest hospital by road in Kathmandu.<br>
      You're getting this email because this address was entered on Sarathi.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

PURPOSES = {
    "verify": {
        "subject": "{code} is your Sarathi verification code",
        "heading": "Confirm your email",
        "action": "verify your email address",
        "safety": "If you didn't sign up for Sarathi, you can ignore this email.",
    },
    "reset": {
        "subject": "{code} is your Sarathi password reset code",
        "heading": "Reset your password",
        "action": "set a new password",
        "safety": "If you didn't ask to reset your password, ignore this email; your password stays the same.",
    },
}


def code_email(purpose: str, code: str, name: str, minutes: int) -> Email:
    """A verification or password-reset email with the code, as HTML with a plain-text version."""
    words = PURPOSES["verify" if purpose == "verify" else "reset"]
    subject = words["subject"].format(code=code)
    preheader = f"Your code is {code}. It expires in {minutes} minutes."
    first_name = name.split()[0] if name.split() else name
    text = (f"Hi {first_name},\n\nUse this code to {words['action']}:\n\n    {code}\n\n"
            f"It expires in {minutes} minutes.\n\n{words['safety']} Never share this code: "
            "Sarathi will never ask you for it.\n\nSarathi")
    html = CODE_TEMPLATE.format(
        subject=escape(subject), preheader=escape(preheader), heading=escape(words["heading"]),
        name=escape(first_name), action=escape(words["action"]), code=escape(code), minutes=minutes,
        safety=escape(words["safety"]), logo_cid=LOGO_CID,
        blue=BLUE, tint=TINT, ink=INK, muted=MUTED, border=BORDER, font=FONT,
    )
    return Email(subject=subject, text=text, html=html, preheader=preheader)
