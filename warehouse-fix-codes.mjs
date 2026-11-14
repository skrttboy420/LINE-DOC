/* ============================================================
   🔢 แปลงรหัสโลเคชั่นในฐานของบอท จากรูปเก่า → รูปใหม่ (ภูม 2026-11-12)

   รูปเก่า  [แถว][ล็อก][ชั้น]   เช่น A0501 = ล็อก 5 ชั้น 1
   รูปใหม่  [แถว][ชั้น][ล็อก]   เช่น A0105 = ชั้น 1 ล็อก 5
   ภูม: *"รหัสให้ขึ้นเป็น ชั้นก่อนแล้วค่อยต่อด้วยล็อก"*

   📌 14/11: ตัวตัดหางซ้าย/ขวาย้ายไปอยู่ใน warehouse-schema.sql ข้อ ⑥ แล้ว (วางใน SQL Editor)
      สคริปต์นี้เหลือหน้าที่เดิมอย่างเดียว = สลับที่ "ล็อก/ชั้น" ของรหัสรุ่นก่อน 12/11

   ⚠️ ไม่แปลง = แถวเก่าจะแกะรหัสไม่ออก แล้ว "หายจากจอเงียบๆ"
      (A0501 ในรูปใหม่ = ชั้น 05 ซึ่งไม่มีอยู่จริง)

   🔒 แตะเฉพาะฐานของบอท (wh_placement · wh_move_log) — ไม่แตะระบบ Pacred
   วิธีใช้:  node warehouse-fix-codes.mjs            (ลองแห้ง ดูอย่างเดียว)
            node warehouse-fix-codes.mjs --apply    (เขียนจริง · สำรองก่อนเสมอ)
            node warehouse-fix-codes.mjs --undo <ไฟล์สำรอง>
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("./warehouse-layout.js");

/* อ่าน .env แบบเดียวกับตัวบอท */
for (const line of fs.readFileSync(new URL("./.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i < 1 || line.trim().startsWith("#")) continue;
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL_ || !KEY) { console.error("❌ ไม่มี SUPABASE_URL / SUPABASE_KEY ใน .env"); process.exit(1); }

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.indexOf("--undo");

/* 🪤 กับดักที่เจอจริง 12/11: ตาราง wh_* เปิด RLS ไว้แบบ "ไม่มี policy" (service_role เท่านั้น)
   ⇒ ถ้าใช้คีย์ anon อ่านจะได้ "0 แถว" เฉยๆ **ไม่มี error** แล้วสคริปต์จะสรุปว่าไม่มีอะไรต้องแปลง
      ทั้งที่ของจริงยังอยู่ครบ ⇒ ต้องฟ้องให้ดังตั้งแต่ต้น */
function roleOf(key) {
  if (/^sb_secret_/.test(key)) return "service_role";
  if (/^sb_publishable_/.test(key)) return "anon";
  try { return JSON.parse(Buffer.from(String(key).split(".")[1], "base64").toString()).role || "?"; }
  catch { return "?"; }
}
const ROLE = roleOf(KEY);
if (ROLE !== "service_role") {
  console.error("❌ คีย์ที่ใช้อยู่เป็น \"" + ROLE + "\" — ตาราง wh_* เปิด RLS ไว้แบบ service_role เท่านั้น");
  console.error("   ใช้คีย์นี้จะอ่านได้ 0 แถวโดยไม่มี error (เข้าใจผิดว่าไม่มีของ)");
  console.error("   ⇒ รันด้วย service_role key:  SUPABASE_KEY=<service_role> node warehouse-fix-codes.mjs");
  console.error("     (คัดลอกได้จาก Supabase › Project Settings › API Keys)");
  process.exit(1);
}

async function rest(pathname, init) {
  const r = await fetch(URL_ + "/rest/v1/" + pathname, {
    ...init,
    headers: {
      apikey: KEY, authorization: "Bearer " + KEY,
      "content-type": "application/json", prefer: "return=representation",
      ...(init && init.headers),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(pathname + " → " + r.status + " " + text.slice(0, 200));
  return text ? JSON.parse(text) : [];
}

/* ── ถอยกลับ ── */
if (UNDO > -1) {
  const file = process.argv[UNDO + 1];
  if (!file) { console.error("❌ บอกไฟล์สำรองด้วย"); process.exit(1); }
  const back = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const r of back.placements)
    await rest("wh_placement?tracking=eq." + encodeURIComponent(r.tracking),
      { method: "PATCH", body: JSON.stringify({ slot: r.slot, location: r.location }) });
  for (const r of back.logs)
    await rest("wh_move_log?id=eq." + r.id,
      { method: "PATCH", body: JSON.stringify({ to_slot: r.to_slot, from_slot: r.from_slot }) });
  console.log("↩️ คืนค่าเดิมแล้ว", back.placements.length, "ตำแหน่ง ·", back.logs.length, "ประวัติ");
  process.exit(0);
}

/* ── ดูของที่มีอยู่ ── */
const placements = await rest("wh_placement?select=tracking,slot,location,zone,bay,lvl,side,boxes,placed_at&limit=2000");
const logs = await rest("wh_move_log?select=id,tracking,to_slot,from_slot,action,at&order=at.desc&limit=2000");

console.log("ของบนชั้นตอนนี้:", placements.length, "แถว · ประวัติ", logs.length, "แถว\n");

/** รหัสนี้ต้องแปลงไหม — แปลงเฉพาะที่ "รูปใหม่อ่านไม่ออก แต่รูปเก่าอ่านออก" */
function planFor(code) {
  if (!code) return null;
  if (L.parseSlot(code) || L.parseLocation(code)) return null;   // อ่านออกอยู่แล้ว = ของใหม่ ไม่แตะ
  const next = L.convertOldCode(code);
  return next || "?";                                            // "?" = แปลงไม่ได้เลย
}

const plan = [];
for (const p of placements) {
  const next = planFor(p.slot);
  if (next) plan.push({ kind: "placement", tracking: p.tracking, from: p.slot, to: next });
}
const logPlan = [];
for (const g of logs) {
  const a = planFor(g.to_slot), b = planFor(g.from_slot);
  if (a || b) logPlan.push({ id: g.id, to_slot: a, from_slot: b });
}

if (!plan.length && !logPlan.length) {
  console.log("✅ ไม่มีรหัสรูปเก่าค้างอยู่ — ไม่ต้องแปลงอะไร");
  process.exit(0);
}

console.log("จะแปลง", plan.length, "ตำแหน่ง ·", logPlan.length, "ประวัติ\n");
for (const p of plan)
  console.log("  " + p.tracking + "  " + p.from + " → " + p.to +
    (p.to === "?" ? "   ⚠️ แปลงไม่ได้" : "   (" + L.slotLabel(p.to) + ")"));

const bad = plan.filter((p) => p.to === "?");
if (bad.length) { console.error("\n❌ มีรหัสที่แปลงไม่ได้", bad.length, "ตัว — หยุดไว้ก่อน ไม่เขียนอะไร"); process.exit(1); }

if (!APPLY) { console.log("\n(ลองแห้ง — ยังไม่เขียนอะไร · ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

/* ── สำรอง แล้วเขียน ── */
const dir = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), "_backup");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, "warehouse-codes-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
fs.writeFileSync(file, JSON.stringify({ placements, logs }, null, 2));
console.log("\n💾 สำรองไว้ที่", file);

for (const p of plan) {
  const s = L.parseSlot(p.to);
  await rest("wh_placement?tracking=eq." + encodeURIComponent(p.tracking), {
    method: "PATCH",
    /* เขียน location ให้ตรงกันด้วย — ไม่งั้นช่องค้นหาที่ค้นจาก location จะหาไม่เจอ */
    body: JSON.stringify({ slot: p.to, location: s.code }),
  });
}
for (const g of logPlan) {
  const patch = {};
  if (g.to_slot) patch.to_slot = g.to_slot;
  if (g.from_slot) patch.from_slot = g.from_slot;
  await rest("wh_move_log?id=eq." + g.id, { method: "PATCH", body: JSON.stringify(patch) });
}
console.log("✅ แปลงแล้ว", plan.length, "ตำแหน่ง ·", logPlan.length, "ประวัติ");
console.log("   ถอยกลับ: node warehouse-fix-codes.mjs --undo \"" + file + "\"");
