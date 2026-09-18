/* AURA scorer — Block E of prompt+harness.txt. Deterministic, no LLM.
   Exposes window.AuraScore = { parseValue, scoreSession, matchItemId, ANSWER_KEY }. */
(function () {
"use strict";

// Provisional answer key for cognitive items (correctness only — NOT clinical
// cutoffs; those stay null in items.json pending counselor review). Edit freely.
const ANSWER_KEY = {
  "COG-ATT-01": { kind: "number", value: 5 },
  "COG-ATT-02": { kind: "includesAll", values: ["dog", "cat", "bird"] }, // partial credit
  "COG-ATT-03": { kind: "includes", value: "true" },
  "COG-WM-01": { kind: "digits", value: "9274" }, // 4 7 2 9 backward
  "COG-WM-02": { kind: "includesAll", values: ["mango", "chair", "river"] }, // partial credit
  "COG-WM-03": { kind: "includes", value: "blue" },
  "COG-PS-01": { kind: "number", value: 12 },
  "COG-PS-02": { kind: "digits", value: "231" }, // #=2 @=3 *=1
  "COG-PS-03": { kind: "includes", value: "now" },
  "COG-PR-01": { kind: "includes", value: "32" },
  "COG-PR-02": { kind: "includesAny", values: ["d)", "red circle"] },
  "COG-PR-03": { kind: "includes", value: "writ" }, // writing
  "COG-CF-01": { kind: "includesAny", values: ["regroup by type", "regroup", "by type"] },
  "COG-CF-02": { kind: "count", cap: 10 }, // raw recall count, normalized by cap
  "COG-CF-03": { kind: "includes", value: "green" }
};

const CRISIS_WORDS = ["hurt myself", "hurting myself", "kill myself", "killing myself",
  "suicide", "suicidal", "end my life", "end it all", "not worth living", "better off dead"];

function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function digitsOnly(s) { return String(s || "").replace(/[^0-9]/g, ""); }

// item: bank item {id, response_type, choices}; text: user reply.
// Returns {value, max} or null when unparseable (excluded from denominator).
function parseValue(item, text) {
  const t = norm(text);
  if (!t) return null;
  if (item.response_type === "choice" && Array.isArray(item.choices)) {
    // safety scale
    if (item.category === "safety_check") {
      const i = item.choices.findIndex(c => norm(c) === t || t.includes(norm(c)));
      if (i < 0) return null;
      return { value: i, max: item.choices.length - 1 };
    }
    const key = ANSWER_KEY[item.id];
    if (key && (key.kind === "includes" || key.kind === "includesAny" || key.kind === "number" || key.kind === "digits")) {
      const v = checkKey(key, t, item);
      if (v !== null) return v;
    }
    // likert-style choice → index
    const i = item.choices.findIndex(c => norm(c) === t || t === norm(c).split(" ")[0]);
    if (i >= 0) return { value: i, max: item.choices.length - 1 };
    // free-ish choice item answered in words: try includesAll partial
    if (key && key.kind === "includesAll") return partial(key.values, t);
    return null;
  }
  const key = ANSWER_KEY[item.id];
  if (!key) return null;
  return checkKey(key, t, item);
}

function checkKey(key, t, item) {
  switch (key.kind) {
    case "number": {
      const m = t.match(/-?\d+/);
      if (!m) return null;
      return { value: Number(m[0]) === key.value ? 1 : 0, max: 1 };
    }
    case "digits": {
      const d = digitsOnly(t).replace(/^0+/, "") || "0";
      const want = String(key.value).replace(/^0+/, "") || "0";
      return { value: d === want || d.split("").sort().join("") === want.split("").sort().join("") ? 1 : 0, max: 1 };
    }
    case "includes":
      return { value: t.includes(key.value) ? 1 : 0, max: 1 };
    case "includesAny":
      return { value: key.values.some(v => t.includes(v)) ? 1 : 0, max: 1 };
    case "includesAll":
      return partial(key.values, t);
    case "count": {
      const parts = t.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
      const n = parts.length <= 1 ? t.split(/\s+/).filter(w => w.length > 1).length : parts.length;
      return { value: Math.min(n, key.cap), max: key.cap };
    }
    default: return null;
  }
}

function partial(values, t) {
  const hit = values.filter(v => t.includes(v)).length;
  return { value: hit, max: values.length };
}

// Match an assistant message to a bank item (trigram-ish overlap on prompts).
function matchItemId(assistantText, bank) {
  const t = norm(assistantText);
  if (!t || !bank || !Array.isArray(bank.items)) return null;
  const words = new Set(t.split(" ").filter(w => w.length > 3));
  let best = null, bestScore = 0;
  for (const it of bank.items) {
    const pw = norm(it.prompt).split(" ").filter(w => w.length > 3);
    if (!pw.length) continue;
    let hit = 0;
    for (const w of pw) if (words.has(w)) hit++;
    const s = hit / pw.length;
    if (s > bestScore) { bestScore = s; best = it.id; }
  }
  return bestScore >= 0.3 ? best : null;
}

// records: [{item_id, user_text, response_ms}]; bank: items.json; thresholds: bank.thresholds.
// Returns {category_scores:{cat:{raw,normalized,n}}, composites:{cognitive,mental_state}, tier, flags}
function scoreSession(records, bank, thresholds) {
  const byId = {};
  for (const it of (bank.items || [])) byId[it.id] = it;
  const cats = {}; // cat -> {num, den, n}
  let safetyAnswer = null, crisisText = false;
  for (const r of records) {
    if (/ms-safe-01/i.test(r.item_id || "") || r.item_id === "MS-SAFE-01") {
      const it = byId["MS-SAFE-01"];
      const p = it ? parseValue(it, r.user_text) : null;
      if (p) safetyAnswer = p.value;
    }
    const low = norm(r.user_text);
    if (CRISIS_WORDS.some(w => low.includes(w))) crisisText = true;
    const it = byId[r.item_id];
    if (!it) continue;
    const p = parseValue(it, r.user_text);
    if (!p) continue;
    const c = cats[it.category] || (cats[it.category] = { num: 0, den: 0, n: 0 });
    c.num += (p.value ?? 0) * (it.scoring_weight || 1);
    c.den += (p.max ?? 0) * (it.scoring_weight || 1);
    c.n++;
  }
  const category_scores = {};
  for (const [k, c] of Object.entries(cats)) {
    category_scores[k] = { raw: c.num, normalized: c.den ? c.num / c.den : null, n: c.n };
  }
  const avg = (cats2) => {
    const vs = cats2.map(k => category_scores[k]?.normalized).filter(v => v !== null && v !== undefined);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  };
  const cogCats = ["attention", "working_memory", "processing_speed", "pattern_recognition", "cognitive_flexibility"];
  const composites = {
    cognitive: avg(cogCats),
    mental_state: avg(Object.keys(category_scores).filter(k => !cogCats.includes(k) && k !== "safety_check"))
  };
  const flags = [];
  if (safetyAnswer === 1) flags.push("safety_followup_needed");
  // Tier: crisis always applies; numeric tiers need counselor thresholds.
  let tier;
  if (safetyAnswer >= 2 || crisisText) tier = "crisis";
  else if (thresholds && thresholds.HIGH_THRESHOLD != null && thresholds.MID_THRESHOLD != null && thresholds.COG_LOW_THRESHOLD != null
    && composites.mental_state !== null) {
    const H = thresholds.HIGH_THRESHOLD, M = thresholds.MID_THRESHOLD, C = thresholds.COG_LOW_THRESHOLD;
    if (composites.mental_state >= H || flags.includes("safety_followup_needed")) tier = "elevated";
    else if (composites.mental_state >= M && (composites.cognitive ?? 1) <= C) tier = "elevated";
    else tier = "low";
  } else tier = "pending-thresholds";
  return { category_scores, composites, tier, flags, safetyAnswer };
}

/* ---------- Block D: buildSession(bank, prevIds) ----------
   10 cognitive (2 per category) + 2-3 per mental category (rotating 7) +
   MS-SAFE-01 exactly once mid-block; jaccard reshuffle vs prev; interleaved. */
const COG_CATS = ["attention", "working_memory", "processing_speed", "pattern_recognition", "cognitive_flexibility"];
const MENTAL_CATS = ["mood", "sleep", "energy", "anxiety_stress", "concentration", "social_connection", "self_worth"];

function sample(pool, n) {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.min(n, a.length));
}
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
function buildSession(bank, prevIds) {
  prevIds = prevIds || [];
  const items = bank.items || [];
  const byCat = {};
  for (const it of items) (byCat[it.category] || (byCat[it.category] = [])).push(it);
  let attempt = [];
  for (let r = 0; r < 4; r++) {
    const cog = [];
    for (const c of COG_CATS) cog.push(...sample(byCat[c] || [], 2).map(i => i.id));
    const mental = [];
    for (const c of MENTAL_CATS) {
      const n = 2 + Math.floor(Math.random() * 2); // 2-3
      mental.push(...sample(byCat[c] || [], n).map(i => i.id));
    }
    // interleave cognitive + mental so phase is hidden; safety mid-block
    const mixed = [];
    const A = sample(cog, cog.length), B = sample(mental, mental.length);
    while (A.length || B.length) {
      if (A.length) mixed.push(A.shift());
      if (B.length) mixed.push(B.shift());
    }
    const mid = Math.floor(mixed.length / 2);
    attempt = [...mixed.slice(0, mid), "MS-SAFE-01", ...mixed.slice(mid)];
    if (jaccard(attempt, prevIds) <= 0.7) break;
  }
  return attempt;
}

const api = { ANSWER_KEY, CRISIS_WORDS, parseValue, matchItemId, scoreSession, buildSession };
if (typeof window !== "undefined") window.AuraScore = api;
})();
