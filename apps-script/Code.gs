// Quantum Gadget Hub - Influencer signup bridge
// Lives in the Apps Script project attached to the Google Form's linked Spreadsheet.
// Fires on every form submission and forwards the answers to n8n as JSON.
//
// IMPORTANT: this must run as an INSTALLABLE trigger (Triggers -> Add Trigger ->
// choose this function -> event source "From spreadsheet" -> event type "On form submit"),
// not as a simple trigger. Simple triggers (a function just named onFormSubmit) are not
// allowed to call UrlFetchApp - they have no authorization. See SETUP.md.

var WEBHOOK_URL = "https://YOUR-N8N-INSTANCE.up.railway.app/webhook/qgh-partner-signup";

function onPartnerFormSubmit(e) {
  var responses = e.namedValues || {};

  var payload = {
    name: getAnswer(responses, "Full Name"),
    phone: getAnswer(responses, "WhatsApp Number"),
    email: getAnswer(responses, "Email Address")
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log("n8n webhook responded " + response.getResponseCode() + ": " + response.getContentText());
}

function getAnswer(namedValues, questionTitle) {
  var values = namedValues[questionTitle];
  return values && values.length ? values[0] : "";
}
