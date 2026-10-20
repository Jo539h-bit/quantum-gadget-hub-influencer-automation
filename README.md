# Quantum Gadget Hub — Influencer Partner Onboarding Automation

An n8n workflow that turns a Google Form signup from a WhatsApp influencer into a live, unique coupon code and two branded emails in under a second, followed by a persisted 30-minute reminder — with zero manual steps and automatic duplicate detection.

## What it does

1. An influencer fills out a Google Form (name, WhatsApp number, email).
2. A Google Apps Script trigger POSTs the submission to an n8n webhook the instant it's submitted (no polling delay).
3. n8n checks the submission against existing partners (by email/phone) to catch duplicates.
4. For a new partner: generates a unique coupon code from their name (collision-checked against the live sheet, with a numeric fallback), builds their personal WhatsApp order link, saves the row, and fires two emails — one to the business owner, one branded welcome email to the influencer.
5. 30 minutes later, a reminder email goes out restating their posting objective and commission tiers.
6. A duplicate submission is routed to a separate "Flagged" tab with an alert email instead of silently reissuing a code.

## Stack

- **n8n** (self-hosted on Railway, queue mode with Postgres + Redis)
- **Google Forms + Apps Script** for the instant trigger
- **Google Sheets** as the partner database
- **Gmail API (OAuth2)** for sending

## Repo contents

- `workflow/qgh-partner-signup.workflow.json` — the importable n8n workflow
- `workflow/build-workflow.mjs` — build script that assembles the workflow JSON from the email templates (so HTML never needs manual escaping into JSON)
- `emails/` — the three emails (notification, welcome, reminder), each as HTML and plain text
- `apps-script/Code.gs` — the Google Apps Script bridge from Form to webhook
- `SETUP.md` — full step-by-step setup guide (Form creation, Google Cloud OAuth, n8n credential setup, import checklist, test plan)

## Notable engineering details

- The 30-minute delay uses n8n's native **Wait** node rather than a custom polling workaround, after confirming against n8n's own docs that waits over 65 seconds are offloaded to the database (not held in memory) — verified to survive a restart under this project's queue-mode + persistent-Postgres setup.
- Coupon generation and the duplicate check are pure-JS Code nodes with no external dependency, checked against the sheet's current state before a code is ever issued.
- Caught and fixed, live, in production: an empty-sheet edge case where a Google Sheets "Get Rows" node returning zero rows silently halted the entire downstream chain (fixed via `Always Output Data`), and a subtler bug where Google Sheets renames item fields to the sheet's own column headers after an Append operation — breaking every expression downstream that assumed the original field names survived.

---

*Note: the live webhook URL in `Code.gs` and `SETUP.md` is redacted to a placeholder in this public copy — swap in your own n8n instance's URL.*
