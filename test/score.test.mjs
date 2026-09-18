import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(name) {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(root, "assets", name), "utf8"), sb, { filename: name });
  return sb.window;
}
const { AuraScore: S } = load("score.js");
const bank = JSON.parse(fs.readFileSync(path.join(root, "items.json"), "utf8"));
const byId = Object.fromEntries(bank.items.map(i => [i.id, i]));
const TH = { HIGH_THRESHOLD: 0.7, MID_THRESHOLD: 0.4, COG_LOW_THRESHOLD: 0.5, status: "test" };

test("parseValue: likert + safety + numeric", () => {
  const eq = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b)); // vm-realm safe
  eq(S.parseValue(byId["MS-MOOD-01"], "A lot"), { value: 3, max: 4 });
  eq(S.parseValue(byId["MS-SAFE-01"], "Sometimes"), { value: 1, max: 3 });
  eq(S.parseValue(byId["COG-ATT-01"], "There are 5 As"), { value: 1, max: 1 });
  eq(S.parseValue(byId["COG-ATT-01"], "7"), { value: 0, max: 1 });
  assert.equal(S.parseValue(byId["MS-MOOD-01"], "zzz gibberish"), null);
});

test("scoreSession: crisis on safety Often, pending without thresholds", () => {
  const recs = [
    { item_id: "MS-MOOD-01", user_text: "A lot", response_ms: 1200 },
    { item_id: "MS-SAFE-01", user_text: "Often", response_ms: 900 },
  ];
  const r = S.scoreSession(recs, bank, bank.thresholds);
  assert.equal(r.tier, "crisis");
  const r2 = S.scoreSession([recs[0]], bank, bank.thresholds);
  assert.equal(r2.tier, "pending-thresholds");
  assert.equal(r2.composites.mental_state, 0.75);
});

test("scoreSession: numeric tiers with test thresholds", () => {
  const recs = [
    { item_id: "MS-MOOD-01", user_text: "Almost constantly", response_ms: 1 },
    { item_id: "MS-MOOD-02", user_text: "Almost constantly", response_ms: 1 },
    { item_id: "MS-SAFE-01", user_text: "No", response_ms: 1 },
  ];
  const r = S.scoreSession(recs, bank, TH);
  assert.equal(r.tier, "elevated");
  const calm = [
    { item_id: "MS-MOOD-01", user_text: "Not at all", response_ms: 1 },
    { item_id: "MS-SAFE-01", user_text: "No", response_ms: 1 },
  ];
  assert.equal(S.scoreSession(calm, bank, TH).tier, "low");
});

test("scoreSession: crisis words in free text", () => {
  const r = S.scoreSession([{ item_id: "COG-WM-03", user_text: "I want to kill myself", response_ms: 1 }], bank, TH);
  assert.equal(r.tier, "crisis");
});

test("matchItemId links assistant text to bank item", () => {
  const id = S.matchItemId("Look at this string: 'A3K9A M2A7 Q1A5 A8'. How many times does the letter 'A' appear? Reply with a number only.", bank);
  assert.equal(id, "COG-ATT-01");
  assert.equal(S.matchItemId("hello there friend", bank), null);
});

test("export payload shape (Block G)", () => {
  const { AuraExport: E } = load("export.js");
  const result = S.scoreSession([{ item_id: "MS-MOOD-01", user_text: "Somewhat", response_ms: 5 }], bank, bank.thresholds);
  const p = E.buildPayload({ sessionId: "s1", studentHash: "abc", bank, records: [{ item_id: "MS-MOOD-01", user_text: "Somewhat", response_ms: 5 }], result });
  assert.equal(p.session_id, "s1");
  assert.equal(p.risk_tier, result.tier);
  assert.ok(Array.isArray(p.selected_item_ids) && Array.isArray(p.responses));
  assert.ok(p.timestamp);
});

test("buildSession follows Block D", () => {
  const ids = S.buildSession(bank, []);
  const byId = Object.fromEntries(bank.items.map(i => [i.id, i]));
  const cog = ids.filter(id => ["attention", "working_memory", "processing_speed", "pattern_recognition", "cognitive_flexibility"].includes(byId[id]?.category));
  assert.equal(cog.length, 10); // 2 per cognitive category
  assert.equal(ids.filter(id => id === "MS-SAFE-01").length, 1); // safety exactly once
  assert.ok(ids.indexOf("MS-SAFE-01") > 0 && ids.indexOf("MS-SAFE-01") < ids.length - 1); // mid-block
  assert.ok(ids.length >= 10 + 14 + 1); // 10 cog + >=14 mental (2x7) + safety
});
