/* AURA export — hash student id + POST session payload to Google Sheets
   Apps Script web app (URL from config.json `sheetsEndpoint`).
   Exposes window.AuraExport = { hashId, buildPayload, send }. */
(function () {
"use strict";

async function hashId(plainId, salt) {
  const data = new TextEncoder().encode(String(plainId || "").trim() + "::" + String(salt || ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Block G payload. responses exclude nothing client-side; sheet owner controls sharing.
function buildPayload({ sessionId, studentHash, bank, records, result }) {
  return {
    session_id: sessionId,
    student_hash: studentHash,
    timestamp: new Date().toISOString(),
    bank_version: bank.version || "unknown",
    selected_item_ids: records.map(r => r.item_id).filter(Boolean),
    responses: records.map(r => ({ item_id: r.item_id, value: r.user_text, response_time_ms: r.response_ms ?? null })),
    category_scores: result.category_scores,
    composites: result.composites,
    risk_tier: result.tier,
    flags: result.flags
  };
}

// Fire-and-forget: Apps Script web apps don't send CORS headers, so no-cors.
async function send(endpoint, payload) {
  if (!endpoint) throw new Error("Sheets endpoint not configured (config.json → sheetsEndpoint)");
  await fetch(endpoint, {
    method: "POST", mode: "no-cors", keepalive: true,
    headers: { "content-type": "text/plain" },
    body: JSON.stringify(payload)
  });
  return true;
}

if (typeof window !== "undefined") window.AuraExport = { hashId, buildPayload, send };
})();
