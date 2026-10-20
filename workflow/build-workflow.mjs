// Build script: assembles qgh-partner-signup.workflow.json from the email
// templates on disk, so no HTML ever has to be hand-escaped into JSON.
// Run: node build-workflow.mjs   (from this folder)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emailsDir = path.join(__dirname, "..", "emails");

const read = (name) => fs.readFileSync(path.join(emailsDir, name), "utf8");

const notificationHtml = read("notification.html");
const welcomeHtml = read("welcome.html");
const reminderHtml = read("reminder.html");

const BRAND_NUMBER = "2349033530925";
const AGREEMENT_URL = "https://claude.ai/artifact/DdKJjhUL2gUXG3gmg8zd1S";
const OWNER_EMAIL = "gadgetshub320@gmail.com";
const SRC_NODE = "Check Duplicate & Assign Code";

// ---- Code node 1: parse + normalize the webhook payload, build candidate codes ----
const normalizeInputCode = `
const body = $input.first().json.body || {};

const rawName = (body.name || "").trim();
const rawPhone = (body.phone || "").trim();
const email = (body.email || "").trim().toLowerCase();

// --- phone normalization to 234... ---
let digits = rawPhone.replace(/[^0-9]/g, "");
if (digits.startsWith("234")) {
  // already international
} else if (digits.startsWith("0")) {
  digits = "234" + digits.slice(1);
} else if (digits.length === 10) {
  digits = "234" + digits;
}
const phone = digits;

// --- name split ---
const parts = rawName.split(/\\s+/).filter(Boolean);
const firstName = parts[0] || "Partner";
const lastName = parts.length > 1 ? parts[parts.length - 1] : "";

const onlyLetters = (s) => (s || "").replace(/[^A-Za-z]/g, "").toUpperCase();
const firstLetters = onlyLetters(firstName);
const lastLetters = onlyLetters(lastName);

const PREFIX = "QGH";
const candidates = [];

// 1) QGH + first two letters of first name
if (firstLetters.length >= 2) {
  candidates.push(PREFIX + firstLetters.slice(0, 2));
} else if (firstLetters.length === 1) {
  candidates.push(PREFIX + firstLetters + "X");
}

// 2) QGH + first-name initial + last-name initial
if (firstLetters[0] && lastLetters[0]) {
  candidates.push(PREFIX + firstLetters[0] + lastLetters[0]);
}

// 3) numbered fallbacks off the first candidate, e.g. QGHTO2, QGHTO3, ...
const base = candidates[0] || (PREFIX + "XX");
for (let i = 2; i <= 25; i++) {
  candidates.push(base + i);
}

return [{
  json: {
    name: rawName,
    firstName,
    lastName,
    phone,
    email,
    timestamp: new Date().toISOString(),
    candidates
  }
}];
`.trim();

// ---- Code node 2: dedupe check + final coupon code + order link ----
const assignCodeCode = `
const input = $("Normalize Input").first().json;
const existingRows = $input.all().map(i => i.json);

const existingEmails = new Set(existingRows.map(r => (r.Email || r.email || "").toLowerCase()).filter(Boolean));
const existingPhones = new Set(existingRows.map(r => (r.Phone || r.phone || "").toString()).filter(Boolean));
const existingCodes = new Set(existingRows.map(r => (r["Coupon Code"] || r.couponCode || "").toUpperCase()).filter(Boolean));

const isDuplicate = existingEmails.has(input.email) || existingPhones.has(input.phone);

let couponCode = null;
if (!isDuplicate) {
  couponCode = input.candidates.find(c => !existingCodes.has(c.toUpperCase())) || (input.candidates[0] + "-" + Date.now().toString().slice(-4));
}

const orderLink = couponCode
  ? "https://wa.me/${BRAND_NUMBER}?text=" + encodeURIComponent("Hi, I want to order. Code: " + couponCode)
  : null;

return [{
  json: {
    ...input,
    isDuplicate,
    couponCode,
    orderLink,
    agreementLink: "${AGREEMENT_URL}"
  }
}];
`.trim();

const duplicateOwnerText = `=A form submission matched an existing email or phone number already in the Partners sheet.

Name: {{ $('${SRC_NODE}').item.json.name }}
Phone: {{ $('${SRC_NODE}').item.json.phone }}
Email: {{ $('${SRC_NODE}').item.json.email }}

No new coupon code was issued. Check the Flagged tab and follow up manually.`;

const rl = (value, name) => ({ __rl: true, mode: "list", value, cachedResultName: name || value });

const workflow = {
  name: "QGH - Influencer Partner Signup",
  nodes: [
    {
      id: "webhook",
      name: "Webhook - Partner Signup",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-1200, 0],
      parameters: {
        httpMethod: "POST",
        path: "qgh-partner-signup",
        responseMode: "onReceived",
        options: {}
      }
    },
    {
      id: "normalize",
      name: "Normalize Input",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-960, 0],
      parameters: { language: "javaScript", jsCode: normalizeInputCode }
    },
    {
      id: "getRows",
      name: "Get Existing Rows",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [-720, 0],
      parameters: {
        operation: "read",
        documentId: rl("PUT_YOUR_SHEET_ID_HERE", "Quantum Gadget Hub Partners"),
        sheetName: rl("Partners", "Partners"),
        options: {}
      },
      credentials: { googleSheetsOAuth2Api: { id: "", name: "Google Sheets - QGH" } }
    },
    {
      id: "assignCode",
      name: "Check Duplicate & Assign Code",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-480, 0],
      parameters: { language: "javaScript", jsCode: assignCodeCode }
    },
    {
      id: "ifDuplicate",
      name: "Is Duplicate?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [-240, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: "dup-check",
              leftValue: "={{ $json.isDuplicate }}",
              rightValue: true,
              operator: { type: "boolean", operation: "true", singleValue: true }
            }
          ],
          combinator: "and"
        },
        options: {}
      }
    },
    {
      id: "flagDuplicateRow",
      name: "Log Flagged Duplicate",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [0, -160],
      parameters: {
        operation: "append",
        documentId: rl("PUT_YOUR_SHEET_ID_HERE", "Quantum Gadget Hub Partners"),
        sheetName: rl("Flagged", "Flagged"),
        columns: {
          mappingMode: "defineBelow",
          value: {
            "Timestamp": "={{ $json.timestamp }}",
            "Full Name": "={{ $json.name }}",
            "Phone": "={{ $json.phone }}",
            "Email": "={{ $json.email }}",
            "Reason": "Email or phone already exists in Partners sheet"
          }
        },
        options: {}
      },
      credentials: { googleSheetsOAuth2Api: { id: "", name: "Google Sheets - QGH" } }
    },
    {
      id: "notifyDuplicate",
      name: "Email Me - Possible Duplicate",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [240, -160],
      parameters: {
        resource: "message",
        operation: "send",
        sendTo: OWNER_EMAIL,
        subject: `=Possible duplicate signup: {{ $('${SRC_NODE}').item.json.name }}`,
        emailType: "text",
        message: duplicateOwnerText,
        options: { appendAttribution: false }
      },
      credentials: { gmailOAuth2: { id: "", name: "Gmail - QGH" } }
    },
    {
      id: "appendPartnerRow",
      name: "Save New Partner Row",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [0, 160],
      parameters: {
        operation: "append",
        documentId: rl("PUT_YOUR_SHEET_ID_HERE", "Quantum Gadget Hub Partners"),
        sheetName: rl("Partners", "Partners"),
        columns: {
          mappingMode: "defineBelow",
          value: {
            "Timestamp": "={{ $json.timestamp }}",
            "Full Name": "={{ $json.name }}",
            "Phone": "={{ $json.phone }}",
            "Email": "={{ $json.email }}",
            "Coupon Code": "={{ $json.couponCode }}",
            "Order Link": "={{ $json.orderLink }}",
            "Status": "Active",
            "Reminder Sent": "FALSE",
            "Notes": ""
          }
        },
        options: {}
      },
      credentials: { googleSheetsOAuth2Api: { id: "", name: "Google Sheets - QGH" } }
    },
    {
      id: "notifyOwner",
      name: "Email Me - New Partner",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [240, 160],
      parameters: {
        resource: "message",
        operation: "send",
        sendTo: OWNER_EMAIL,
        subject: `=New Influencer Partner: {{ $('${SRC_NODE}').item.json.name }} — {{ $('${SRC_NODE}').item.json.couponCode }}`,
        emailType: "html",
        message: notificationHtml,
        options: { appendAttribution: false }
      },
      credentials: { gmailOAuth2: { id: "", name: "Gmail - QGH" } }
    },
    {
      id: "welcomeEmail",
      name: "Email Partner - Welcome",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [480, 160],
      parameters: {
        resource: "message",
        operation: "send",
        sendTo: `={{ $('${SRC_NODE}').item.json.email }}`,
        subject: "=Welcome to Quantum Gadget Hub — here's your code",
        emailType: "html",
        message: welcomeHtml,
        options: { appendAttribution: false, senderName: "Quantum Gadget Hub" }
      },
      credentials: { gmailOAuth2: { id: "", name: "Gmail - QGH" } }
    },
    {
      id: "wait30",
      name: "Wait 30 Minutes",
      type: "n8n-nodes-base.wait",
      typeVersion: 1.1,
      position: [720, 160],
      parameters: {
        resume: "timeInterval",
        amount: 30,
        unit: "minutes"
      },
      webhookId: "qgh-reminder-wait"
    },
    {
      id: "reminderEmail",
      name: "Email Partner - Reminder",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [960, 160],
      parameters: {
        resource: "message",
        operation: "send",
        sendTo: `={{ $('${SRC_NODE}').item.json.email }}`,
        subject: "=Quick reminder: your next steps as a Quantum Gadget Hub Partner",
        emailType: "html",
        message: reminderHtml,
        options: { appendAttribution: false, senderName: "Quantum Gadget Hub" }
      },
      credentials: { gmailOAuth2: { id: "", name: "Gmail - QGH" } }
    },
    {
      id: "markReminderSent",
      name: "Mark Reminder Sent",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1200, 160],
      parameters: {
        operation: "appendOrUpdate",
        documentId: rl("PUT_YOUR_SHEET_ID_HERE", "Quantum Gadget Hub Partners"),
        sheetName: rl("Partners", "Partners"),
        columns: {
          mappingMode: "defineBelow",
          matchingColumns: ["Email"],
          value: {
            "Email": `={{ $('${SRC_NODE}').item.json.email }}`,
            "Reminder Sent": "TRUE"
          }
        },
        options: {}
      },
      credentials: { googleSheetsOAuth2Api: { id: "", name: "Google Sheets - QGH" } }
    }
  ],
  connections: {
    "Webhook - Partner Signup": { main: [[{ node: "Normalize Input", type: "main", index: 0 }]] },
    "Normalize Input": { main: [[{ node: "Get Existing Rows", type: "main", index: 0 }]] },
    "Get Existing Rows": { main: [[{ node: "Check Duplicate & Assign Code", type: "main", index: 0 }]] },
    "Check Duplicate & Assign Code": { main: [[{ node: "Is Duplicate?", type: "main", index: 0 }]] },
    "Is Duplicate?": {
      main: [
        [{ node: "Log Flagged Duplicate", type: "main", index: 0 }],
        [{ node: "Save New Partner Row", type: "main", index: 0 }]
      ]
    },
    "Log Flagged Duplicate": { main: [[{ node: "Email Me - Possible Duplicate", type: "main", index: 0 }]] },
    "Save New Partner Row": { main: [[{ node: "Email Me - New Partner", type: "main", index: 0 }]] },
    "Email Me - New Partner": { main: [[{ node: "Email Partner - Welcome", type: "main", index: 0 }]] },
    "Email Partner - Welcome": { main: [[{ node: "Wait 30 Minutes", type: "main", index: 0 }]] },
    "Wait 30 Minutes": { main: [[{ node: "Email Partner - Reminder", type: "main", index: 0 }]] },
    "Email Partner - Reminder": { main: [[{ node: "Mark Reminder Sent", type: "main", index: 0 }]] }
  },
  settings: {
    executionOrder: "v1",
    saveDataSuccessExecution: "all",
    saveManualExecutions: true
  }
};

const outPath = path.join(__dirname, "qgh-partner-signup.workflow.json");
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + "\n", "utf8");
console.log("Wrote", outPath);
