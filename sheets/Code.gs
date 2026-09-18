/**
 * AURA results receiver — paste into script.google.com, Deploy > New deployment >
 * Web app (Execute as: Me, Access: Anyone with the link), then copy the /exec URL
 * into config.json `sheetsEndpoint`. Creates/uses the `results` sheet.
 */
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('results');
  if (!sheet) {
    sheet = ss.insertSheet('results');
    sheet.appendRow(['timestamp', 'session_id', 'student_hash', 'bank_version',
      'selected_item_ids', 'responses', 'category_scores', 'composites',
      'risk_tier', 'flags']);
  }
  const d = JSON.parse(e.postData.contents);
  sheet.appendRow([
    d.timestamp || new Date().toISOString(),
    d.session_id || '',
    d.student_hash || '',
    d.bank_version || '',
    JSON.stringify(d.selected_item_ids || []),
    JSON.stringify(d.responses || []),
    JSON.stringify(d.category_scores || {}),
    JSON.stringify(d.composites || {}),
    d.risk_tier || '',
    JSON.stringify(d.flags || [])
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
