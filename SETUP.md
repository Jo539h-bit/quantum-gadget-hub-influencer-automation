# Quantum Gadget Hub — Influencer Signup Automation: Setup

This sets up: Google Form → Apps Script → n8n webhook → coupon generation → notification + welcome emails instantly → a 30-minute reminder email. Everything here uses only what you've confirmed; nothing about rates, links or copy was invented.

Files in this folder:
- `workflow/qgh-partner-signup.workflow.json` — importable n8n workflow
- `workflow/build-workflow.mjs` — the script that generated it (only needed if you later want to regenerate after editing an email template)
- `emails/welcome.html` `.txt`, `emails/reminder.html` `.txt`, `emails/notification.html` `.txt` — the three emails, already embedded inside the workflow JSON too
- `apps-script/Code.gs` — the bridge between your Google Form and n8n

---

## 0. First: make the Partner Agreement page public

I built your agreement at **https://claude.ai/artifact/DdKJjhUL2gUXG3gmg8zd1S** (styled with your brand colors, logo and registration number). It's currently private to you. Open it, use its **Share** menu, and set it to **"Anyone with the link"** — otherwise influencers will hit a login wall when the welcome/reminder emails link to it.

---

## 1. Create the Google Form (step by step)

1. Go to [forms.google.com](https://forms.google.com) and click the **blank form** (+).
2. Click the title at the top and rename it to **"Quantum Gadget Hub — Influencer Signup"**.
3. You'll see one question block already there. Set it up as:
   - Question text: **Full Name**
   - Type (dropdown on the right): **Short answer**
   - Toggle **Required** on (bottom right of the block).
4. Click the **+** button on the right-side toolbar (floating menu) to add a new question:
   - Question text: **WhatsApp Number**
   - Type: **Short answer**
   - Click the **⋮** (three dots) at the bottom of the block → **Response validation** → choose **Number** is not required; just leave as text, but add helper text under the question ("Help text" via the ⋮ menu if available) saying: *"Include 0 at the start, e.g. 08012345678"*.
   - Toggle **Required** on.
5. Click **+** again to add a third question:
   - Question text: **Email Address**
   - Type: **Short answer**
   - Click **⋮** → **Response validation** → **Text** → **Email address** (this makes Google reject bad emails automatically).
   - Toggle **Required** on.
6. **The question titles must be spelled exactly** `Full Name`, `WhatsApp Number`, `Email Address` — the Apps Script in step 3 reads them by these exact names.
7. Click the **Responses** tab near the top. Click the green Sheets icon ("Create Spreadsheet"). Choose **Create a new spreadsheet**, name it **"Quantum Gadget Hub Partners"**, click **Create**.

This spreadsheet is now linked: every form submission lands here automatically, and it's also where the Apps Script will live.

---

## 2. Set up the Partners sheet columns

In that spreadsheet, Google will have created a tab (likely named "Form Responses 1") with the raw form answers — leave that tab alone. Add **two new tabs** (click the `+` at the bottom-left of the spreadsheet):

**Tab 1 — rename it to `Partners`.** In row 1, type these headers exactly, one per column (A through I):
```
Timestamp | Full Name | Phone | Email | Coupon Code | Order Link | Status | Reminder Sent | Notes
```

**Tab 2 — rename it to `Flagged`.** Row 1 headers:
```
Timestamp | Full Name | Phone | Email | Reason
```

n8n writes to these two tabs directly; it does not touch the raw "Form Responses" tab.

---

## 3. Add the Apps Script bridge

1. Still in the spreadsheet, click **Extensions → Apps Script**.
2. Delete whatever's in the editor and paste the entire contents of `apps-script/Code.gs` from this folder.
3. Click the **Save** icon (disk icon).
4. On the left sidebar, click the **clock icon** ("Triggers").
5. Click **+ Add Trigger** (bottom right).
6. Set:
   - Function to run: `onPartnerFormSubmit`
   - Event source: **From spreadsheet**
   - Event type: **On form submit**
7. Click **Save**. Google will ask you to authorize — click through with your own Google account and allow it (this is your own script on your own sheet, so this is safe).

Why it's written this way: Apps Script's "simple triggers" (a function just magically named `onFormSubmit`) aren't allowed to call out to the internet. The installable trigger above is what lets it POST to your n8n webhook.

---

## 4. Set up Google credentials in n8n (from scratch)

You'll create **one Google Cloud OAuth app**, then **two separate credentials inside n8n** (Gmail and Google Sheets) that both use it.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a new project (e.g. "Quantum Gadget Hub n8n").
2. **APIs & Services → Library** — search for and **Enable**: `Gmail API` and `Google Sheets API`.
3. **APIs & Services → OAuth consent screen** — choose **External**, fill in app name ("Quantum Gadget Hub Automation"), your email as support/contact email. Add your own Gmail address under **Test users** (since the app stays unverified, only test users can authorize it — that's fine, it's just you).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Web application**.
5. In n8n, open **Credentials → New → Gmail OAuth2 API**. It shows you a **Redirect URL** — copy it.
6. Back in Google Cloud, paste that redirect URL into **Authorized redirect URIs** on the OAuth client, save, then copy the **Client ID** and **Client Secret** into the n8n Gmail credential. Click **Sign in with Google**, approve, save. Name this credential **`Gmail - QGH`** (matches the workflow JSON).
7. Repeat the same thing for **Google Sheets OAuth2 API** in n8n — same Client ID/Secret (it's the same Google Cloud app), its own sign-in. Name it **`Google Sheets - QGH`**.

---

## 5. Import the workflow

1. In n8n: **Workflows → Import from File** → select `workflow/qgh-partner-signup.workflow.json`.
2. You'll see 13 nodes. Before activating, go through this checklist — n8n workflow JSON can't carry over account-specific IDs (spreadsheet ID, credential IDs), so these need a one-time manual fix per node:

### Checklist (do this once, carefully)

- [ ] **Get Existing Rows**, **Log Flagged Duplicate**, **Save New Partner Row**, **Mark Reminder Sent** (4 Google Sheets nodes): open each, click the **Document** dropdown and pick **"Quantum Gadget Hub Partners"** from the list (replaces the `PUT_YOUR_SHEET_ID_HERE` placeholder), then confirm the **Sheet** dropdown shows `Partners` or `Flagged` as appropriate. Set the **Credential** to `Google Sheets - QGH`. Also confirm the **Operation** field reads **"Get Row(s)"** / **"Append Row"** / **"Append or Update Row"** as named in the plan — these are the one part of the JSON I couldn't verify against a live export, so they're worth a glance.
- [ ] **Email Me - Possible Duplicate**, **Email Me - New Partner**, **Email Partner - Welcome**, **Email Partner - Reminder** (4 Gmail nodes): set **Credential** to `Gmail - QGH` on each.
- [ ] **Is Duplicate?**: open it and confirm the condition reads as "isDuplicate is true" against the boolean from the previous node — n8n sometimes shows filter conditions slightly differently after import; if it looks broken, just rebuild this one condition (`{{ $json.isDuplicate }}` equals boolean `true`).
- [ ] **Webhook - Partner Signup**: confirm the **Path** field reads `qgh-partner-signup` and the node's **Production URL** matches `https://YOUR-N8N-INSTANCE.up.railway.app/webhook/qgh-partner-signup`.
- [ ] **Wait 30 Minutes**: confirm it's set to **After Time Interval**, Amount `30`, Unit `Minutes`.

This checklist exists because I built this JSON by hand against n8n's documented node behavior rather than exporting it from a live instance of your exact version — the logic and field values are verified, but resource pickers (spreadsheet/credential) always need re-selecting after an import like this regardless of who built it.

3. Click **Save**, then the **Active** toggle, top right.

---

## 6. Test (do this before trusting it)

1. Temporarily edit the **Wait 30 Minutes** node to **1 minute** instead of 30 — save.
2. Submit the Google Form using your own name, your own WhatsApp number, and your own email.
3. Check, within a few seconds:
   - [ ] Your notification email arrives at `gadgethubs320@gmail.com`
   - [ ] Your welcome email arrives at the test email, with a real coupon code and a working `wa.me` order link
   - [ ] A new row appears in the `Partners` tab with `Reminder Sent = FALSE`
4. Wait 1 minute: confirm the reminder email arrives, and `Reminder Sent` flips to `TRUE` in the sheet.
5. Submit the form again with the **same email** — confirm it lands in `Flagged`, not `Partners`, and you get the duplicate-alert email instead of a second welcome email.
6. Once all of that passes, set the Wait node back to **30 minutes** and save again.

---

## Placeholders

None remain for business content — every name, email, number, rate and rule came from what you gave me. The only things that need filling in are the **technical, account-specific** ones covered above: the Google Sheet document picker and the two n8n credentials (Steps 4–5), which can't be set from outside your accounts.
