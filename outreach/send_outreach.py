"""
send_outreach.py — Sends personalised cold outreach emails.

Usage:
    python send_outreach.py --list          # Show all contacts and status
    python send_outreach.py --preview ID    # Preview email for a contact (no send)
    python send_outreach.py --send ID       # Send to one contact by ID
    python send_outreach.py --send-all      # Send to all pending contacts (with delay)

Setup:
    Set these in outreach/.env (separate from bot .env):
        OUTREACH_EMAIL=your@gmail.com
        OUTREACH_PASSWORD=your-gmail-app-password   # NOT your main password
        SENDER_NAME=Abdullah

    Gmail app password: myaccount.google.com → Security → App Passwords
"""

import argparse
import json
import os
import smtplib
import time
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

from dotenv import load_dotenv

# Load outreach-specific env
load_dotenv(Path(__file__).parent / ".env")

from templates import get_template

CONTACTS_FILE = Path(__file__).parent / "contacts.json"
SENT_LOG = Path(__file__).parent / "sent.log"

OUTREACH_EMAIL = os.getenv("OUTREACH_EMAIL", "")
OUTREACH_PASSWORD = os.getenv("OUTREACH_PASSWORD", "")
SENDER_NAME = os.getenv("SENDER_NAME", "Abdullah")


def load_contacts() -> list[dict]:
    with open(CONTACTS_FILE) as f:
        return json.load(f)


def save_contacts(contacts: list[dict]) -> None:
    with open(CONTACTS_FILE, "w") as f:
        json.dump(contacts, f, indent=2)


def mark_sent(contact_id: str) -> None:
    contacts = load_contacts()
    for c in contacts:
        if c["id"] == contact_id:
            c["status"] = "sent"
            c["sent_at"] = time.strftime("%Y-%m-%d %H:%M")
    save_contacts(contacts)
    with open(SENT_LOG, "a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M')} | {contact_id}\n")


def build_email(contact: dict) -> dict:
    specific_ref = contact.get("specific_reference", "your work")
    tmpl = get_template(
        category=contact["category"],
        name=contact["name"].split()[0],  # First name only
        specific_reference=specific_ref,
        sender_name=SENDER_NAME,
    )
    return tmpl


def send_email(to_address: str, subject: str, body: str) -> bool:
    if not OUTREACH_EMAIL or not OUTREACH_PASSWORD:
        print("ERROR: Set OUTREACH_EMAIL and OUTREACH_PASSWORD in outreach/.env")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{SENDER_NAME} <{OUTREACH_EMAIL}>"
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(OUTREACH_EMAIL, OUTREACH_PASSWORD)
            server.sendmail(OUTREACH_EMAIL, to_address, msg.as_string())
        return True
    except Exception as e:
        print(f"Send failed: {e}")
        return False


def cmd_list(contacts: list[dict]) -> None:
    print(f"\n{'ID':<25} {'NAME':<25} {'CATEGORY':<20} {'STATUS':<10}")
    print("─" * 85)
    for c in contacts:
        email_display = c.get("email", "— DM only")[:30]
        print(f"{c['id']:<25} {c['name']:<25} {c['category']:<20} {c['status']:<10}")
        print(f"  {'Email:':<10} {email_display}")
        print(f"  {'Handle:':<10} {c.get('handle', '')}")
        print(f"  {'Angle:':<10} {c.get('angle', '')[:70]}")
        print()


def cmd_preview(contacts: list[dict], contact_id: str) -> None:
    contact = next((c for c in contacts if c["id"] == contact_id), None)
    if not contact:
        print(f"Contact '{contact_id}' not found.")
        return

    email = build_email(contact)
    print(f"\n{'='*60}")
    print(f"TO:      {contact['name']} <{contact.get('email', 'NO EMAIL — use DM')}>")
    print(f"SUBJECT: {email['subject']}")
    print(f"{'='*60}")
    print(email["body"])
    print(f"{'='*60}\n")

    if not contact.get("email"):
        method = contact.get("contact_method", "Find their email first")
        print(f"NOTE: No email for this contact. Recommended: {method}")


def cmd_send(contacts: list[dict], contact_id: str) -> None:
    contact = next((c for c in contacts if c["id"] == contact_id), None)
    if not contact:
        print(f"Contact '{contact_id}' not found.")
        return

    if contact["status"] == "sent":
        print(f"Already sent to {contact['name']}. Use --force to resend.")
        return

    if not contact.get("email"):
        print(f"No email for {contact['name']}. Contact via: {contact.get('contact_method', 'find their email')}")
        return

    email = build_email(contact)
    cmd_preview(contacts, contact_id)

    confirm = input("Send this? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("Cancelled.")
        return

    ok = send_email(contact["email"], email["subject"], email["body"])
    if ok:
        mark_sent(contact_id)
        print(f"Sent to {contact['name']} ({contact['email']})")
    else:
        print("Failed to send.")


def cmd_send_all(contacts: list[dict]) -> None:
    pending = [c for c in contacts if c["status"] == "pending" and c.get("email")]
    if not pending:
        print("No pending contacts with email addresses.")
        return

    print(f"\n{len(pending)} contacts to send to:")
    for c in pending:
        print(f"  {c['name']} ({c['email']})")

    confirm = input(f"\nSend to all {len(pending)}? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("Cancelled.")
        return

    for i, contact in enumerate(pending):
        email = build_email(contact)
        print(f"\n[{i+1}/{len(pending)}] Sending to {contact['name']}...")
        ok = send_email(contact["email"], email["subject"], email["body"])
        if ok:
            mark_sent(contact["id"])
            print(f"  Sent.")
        else:
            print(f"  Failed.")

        if i < len(pending) - 1:
            # Random delay between 2–5 minutes so it doesn't look automated
            delay = random.randint(120, 300)
            print(f"  Waiting {delay}s before next send...")
            time.sleep(delay)

    print("\nDone.")


def main() -> None:
    parser = argparse.ArgumentParser(description="HORMUZ outreach email tool")
    parser.add_argument("--list", action="store_true", help="List all contacts")
    parser.add_argument("--preview", metavar="ID", help="Preview email for a contact")
    parser.add_argument("--send", metavar="ID", help="Send to one contact")
    parser.add_argument("--send-all", action="store_true", help="Send to all pending")
    args = parser.parse_args()

    contacts = load_contacts()

    if args.list:
        cmd_list(contacts)
    elif args.preview:
        cmd_preview(contacts, args.preview)
    elif args.send:
        cmd_send(contacts, args.send)
    elif args.send_all:
        cmd_send_all(contacts)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
