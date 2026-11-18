/**
 * 🗑 ล้าง "สมุดตำแหน่งเล่มเก่า" ของบอท — ภูม 2026-11-18
 *    *"ของเก่าในบอทลบทิ้งไปได้เลย เพราะถ้าขึ้น prod แล้วพอพนักงานยิงเข้าตรงล็อก
 *      มันก็จะเด้งในระบบโกดังเลยหนิ"*
 *
 * 🔑 ทำไมลบได้: ตั้งแต่ 11-17 ตำแหน่งของมี **ที่เดียวคือ Pacred** (`tb_forwarder.fpallet`)
 *    และ 11-18 ย้ายของที่เหลือมาอ่าน Pacred ครบแล้ว (ผัง · ช่องค้นหา · ช่องที่กล่องวางอยู่)
 *    ⇒ `wh_placement` / `wh_move_log` = เล่มที่ไม่มีใครอ่านและไม่มีใครเขียนอีกแล้ว
 *
 * 🔒 ไม่แตะ `wh_cage` — กรงเหล็กยังเป็นของบอทเหมือนเดิม (จอยังวาด · ยังเพิ่ม/เอาออกได้)
 * 🔒 ไม่แตะฐาน Pacred สักนิด (สคริปต์นี้ต่อฐานบอทเท่านั้น)
 *
 * ใช้:
 *   # ลองแห้ง (นับ + สำรองไฟล์ ไม่ลบ)
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=<service_role> node warehouse-purge-old-book.mjs
 *   # ลบจริง
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=<service_role> node warehouse-purge-old-book.mjs --apply
 *
 * 🪤 **ต้องใช้คีย์ service_role** — 2 ตารางนี้เปิด RLS ไว้โดยไม่มี policy
 *    ⇒ คีย์ anon อ่านได้ 0 แถว **แบบไม่มี error** ⇒ จะดูเหมือน "ว่างแล้ว" ทั้งที่ของยังอยู่
 *    สคริปต์จึงตรวจ role ในคีย์ก่อน และหยุดถ้าไม่ใช่ service_role (ห้ามลบบนข้อมูลที่มองไม่เห็น)
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");
const URL_ = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL_ || !KEY) {
  console.error("❌ ต้องตั้ง SUPABASE_URL + SUPABASE_SERVICE_KEY (คีย์ service_role ของฐานบอท)");
  process.exit(1);
}

/* ── ด่าน: คีย์ต้องเป็น service_role ────────────────────────────────── */
const part = KEY.split(".");
if (part.length >= 2) {
  let role = "";
  try {
    role = JSON.parse(Buffer.from(part[1], "base64url").toString("utf8")).role || "";
  } catch { /* อ่านไม่ออก = ไม่ตัดสิน */ }
  if (role && role !== "service_role") {
    console.error(
      "❌ คีย์นี้เป็น " + role + " ไม่ใช่ service_role\n" +
      "   2 ตารางนี้เปิด RLS ไม่มี policy ⇒ คีย์ anon อ่านได้ 0 แถวโดยไม่มี error\n" +
      "   ถ้าลบด้วยคีย์นี้จะขึ้นว่า 'ว่างแล้ว' ทั้งที่ของยังอยู่ — หยุดก่อน",
    );
    process.exit(1);
  }
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const TABLES = ["wh_placement", "wh_move_log"];

/* ── ① นับก่อน ─────────────────────────────────────────────────────── */
const before = {};
for (const t of TABLES) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  if (error) {
    console.error("❌ อ่าน " + t + " ไม่ได้: " + error.message + " — ไม่ลบอะไรเลย");
    process.exit(1);
  }
  before[t] = count || 0;
  console.log("  " + t.padEnd(14) + before[t] + " แถว");
}
if (TABLES.every((t) => before[t] === 0)) {
  console.log("\n✅ สมุดเก่าว่างอยู่แล้ว — ไม่มีอะไรต้องลบ");
  process.exit(0);
}

/* ── ② สำรองลงไฟล์ก่อนลบ (ลบแล้วเอาคืนไม่ได้) ──────────────────────── */
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const backup = { at: new Date().toISOString(), ref: URL_, rows: {} };
for (const t of TABLES) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select("*").range(from, from + 999);
    if (error) {
      console.error("❌ สำรอง " + t + " ไม่สำเร็จ: " + error.message + " — ไม่ลบอะไรเลย");
      process.exit(1);
    }
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  backup.rows[t] = all;
}
const file = "wh-old-book-backup-" + stamp + ".json";
fs.writeFileSync(file, JSON.stringify(backup, null, 2));
console.log("\n💾 สำรองไว้ที่ " + file + " (" + TABLES.map((t) => t + " " + backup.rows[t].length).join(" · ") + ")");

if (!APPLY) {
  console.log("\n🧪 ลองแห้ง — ยังไม่ลบ · ใส่ --apply เพื่อลบจริง");
  process.exit(0);
}

/* ── ③ ลบ ─────────────────────────────────────────────────────────── */
for (const t of TABLES) {
  const key = t === "wh_placement" ? "tracking" : "id";
  const { error } = await sb.from(t).delete().not(key, "is", null);
  if (error) {
    console.error("❌ ลบ " + t + " ไม่สำเร็จ: " + error.message);
    process.exit(1);
  }
}

/* ── ④ นับหลังลบ ─────────────────────────────────────────────────── */
console.log("");
let bad = 0;
for (const t of TABLES) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  const left = error ? "อ่านไม่ได้" : count || 0;
  const good = !error && left === 0;
  if (!good) bad++;
  console.log("  " + (good ? "✓" : "✗") + " " + t.padEnd(14) + before[t] + " → " + left + " แถว");
}
console.log(bad === 0 ? "\n✅ ล้างสมุดเก่าเรียบร้อย (wh_cage ไม่ถูกแตะ)" : "\n❌ ยังเหลือของค้าง — ดูไฟล์สำรองก่อนทำอะไรต่อ");
process.exit(bad === 0 ? 0 : 1);
