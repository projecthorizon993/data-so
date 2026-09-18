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
      'selected_item_ids', 'responses', 'last_item_id', 'last_value', 'last_parsed',
      'category_scores', 'composites', 'risk_tier', 'tier_escalated_by_ai', 'ai_review', 'flags']);
  }
  const d = JSON.parse(e.postData.contents);
  sheet.appendRow([
    d.timestamp || new Date().toISOString(),
    d.session_id || '',
    d.student_hash || '',
    d.bank_version || '',
    JSON.stringify(d.selected_item_ids || []),
    JSON.stringify(d.responses || []),
    (d.last && d.last.item_id) || '',
    (d.last && d.last.value) || '',
    JSON.stringify((d.last && d.last.parsed) || null),
    JSON.stringify(d.category_scores || {}),
    JSON.stringify(d.composites || {}),
    d.risk_tier || '',
    d.tier_escalated_by_ai ? 'YES' : '',
    JSON.stringify(d.ai_review || null),
    JSON.stringify(d.flags || [])
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
