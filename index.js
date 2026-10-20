// ============================================================
// LINE BOT — HS CODE ASSISTANT
// ============================================================
require("dotenv").config();
const express     = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const axios       = require("axios");
const { createClient } = require("@supabase/supabase-js");

// ============================================================
// INIT
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret:      process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);
const app        = express();

// ============================================================
// CONFIG
// ============================================================
const STAFF_LINE_ID = "0921313786"; // LINE ID ของเจ้าหน้าที่

// ============================================================
// 🤖 ผู้ช่วยงาน Pacred (ภูม 2026-08-27) — ถามสถานะการอัพข้อมูลในระบบ Pacred ผ่าน API ลับ
//    ตั้ง env เพิ่ม 2 ตัว:
//      PACRED_API_URL    = https://pacred.co.th   (โดเมนเว็บ Pacred · ไม่ต้องมี / ท้าย)
//      PACRED_API_SECRET = <secret ตัวเดียวกับที่ตั้งใน Vercel ของ Pacred>
// ============================================================
const PACRED_API_URL    = (process.env.PACRED_API_URL || "").replace(/\/+$/, "");
const PACRED_API_SECRET = process.env.PACRED_API_SECRET || "";
const PR_RED = "#B30000"; // แดงแบรนด์ Pacred

// extra = พารามิเตอร์เพิ่ม เช่น { all: 1 } สำหรับ ?q=staff&all=1 (ภูม 2026-10-20)
async function pacredGet(q, extra) {
  if (!PACRED_API_URL || !PACRED_API_SECRET) throw new Error("ยังไม่ได้ตั้ง PACRED_API_URL / PACRED_API_SECRET");
  const res = await axios.get(`${PACRED_API_URL}/api/bot`, {
    params: { q, ...(extra || {}) }, headers: { Authorization: `Bearer ${PACRED_API_SECRET}` }, timeout: 12000,
  });
  return res.data;
}

// ============================================================
// 👥 ทะเบียนพนักงาน + ด่านสิทธิ์ (ภูม 2026-10-20) — ดู staff.js
// ============================================================
const { createStaffRegistry } = require("./staff");
const { mountStaffAdmin } = require("./staff-admin");
const staffRegistry = createStaffRegistry(supabase, pacredGet);

/**
 * เจ้าของบอท — ผ่านด่านสิทธิ์เสมอ (กันล็อกตัวเองออก)
 * ตั้ง `OWNER_LINE_ID` ที่ Render · ไม่ตั้ง = ใช้ NOTIFY_TO ถ้าเป็นไลน์ส่วนตัว (ขึ้นต้น U)
 */
const OWNER_LINE_ID = (process.env.OWNER_LINE_ID || "").trim();
function isBotOwner(userId) {
  if (!userId) return false;
  if (OWNER_LINE_ID) return userId === OWNER_LINE_ID;
  const n = (process.env.NOTIFY_TO || "").trim();
  return n.startsWith("U") && userId === n;
}

// พิมพ์อะไรถึงเรียกผู้ช่วย (เมนู / อัพล่าสุด / แทรคค้าง)
function isWorkCommand(text) {
  const t = (text || "").toLowerCase();
  return /^เมนู|ผู้ช่วย|^ช่วย|อัพล่าสุด|อัปเดตล่าสุด|อัพเดทล่าสุด|^ล่าสุด|แทรคค้าง|^ค้าง|ยังไม่เข้า|งานค้าง|สรุปงาน|สถานะงาน|รอตอบพิกัด|รอพิกัด|ตอบพิกัด|งานพิกัด|^ค้นพิกัด|^หาพิกัด|^พิกัด/.test(t);
}

// 🕒 เวลาไทย (Asia/Bangkok) — Render รันบน UTC · d.getHours() = UTC ไม่ใช่เวลาไทย
// (ภูม 2026-09-01: อัพจริง 16:14 แต่บอทโชว์ 09:14 = เพี้ยน 7 ชม. · ทำ KPI เพี้ยน).
// แปลง tz ด้วย Intl → วัน/เดือน/ชม./นาที ตามเวลาในไทยจริง ไม่ว่าเซิร์ฟเวอร์อยู่โซนไหน.
function bkkParts(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t) => (f.find((p) => p.type === t) || {}).value || "";
  let hour = g("hour"); if (hour === "24") hour = "00";
  return { year: Number(g("year")), month: g("month"), day: g("day"), hour, minute: g("minute") };
}

// dd/mm/yy hh:mm (พ.ศ.) — เวลาไทย
function fmtWhen(iso) {
  if (!iso) return "-";
  const b = bkkParts(iso);
  if (!b) return String(iso);
  return `${b.day}/${b.month}/${String(b.year + 543).slice(2)} ${b.hour}:${b.minute}`;
}

// ปุ่มลัดใต้ข้อความ (Quick Reply) — กดถามซ้ำได้เร็ว
const QUICK = { items: [
  { type: "action", action: { type: "message", label: "📦 อัพล่าสุด", text: "อัพล่าสุด" } },
  { type: "action", action: { type: "message", label: "🔴 แทรคค้าง", text: "แทรคค้าง" } },
  { type: "action", action: { type: "message", label: "🧾 รอตอบพิกัด", text: "รอตอบพิกัด" } },
  /* 🔍 ภูม 2026-10-16 — ตัดปุ่ม "เมนู" ออก เอาที่ว่างมาใส่ "ค้นพิกัด"
     เหตุผล: การ์ดเมนูมีแค่ 2 ปุ่ม (อัพล่าสุด · แทรคค้าง) ซึ่ง**น้อยกว่า**ปุ่มแถวล่างที่มี 5
     ⇒ กดเมนูแล้วได้ของน้อยลง + ต้องกด 2 ครั้ง = วนอยู่กับที่
     (พิมพ์ "เมนู" ยังเรียกการ์ดได้เหมือนเดิม — แค่ไม่กินที่ปุ่มลัด) */
  { type: "action", action: { type: "message", label: "🔍 ค้นพิกัด", text: "ค้นพิกัด" } },
  { type: "action", action: { type: "message", label: "✨ Gemini", text: "Gemini: " } },
] };

function headerBox(title, color) {
  return { type: "box", layout: "vertical", backgroundColor: color || PR_RED, paddingAll: "14px",
    contents: [{ type: "text", text: title, color: "#ffffff", weight: "bold", size: "lg", wrap: true }] };
}

// การ์ดเมนู (ปุ่มเลือกหัวข้อ)
function buildMenuFlex() {
  return { type: "flex", altText: "ผู้ช่วยงาน Pacred — เลือกหัวข้อ", quickReply: QUICK, contents: {
    type: "bubble",
    header: headerBox("🤖 ผู้ช่วยงาน Pacred"),
    body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", contents: [
      { type: "text", text: "เลือกหัวข้อที่ต้องการ", size: "sm", color: "#666666" },
      { type: "button", style: "primary", color: PR_RED, height: "sm",
        action: { type: "message", label: "📦 อัพเดตล่าสุด", text: "อัพล่าสุด" } },
      { type: "button", style: "primary", color: "#e53935", height: "sm",
        action: { type: "message", label: "🔴 แทรคค้าง", text: "แทรคค้าง" } },
    ] },
  } };
}

// ── ตอบเป็น "ข้อความ" ไม่ใช่การ์ด (ภูม 2026-08-27) — กดส่งต่อ/แชร์เข้ากลุ่มไลน์ได้ ·
//    จัดให้อ่านง่าย แยกโกดังชัด กระชับแต่ครบ (เดิมการ์ดโชว์แค่ตัวล่าสุด = ดูเหมือนตู้เดียว) ──

// dd/mm hh:mm น. (กระชับ — ตัดปีออก) — เวลาไทย
function fmtWhenShort(iso) {
  if (!iso) return "-";
  const b = bkkParts(iso);
  if (!b) return String(iso);
  return `${b.day}/${b.month} ${b.hour}:${b.minute} น.`;
}

// บล็อกต่อโกดัง — โชว์ล่าสุด N รายการ (แต่ละอัน: ตู้ · กี่แทรค · เมื่อไหร่ · ใคร)
function whBlock(title, hist, maxItems = 3) {
  const recent = hist && Array.isArray(hist.recent) ? hist.recent.slice(0, maxItems) : [];
  if (recent.length === 0) return `${title}\n   — ยังไม่มี —`;
  const lines = recent.map((e) => {
    const extra = e.extra ? `  (${e.extra})` : "";
    // "ระบบ" = ระเบียนไม่มีคนประทับ (โดยเฉพาะ TTW ที่ committed_by ว่าง) — จริงๆ ภูมเป็นคนโหลด
    // → โชว์ "ภูม" ในบอท (ภูมลงกลุ่มจะได้ไม่โดนว่า) · หน้าเว็บยังโชว์ "ระบบ" ตามจริง
    const by = e.byName === "ระบบ" ? "ภูม" : e.byName;
    return `   • ตู้ ${e.label} — ${e.count} แทรค\n      🕒 ${fmtWhenShort(e.when)} · ${by}${extra}`;
  });
  return `${title}\n${lines.join("\n")}`;
}

// อัพเดตเข้าระบบ (แทรคที่ commit/เพิ่มเข้า tb_forwarder จริง) — format: เวลา · คนทำ · จำนวนแทรค
// "ระบบ" → "ภูม" ตอนบอทส่งในไลน์ (ภูม 2026-08-28 เคาะ · เหมือนส่วนแพคกิ้ง · หน้าเว็บคง "ระบบ")
function importBlock(title, hist, maxItems = 3) {
  const recent = hist && Array.isArray(hist.recent) ? hist.recent.slice(0, maxItems) : [];
  if (recent.length === 0) return `${title}\n   — ยังไม่มี —`;
  const lines = recent.map((e) => {
    const by = e.byName === "ระบบ" ? "ภูม" : e.byName;
    return `   • ${fmtWhenShort(e.when)} · ${by} · ${e.count} แทรค`;
  });
  return `${title}\n${lines.join("\n")}`;
}

function buildUploadsText(uploads, systemImport) {
  const u = uploads || {};
  const si = systemImport || {};
  const text = [
    "📦 อัปเดตล่าสุด · คีย์แพคกิ้งเข้าระบบ",
    "━━━━━━━━━━━━",
    whBlock("🚢 กวางโจว (MOMO)", u.momoPacking),
    "",
    whBlock("🧾 อี้อู (TTW)", u.yiwu),
    "",
    whBlock("📥 TTW แพคกิ้งตู้", u.ttw),
    "",
    "━━━━━━━━━━━━",
    "🚀 อัพเดตเข้าระบบล่าสุด (แทรคที่นำเข้าจริง)",
    "",
    importBlock("🚢 กวางโจว", si.guangzhou),
    "",
    importBlock("🧾 อี้อู", si.yiwu),
    "",
    "— แสดง 3 รายการล่าสุดต่อโกดัง —",
  ].join("\n");
  return { type: "text", quickReply: QUICK, text };
}

function buildPendingText(pending) {
  const p = pending || { count: 0, recent: [] };
  const list = Array.isArray(p.recent) ? p.recent.slice(0, 12) : [];
  const rows = list.map((r, i) => {
    const detail = [r.reason || "ข้อมูลไม่ครบ", r.container ? `ตู้ ${r.container}` : null]
      .filter(Boolean).join(" · ");
    return `${i + 1}. ${r.tracking}${r.pr ? ` · ${r.pr}` : ""}\n   ⏳ ${detail}`;
  });
  const more = p.count > list.length ? [`… และอีก ${p.count - list.length} แทรค`] : [];
  const text = [
    `🔴 แทรคค้าง ${p.count} รายการ`,
    "(sync มาแล้ว แต่ยังไม่นำเข้าระบบ)",
    "━━━━━━━━━━━━",
    ...rows,
    ...more,
    "",
    "💡 ส่วนใหญ่ค้างเพราะยังไม่มี น้ำหนัก/ขนาด — รอครบก่อนถึงนำเข้า",
  ].join("\n");
  return { type: "text", quickReply: QUICK, text };
}

// ============================================================
// 🧾 งานรอตอบพิกัด (ภูม 2026-10-15) — แท็บ /admin/service-orders?q=10
//    แบบ A: ตัวจับเวลาถามเว็บทุก 5 นาที
//    แบบ B: เว็บยิงมาที่ POST /pacred-hook ทันทีที่งานเข้า
//    ทั้ง 2 ทางมารวมที่ tellPending() ซึ่งกันแจ้งซ้ำให้แล้ว
// ============================================================

// ภูม 2026-10-15: "ลบชื่อรายการสินค้าออกไปก็ได้ ถ้าออเดอร์มันมาหลายรายการมันจะยิ่งเยอะจนรก"
function buildHsPendingText(hsPending, opts = {}) {
  const p = hsPending || { count: 0, orders: [] };
  const list = Array.isArray(p.orders) ? p.orders : [];
  const host = (PACRED_API_URL || "https://pacred.co.th").replace(/^https?:\/\//, "");
  const rows = list.map((o, i) => [
    (i + 1) + ". " + o.hno + (o.customerCode ? " · " + o.customerCode : "") +
      (o.customerName ? " (" + o.customerName + ")" : ""),
    "   " + o.lineCount + " รายการ · ยังไม่มีพิกัด " + o.missingHsCount,
    "   ⏱ ค้างมา " + o.waitingLabel,
    "   👉 " + host + o.path,
  ].join("\n"));
  const more = p.count > list.length ? ["… และอีก " + (p.count - list.length) + " ใบ"] : [];
  const head = opts.isNew ? "🔔 งานใหม่เข้ามา — รอตอบพิกัด" : "🧾 งานรอตอบพิกัด " + p.count + " ใบ";
  return { type: "text", quickReply: QUICK, text: [head, "━━━━━━━━━━━━"].concat(rows, more).join("\n") };
}

// ── ใครรับแจ้งเตือน ─────────────────────────────────────────
// ตั้ง env NOTIFY_TO = LINE userId (ขึ้นต้น U…) หรือ groupId (ขึ้นต้น C…)
// ไม่รู้ไอดีตัวเอง? พิมพ์ "ไอดีฉัน" ในไลน์ บอทตอบให้ แล้วก๊อปไปใส่ Render ได้เลย
const NOTIFY_TO = (process.env.NOTIFY_TO || "").trim();

// ── กันแจ้งซ้ำ (ภูมถามเอง: "บอทจะรวนไหม") ──────────────────
// B เด้งแล้ว A จะเจอใบเดิมอีกทุก 5 นาที ⇒ จำว่าบอกใบไหนไปเมื่อไหร่
// ใบเดิมเตือนซ้ำทุก 4 ชม. · ใบที่ตอบพิกัดเสร็จแล้วลืมทันที (กลับเข้าคิวใหม่ = เด้งใหม่)
const toldAt = new Map();
const REMIND_MS = 4 * 60 * 60 * 1000;
function shouldTell(hno, now) {
  const t = now || Date.now();
  const last = toldAt.get(hno);
  if (last && t - last < REMIND_MS) return false;
  toldAt.set(hno, t);
  return true;
}

/**
 * 📬 ส่งแจ้งเตือน — เข้า **แชทส่วนตัวของทุกคนที่ติ๊กหมวดนี้ไว้** (ภูม 2026-10-20)
 *
 * ภูม: *"แชทส่วนตัวของแต่ละคนสิ เพราะแต่ละคนมีไลน์ของตัวเองแล้วก็แอดไลน์บอทไปหนิ"*
 *
 * 🔒 กติกา: ส่งเฉพาะคนที่ `active` (ลาออก/ล็อก = ไม่ส่ง) — ตัวกรองอยู่ใน recipientsFor()
 * 🔁 `NOTIFY_TO` เดิมยังทำงานเหมือนเดิม — เป็น "สายตรงของภูม" ที่ได้ทุกอย่างไม่ว่าทะเบียนจะเป็นยังไง
 *    (กันวันที่ทะเบียนยังว่าง/ฐานบอทล่ม แล้วแจ้งเตือนหายไปเงียบๆ)
 *
 * @param {object} message  ข้อความไลน์
 * @param {string} category หมวด (ดู CATEGORIES ใน staff.js) · ไม่ใส่ = ส่งหา NOTIFY_TO อย่างเดียว
 */
async function pushNotify(message, category) {
  const targets = new Set();
  if (NOTIFY_TO) targets.add(NOTIFY_TO);

  if (category) {
    try {
      for (const r of await staffRegistry.recipientsFor(category)) targets.add(r.lineUserId);
    } catch (e) {
      // ฐานของบอทล่ม ≠ ห้ามแจ้ง — สายตรงของภูมยังต้องได้ (fail-SOFT)
      console.error("[notify] อ่านทะเบียนไม่ได้:", (e && e.message) || e);
    }
  }

  if (targets.size === 0) {
    console.warn("[notify] ไม่มีผู้รับ (ยังไม่ตั้ง NOTIFY_TO และไม่มีใครติ๊กหมวด " + (category || "-") + ")");
    return false;
  }

  let sent = 0;
  for (const to of targets) {
    try { await lineClient.pushMessage(to, message); sent += 1; }
    catch (e) { console.error("[notify] push ล้ม →", to, (e && e.message) || e); }
  }
  return sent > 0;
}

/** ถามเว็บแล้วเด้งเฉพาะใบที่ยังไม่เคยบอก (ใช้ร่วมกันทั้งตัวจับเวลาและตอนเว็บยิงมา) */
async function tellPending(opts) {
  const isNew = !!(opts && opts.isNew);
  let data;
  try { data = await pacredGet("hs-pending"); }
  catch (e) { console.error("[tellPending] ถามเว็บไม่ได้:", (e && e.message) || e); return; }

  const p = data && data.hsPending;
  if (!p) return;

  // 🔴 เว็บแปะสุขภาพ "ตัวดัน" (แบบ B) มาด้วย — ดันไม่ออกแล้วห้ามเงียบ
  if (data.push && data.push.broken) await pushNotify({ type: "text", text: "⚠️ " + data.push.reason }, "system");

  const orders = p.orders || [];
  const fresh = orders.filter(o => shouldTell(o.hno));
  const live = new Set(orders.map(o => o.hno));
  for (const hno of Array.from(toldAt.keys())) if (!live.has(hno)) toldAt.delete(hno);

  if (fresh.length === 0) return;
  await pushNotify(buildHsPendingText({ count: p.count, orders: fresh }, { isNew: isNew }), "hs_pending");
}

// ⏱ แบบ A — ถามเว็บทุก 5 นาที (ภูมเคาะ 2026-10-15)
const PENDING_POLL_MS = 5 * 60 * 1000;
// 👥 2026-10-20 — เดิมเปิดเฉพาะตอนตั้ง NOTIFY_TO · ตอนนี้คนในทะเบียนก็เป็นผู้รับได้ ⇒ เปิดเสมอ
setInterval(function () {
  tellPending().catch(e => console.error("[poll]", (e && e.message) || e));
}, PENDING_POLL_MS);
console.log("⏱ เช็คงานรอตอบพิกัดทุก " + (PENDING_POLL_MS / 60000) + " นาที");
if (!NOTIFY_TO) {
  console.warn("⚠️ ยังไม่ได้ตั้ง NOTIFY_TO — สายตรงปิดอยู่ (ยังส่งหาคนในทะเบียนที่ติ๊กหมวดไว้ได้ปกติ)");
}

// 🔄 กวาดทะเบียนให้ตรงกับเว็บวันละครั้ง — ใครลาออกแล้วจะถูกปิดสิทธิ์เอง (ภูม 2026-10-20)
//    อ่านเว็บไม่สำเร็จ = ไม่แตะอะไร (ดู syncFromPacred) ⇒ เน็ตล่มไม่ตัดสิทธิ์ทั้งบริษัท
const STAFF_SYNC_MS = 24 * 60 * 60 * 1000;
setInterval(function () {
  staffRegistry.syncFromPacred()
    .then(r => console.log("[staff-sync]", JSON.stringify(r)))
    .catch(e => console.error("[staff-sync]", (e && e.message) || e));
}, STAFF_SYNC_MS);

/**
 * แปลง error จากการถามเว็บ Pacred เป็นข้อความที่บอกว่า "ติดตรงไหน"
 *
 * 🔴 ภูม 2026-10-15 เจอจริง: ข้อความเดิมบอกว่า "ยังไม่ได้ตั้งค่า PACRED_API_URL/SECRET"
 *    ทั้งที่ตั้งแล้ว — ของจริงคือเว็บ prod ยังไม่ได้ push โค้ดที่มีท่อใหม่
 *    ⇒ ภูมไปไล่หาผิดที่ · ข้อความที่เดาสาเหตุให้ = พาไปผิดทาง
 */
function explainPacredError(err) {
  const code = err?.response?.status;
  const body = err?.response?.data;
  const msg  = (body && (body.error || body.message)) || "";

  if (!PACRED_API_URL || !PACRED_API_SECRET)
    return "⚠️ บอทยังไม่ได้ตั้งค่าเชื่อมเว็บ Pacred\n(ที่ Render ต้องมี PACRED_API_URL และ PACRED_API_SECRET)";

  if (code === 401)
    return "🔑 รหัสเชื่อมเว็บไม่ตรงกัน\nPACRED_API_SECRET ที่ Render ต้องเป็นตัวเดียวกับ PACRED_BOT_SECRET ที่ Vercel";

  if (code === 400 && /unknown q/i.test(String(msg)))
    return "🚧 เว็บ Pacred ยังไม่มีฟีเจอร์นี้\nโค้ดใหม่ยังไม่ได้ขึ้นเว็บจริง (รอ push ขึ้น main + deploy)\nคำสั่งเดิม เช่น 'แทรคค้าง' ยังใช้ได้ปกติ";

  if (code === 503)
    return "🚧 เว็บ Pacred ยังไม่เปิดทางให้บอท (ยังไม่ได้ตั้ง PACRED_BOT_SECRET ที่ Vercel)";

  if (code === 500)
    return "⚠️ เว็บ Pacred อ่านข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง";

  if (!code) return "⚠️ ต่อเว็บ Pacred ไม่ติด (เน็ตสะดุด/เว็บไม่ตอบ) ลองใหม่อีกครั้ง";
  return "⚠️ เว็บ Pacred ตอบ " + code + (msg ? " (" + msg + ")" : "") + " — ลองใหม่อีกครั้ง";
}

// ══════════════════════════════════════════════════════════════
// 🔍 ค้นพิกัดจากคลังของ Pacred (ภูม 2026-10-16)
//
// ภูม: *"เพิ่มปุ่มค้นพิกัดในแถวล่าง → กดแล้วบอทตอบ 'พิมพ์ชื่อสินค้ามาได้เลย'
//        → คนรู้ทันทีว่าต้องทำอะไร"*
//
// 🔑 **คลังพิกัดมีที่เดียว = ฐานข้อมูลของเว็บ Pacred** (1,818 พิกัด) — บอทไม่มีคลังของตัวเอง
//    บอทแค่ส่งคำไปถาม `/api/bot?q=hs-search` แล้วเอาผลมาพิมพ์ตอบ
//    ต่างจากปุ่ม ✨ Gemini ที่ให้ AI เดาพิกัดให้ (ไม่ได้ดูจากคลังเรา)
// ══════════════════════════════════════════════════════════════

/** ลิงก์หน้าคลังพิกัดบนเว็บ — เผื่อคนอยากไปดู/แก้/เพิ่มเอง */
function hsLibraryLink() {
  const base = String(PACRED_API_URL || "").replace(/\/+$/, "");
  return base ? base + "/admin/accounting/hs-library" : "";
}

/** ผลค้นพิกัด → ข้อความไลน์ (ส่งต่อเข้ากลุ่มได้ · ไม่ใช่การ์ด) */
function buildHsSearchText(name, r) {
  const items = (r && r.hits) || [];   // ท่อฝั่งเว็บคืนชื่อ hits (ไม่ใช่ items)
  if (items.length === 0) {
    return { type: "text", quickReply: QUICK, text: [
      `🔍 ค้นพิกัด "${name}"`,
      "━━━━━━━━━━━━",
      "ไม่เจอในคลังพิกัดของเรา",
      "",
      "ลองพิมพ์คำสั้นลง หรือคำที่ทีมเรียกจริง เช่น \"ปั๊มลม\" แทน \"เครื่องปั๊มลมไฟฟ้า\"",
      "ถ้าอยากให้ AI ช่วยเดา พิมพ์  Gemini: " + name,
    ].join("\n") };
  }
  const rows = items.map((it, i) => {
    const parts = [`${i + 1}. ${it.code}  ${it.nameTh || "-"}`];
    const sub = [];
    if (it.dutyPct !== null && it.dutyPct !== undefined) sub.push("อากร " + it.dutyPct + "%");
    if (it.formEPct !== null && it.formEPct !== undefined) sub.push("Form E " + it.formEPct + "%");
    if (it.statCode) sub.push("สถิติ " + it.statCode);
    if (sub.length) parts.push("   " + sub.join(" · "));
    const tail = [];
    // ยิ่งเคยยิงใบขนมาก = ยิ่งเชื่อได้ (ของจริงผ่านด่านมาแล้ว)
    if (it.declCount) tail.push("เคยยิงใบขน " + it.declCount + " ครั้ง");
    // บอกว่า "เจอเพราะชื่อไหน" — คนจะได้รู้ว่าคลังเก็บชื่อนี้ไว้ว่าอะไร
    if (it.matchedName && it.matchedName !== it.nameTh) tail.push("เจอเพราะชื่อ \"" + it.matchedName + "\"");
    if (tail.length) parts.push("   " + tail.join(" · "));
    return parts.join("\n");
  });
  const link = hsLibraryLink();
  const near = (r.nearbyNames || []).filter((n) => n && n !== name).slice(0, 5);
  const tail = []
    .concat(near.length ? ["", "คำใกล้เคียงในคลัง: " + near.join(" · ")] : [])
    .concat(link ? ["", "📚 ดู/แก้ในคลัง: " + link] : []);
  return { type: "text", quickReply: QUICK, text: [
    `🔍 ค้นพิกัด "${name}" — เจอ ${r.total || items.length} รายการ`,
    "━━━━━━━━━━━━",
  ].concat(rows, tail).join("\n") };
}

/** ถามชื่อสินค้า (กดปุ่มค้นพิกัดเฉยๆ ยังไม่พิมพ์ชื่อ) */
function askHsName() {
  return { type: "text", quickReply: QUICK, text: [
    "🔍 ค้นพิกัดจากคลังของเรา",
    "",
    "พิมพ์ชื่อสินค้ามาได้เลยครับ เช่น",
    "   ปั๊มลม",
    "   ค้นพิกัด ถุงมือยาง",
    "",
    "(ค้นจากคลังพิกัดของ Pacred — ชื่อที่ทีมเราเคยใช้จริง)",
  ].join("\n") };
}

async function handleHsSearch(event, name, userId) {
  if (!name) {
    if (userId) await setState(userId, "hs_search_wait", {});
    return lineClient.replyMessage(event.replyToken, askHsName());
  }
  try {
    const r = await pacredGet("hs-search", { name, limit: 5 });
    if (userId) await clearState(userId);
    return lineClient.replyMessage(event.replyToken, buildHsSearchText(name, r && r.hsSearch));
  } catch (err) {
    console.error("[handleHsSearch]", err?.response?.data || err.message);
    if (userId) await clearState(userId);
    return lineClient.replyMessage(event.replyToken, { type: "text", quickReply: QUICK, text: explainPacredError(err) });
  }
}

async function handleWorkAssistant(event, keyword) {
  const t = (keyword || "").toLowerCase();
  try {
    if (/^เมนู|ผู้ช่วย|^ช่วย/.test(t))
      return lineClient.replyMessage(event.replyToken, buildMenuFlex());
    if (/^ค้นพิกัด|^หาพิกัด|^พิกัด/.test(t)) {
      // "ค้นพิกัด ถุงมือยาง" = ค้นเลย · "ค้นพิกัด" เฉยๆ = ถามชื่อก่อน
      const name = (keyword || "").replace(/^(ค้นพิกัด|หาพิกัด|พิกัด)s*/i, "").trim();
      return handleHsSearch(event, name, event.source && event.source.userId);
    }
    if (/รอตอบพิกัด|รอพิกัด|ตอบพิกัด|งานพิกัด/.test(t)) {
      const r = await pacredGet("hs-pending");
      const hp = r && r.hsPending;
      if (!hp || hp.count === 0)
        return lineClient.replyMessage(event.replyToken, { type: "text", quickReply: QUICK, text: "✅ ไม่มีงานรอตอบพิกัด — เคลียร์หมดแล้ว" });
      return lineClient.replyMessage(event.replyToken, buildHsPendingText(hp));
    }
    if (/แทรคค้าง|ยังไม่เข้า|งานค้าง|^ค้าง/.test(t)) {
      const { pending } = await pacredGet("pending");
      if (!pending || pending.count === 0)
        return lineClient.replyMessage(event.replyToken, { type: "text", quickReply: QUICK, text: "✅ ไม่มีแทรคค้าง — MOMO ที่ sync มา นำเข้าระบบครบแล้ว" });
      return lineClient.replyMessage(event.replyToken, buildPendingText(pending));
    }
    const { uploads, systemImport } = await pacredGet("uploads");
    return lineClient.replyMessage(event.replyToken, buildUploadsText(uploads, systemImport));
  } catch (err) {
    console.error("[handleWorkAssistant]", err?.response?.data || err.message);
    return lineClient.replyMessage(event.replyToken, { type: "text", text: explainPacredError(err) });
  }
}

// ============================================================
// STATE MACHINE  (Supabase: conversation_state)
// ============================================================
async function setState(userId, state, data = {}) {
  // ลบก่อนเสมอ แล้ว insert ใหม่ — หลีกเลี่ยง upsert conflict key issue
  await supabase.from("conversation_state").delete().eq("user_id", userId);
  const { error } = await supabase.from("conversation_state").insert({
    user_id: userId,
    state,
    data,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[setState] error:", error);
  else console.log(`[setState] userId=${userId} state=${state} data=${JSON.stringify(data)}`);
}

async function getState(userId) {
  const { data, error } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) { console.error("[getState] error:", error); return null; }
  console.log(`[getState] userId=${userId} state=${data?.state || "null"}`);
  return data || null;
}

async function clearState(userId) {
  await supabase
    .from("conversation_state")
    .delete()
    .eq("user_id", userId);
}

// ============================================================
// SUPABASE — HS CODE HELPERS
// ============================================================
async function searchHS(keyword) {
  const { data, error } = await supabase
    .from("hs_codes")
    .select("*")
    .or(`th.ilike.%${keyword}%,en.ilike.%${keyword}%,hs_code.ilike.%${keyword}%`)
    .limit(20);
  if (error) { console.error("searchHS error:", error); return []; }
  return data || [];
}

async function addNewHSRow(row) {
  const { error } = await supabase.from("hs_codes").insert(row);
  if (error) console.error("addNewHSRow error:", error);
  return !error;
}

// ============================================================
// CONVERSATION HISTORY  (Supabase: conversation_history)
// ============================================================
async function saveMessage(userId, role, content) {
  await supabase.from("conversation_history").insert({ user_id: userId, role, content });
}

async function loadHistory(userId, limit = 10) {
  const { data } = await supabase
    .from("conversation_history")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

// ============================================================
// RISK SCANNER
// ============================================================
const RISK_KEYWORDS = [
  { keyword: "LED",         reason: "สินค้าเกี่ยวกับแสงสว่าง/อิเล็กทรอนิกส์ มักถูกสุ่มตรวจ", level: "สูง" },
  { keyword: "เลเซอร์",     reason: "เลเซอร์เป็นสินค้าควบคุมหลายประเภท",                   level: "สูง" },
  { keyword: "laser",       reason: "เลเซอร์เป็นสินค้าควบคุมหลายประเภท",                   level: "สูง" },
  { keyword: "wireless",    reason: "อุปกรณ์ไร้สายอาจเกี่ยวข้องกับ กสทช./มาตรฐานสัญญาณ",  level: "กลาง" },
  { keyword: "bluetooth",   reason: "อุปกรณ์ไร้สายอาจเกี่ยวข้องกับ กสทช./มาตรฐานสัญญาณ",  level: "กลาง" },
  { keyword: "battery",     reason: "แบตเตอรี่เป็นสินค้าที่มักถูกตรวจเรื่องความปลอดภัย",   level: "กลาง" },
  { keyword: "แบตเตอรี่",   reason: "แบตเตอรี่เป็นสินค้าที่มักถูกตรวจเรื่องความปลอดภัย",   level: "กลาง" },
  { keyword: "เครื่องมือแพทย์", reason: "เข้าข่ายสินค้าควบคุม อย./ใบอนุญาตเฉพาะ",          level: "สูง" },
  { keyword: "medical",     reason: "เข้าข่ายสินค้าควบคุม อย./ใบอนุญาตเฉพาะ",             level: "สูง" },
  { keyword: "ของเล่น",     reason: "ของเล่นเด็กมักเกี่ยวข้องกับมาตรฐานความปลอดภัย",      level: "กลาง" },
  { keyword: "toy",         reason: "ของเล่นเด็กมักเกี่ยวข้องกับมาตรฐานความปลอดภัย",      level: "กลาง" },
  { keyword: "ไฟฟ้า",       reason: "สินค้าไฟฟ้ามักเกี่ยวข้องกับ มอก. และความปลอดภัย",    level: "กลาง" },
  { keyword: "electrical",  reason: "สินค้าไฟฟ้ามักเกี่ยวข้องกับมาตรฐานความปลอดภัย",      level: "กลาง" },
];

function analyzeRisk(text) {
  const hits = RISK_KEYWORDS.filter(r =>
    text.toUpperCase().includes(r.keyword.toUpperCase())
  );

  if (hits.length === 0) {
    return { level: "ต่ำ", message: "✅ ไม่พบคำที่เข้าข่ายความเสี่ยงชัดเจนจากชื่อสินค้า" };
  }

  const finalLevel = hits.some(h => h.level === "สูง") ? "สูง"
                   : hits.some(h => h.level === "กลาง") ? "กลาง"
                   : "ต่ำ";

  const icon = finalLevel === "สูง" ? "🚨" : finalLevel === "กลาง" ? "⚠️" : "✅";
  const reasons = hits.map(h => `• พบ "${h.keyword}" → ${h.reason}`).join("\n");

  return {
    level: finalLevel,
    message: `${icon} ความเสี่ยงจากชื่อสินค้า: ${finalLevel}\n${reasons}`,
  };
}

// ============================================================
// FLEX MESSAGE BUILDERS
// ============================================================

/** แสดงผลการค้นหาจาก DB */
function buildHSFlex(results, riskInfo, keyword) {
  const top = results.slice(0, 3);

  const headerBubble = {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1A1A2E",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "🔍 HS CODE", weight: "bold", size: "md", color: "#E0E0FF" },
        { type: "text", text: `คำค้น: ${keyword}`, size: "xs", color: "#AAAACC", margin: "sm", wrap: true },
        {
          type: "text",
          text: `ความเสี่ยง: ${riskInfo.level === "สูง" ? "🚨 สูง" : riskInfo.level === "กลาง" ? "⚠️ กลาง" : "✅ ต่ำ"}`,
          size: "xs",
          color: riskInfo.level === "สูง" ? "#FF6B6B" : riskInfo.level === "กลาง" ? "#FFD93D" : "#6BCB77",
          margin: "sm",
        },
      ],
    },
  };

  const itemBubbles = top.map((item, i) => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      backgroundColor: "#16213E",
      contents: [
        {
          type: "text",
          text: `#${i + 1}  ${item.hs_code || "-"}`,
          weight: "bold",
          size: "sm",
          color: "#E0E0FF",
          wrap: true,
        },
        { type: "separator", margin: "sm", color: "#2A2A4A" },
        {
          type: "box", layout: "vertical", margin: "sm", spacing: "xs",
          contents: [
            { type: "text", text: `🇹🇭 ${item.th || "-"}`,  size: "sm", color: "#CCCCEE", wrap: true },
            { type: "text", text: `🌐 ${item.en || "-"}`,  size: "xs", color: "#9999BB", wrap: true },
            ...(item.no && item.no !== "-" ? [{ type: "text", text: `📋 NO: ${item.no}`, size: "xs", color: "#9999BB" }] : []),
            ...(item.fe && item.fe !== "-" ? [{ type: "text", text: `🤝 FE: ${item.fe}`, size: "xs", color: "#9999BB" }] : []),
            ...(item.note && item.note !== "-" ? [{ type: "text", text: `📝 ${item.note}`, size: "xxs", color: "#777799", wrap: true }] : []),
          ],
        },
      ],
    },
  }));

  return {
    type: "flex",
    altText: `ผลการค้นหา HS CODE: ${keyword}`,
    contents: {
      type: "carousel",
      contents: [headerBubble, ...itemBubbles],
    },
  };
}

/** แสดงเมื่อไม่พบข้อมูลใน DB → มีปุ่ม "ให้ AI วิเคราะห์" */
function buildNoResultFlex(keyword, riskInfo) {
  return {
    type: "flex",
    altText: `ไม่พบ "${keyword}" ในฐานข้อมูล`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1A1A2E",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "❓ ไม่พบข้อมูลในฐาน HS CODE", weight: "bold", size: "sm", color: "#E0E0FF", wrap: true },
          { type: "text", text: `คำค้น: ${keyword}`, size: "xs", color: "#AAAACC", margin: "sm", wrap: true },
          { type: "separator", margin: "md", color: "#2A2A4A" },
          {
            type: "text",
            text: riskInfo.level === "สูง" ? "🚨 ความเสี่ยงสูง — ควรให้ AI ตรวจสอบ"
                : riskInfo.level === "กลาง" ? "⚠️ ความเสี่ยงปานกลาง"
                : "✅ ความเสี่ยงต่ำ",
            size: "xs",
            color: riskInfo.level === "สูง" ? "#FF6B6B" : riskInfo.level === "กลาง" ? "#FFD93D" : "#6BCB77",
            margin: "sm",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        backgroundColor: "#16213E",
        contents: [{
          type: "button",
          style: "primary",
          color: "#4361EE",
          height: "sm",
          action: {
            type: "message",
            label: "🤖 ให้ AI วิเคราะห์แทน",
            text: `Al:${keyword}`,
          },
        }],
      },
    },
  };
}

// ============================================================
// GROQ AI
// ============================================================
const AI_SYSTEM_PROMPT = `
กำหนดให้คุณเป็น "เพื่อนร่วมงานสายลุยด่านศุลกากร" ที่เชี่ยวชาญด้านการนำเข้า–ส่งออก
โดยเฉพาะการวิเคราะห์พิกัดศุลกากรไทย (HS CODE) ตามโครงสร้างพิกัดกรมศุลกากรไทย อิงจาก HS 2022 (HH22)

บริบทงาน:
- นำเข้าสินค้าจากจีนเข้าไทย (ทางเรือ รถ เครื่องบิน)
- อ้างอิงพิกัดและอัตราอากรตามกรมศุลกากรไทย
- คำนึงถึงสิทธิพิเศษ FORM E, ACFTA และข้อห้าม/ข้อจำกัด
- พิจารณาว่าสินค้า "ติดกรม" หรือไม่ (อย., มอก., กสทช., กรมโรงงาน ฯลฯ)
- มุมมอง "บริษัทเฟรทสนิทเจ้าหน้าที่" — เลี่ยงความเสี่ยงอย่างชาญฉลาด ไม่ชี้นำผิดกฎหมาย

บุคลิก: เพื่อนร่วมงานกวนๆ พูดตรง มีมุก แต่ต้องมีสาระและชัดเจน โฟกัสที่ลดความเสี่ยงและจัดการเอกสาร

เมื่อได้รับชื่อสินค้า ให้ตอบตาม Template ด้านล่างนี้เท่านั้น:

📦 สินค้า:
- ชื่อไทย: [ชื่อไทยที่แนะนำสำหรับใบขน]
- ชื่ออังกฤษ: [ชื่ออังกฤษที่แนะนำ]

📘 พิกัดศุลกากรที่แนะนำ:
- HS CODE: [รหัส HS หรือ "ต้องตรวจสอบเพิ่มเติม"]
- คำอธิบายพิกัด: [อธิบายสั้นๆ]

💰 อัตราอากร:
- อากรขาเข้า (STAT 000): [% หรือ "ต้องตรวจสอบ"]
- สิทธิ FORM E / FTA: [ใช้ได้/ใช้ไม่ได้/มีโอกาส + เหตุผล]
- หมายเหตุ: [เงื่อนไขพิเศษ ถ้ามี]

🚨 ความเสี่ยง & ติดกรม:
- ระดับความเสี่ยง: ต่ำ / กลาง / สูง
- หน่วยงานที่อาจเกี่ยวข้อง: [อย., มอก., กสทช., ฯลฯ หรือ "ไม่พบชัดเจน"]
- ใบอนุญาต/มาตรฐาน: [ถ้ามี]
- ข้อควรระวัง: [คำเตือนสั้นๆ]

🧩 ทางเลือก/เล่ห์เหลี่ยมเชิงเทคนิค:
- วิธีเขียนชื่อสินค้าในใบขนให้เนียน: [ตัวอย่าง]
- พิกัดทางเลือก: [HS + เหตุผล หรือ "ไม่มี"]

📎 หมายเหตุ: การประเมินนี้เป็นแนวทางเบื้องต้นเท่านั้น การตัดสินใจสุดท้ายขึ้นกับด่านและเจ้าหน้าที่
`.trim();

// ============================================================
// ✨ Gemini (ภูม 2026-10-15) — ปุ่มที่ 2 ข้าง "ค้นหาในคลัง"
//
//    ภูม: "อาจจะมีเพิ่มเติมด้วยเพราะ มันจะมีการอัพเดตจากนายตรวจบ้าง กรมศุลบ้าง"
//    ⇒ prompt อยู่ตรงนี้ที่เดียว แก้แล้ว push = Render deploy ให้เอง
//
//    env ที่ต้องตั้งที่ Render:
//      GEMINI_API_KEY = key จาก Google AI Studio
//      GEMINI_MODEL   = ไม่ตั้งก็ได้ (ค่าเริ่มต้นด้านล่าง)
//    🔴 โมเดลของ Google หมดอายุได้ — 15/10 พบว่า gemini-2.0-flash ตายแล้ว
//       (API ตอบ 404 พร้อมบอกชื่อรุ่นใหม่) ⇒ เปลี่ยนที่ env ได้โดยไม่ต้องแก้โค้ด
// ============================================================
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
// 🔴 วัดจริง 2026-10-15 (key ของภูม = free tier) — รุ่นไหนใช้ได้บ้าง:
//      gemini-flash-lite-latest  ✅ 6.3 วิ   ← เร็วและใช้ได้จริง
//      gemini-3.8-flash          ❌ 503 แน่นตลอด
//      gemini-flash-latest       ❌ ช้าเกิน 60 วิ
//      gemini-pro-latest         ❌ 429 เกินโควตา
//      gemini-2.5-*              ❌ 404 ปิดบริการแล้ว
//    ⇒ รุ่นของ Google ตาย/แน่นได้ตลอด ⇒ มีรุ่นสำรองไล่ลงมา + เปลี่ยนที่ env ได้
const GEMINI_MODEL   = (process.env.GEMINI_MODEL || "gemini-flash-lite-latest").trim();
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ||
  "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-latest").split(",").map(x => x.trim()).filter(Boolean);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);

// 📝 prompt ของภูม — แก้ตรงนี้ได้เลยเมื่อนายตรวจ/กรมศุลเปลี่ยนกติกา
const GEMINI_SYSTEM_PROMPT = `คุณคือผู้เชี่ยวชาญระดับสูงด้านโลจิสติกส์ ชิปปิ้ง และการนำเข้าสินค้าจากจีนมาไทย สไตล์การคุยของคุณคือเป็นกันเอง ตรงไปตรงมาเหมือนเพื่อนสนิท (เรียกฉันว่า 'เพื่อน' เสมอ) และเน้นข้อมูลที่ใช้งานได้จริง ไม่ต้องเกริ่นนำยืดยาว

ทุกครั้งที่ฉันพิมพ์ชื่อสินค้าเข้ามา หน้าที่ของคุณคือ:

สร้าง ตาราง Markdown สรุปข้อมูลทันที โดยมีคอลัมน์: [รายการสินค้า | พิกัดอ้างอิง (HS Code) | อากรปกติ | Form E (ต้องเป็น 0% เสมอ) | ข้อควบคุมหน้าด่าน (เช่น มอก., อย., กสทช.)]

ใต้ตาราง ให้ทำ Bullet Points สรุป 'ข้อควรระวังระดับวิกฤตและทริคโลจิสติกส์' โดยใช้ Emoji นำหน้า เช่น:

🔴 ด่านใบอนุญาต: วิเคราะห์ความเสี่ยง อย., สมอ. (มอก.), กสทช., กรมปศุสัตว์ หรือด่านลิขสิทธิ์

📝 ทริคสำแดงชื่อ: แนะนำชื่อภาษาอังกฤษ/ไทย ที่ควรใช้ใน Invoice เพื่อให้รอด Red Line และปลอดภัยที่สุด

📦 การขนส่ง & แพ็กกิ้ง: วิเคราะห์ว่าสินค้าคิดค่าส่งทางเรือแบบไหน (เหมาคิว CBM หรือ เหมาน้ำหนัก Ton) และแนะนำวิธีให้โรงงานแพ็กเพื่อประหยัดค่าขนส่งมากที่สุด

ปิดท้ายด้วยคำถามสั้นๆ 1 คำถามเพื่อชวนคุยถึงแผนการตลาดหรือการนำเข้าลอตนี้`;

async function askGemini(productName, hintNames) {
  if (!GEMINI_API_KEY) throw new Error("ยังไม่ได้ตั้ง GEMINI_API_KEY");
  // ชื่อใกล้เคียงที่คลังรู้จัก — ช่วยให้ AI เดาน้อยลง (ว่างได้)
  const hint = (hintNames && hintNames.length)
    ? "\n\n(ชื่อที่ระบบเราเคยใช้เรียกของแบบนี้: " + hintNames.slice(0, 6).join(" · ") + ")"
    : "";

  // 🔴 Gemini ตอบ 503/429 บ่อยเวลาฝั่ง Google แน่น (เจอจริงตอนทดสอบ 15/10)
  //    ไม่ลองซ้ำ = ภูมเจอ "ตอบไม่ได้" ทั้งที่ของใช้ได้ ⇒ ลองใหม่ 3 ครั้ง ห่างขึ้นเรื่อยๆ
  // ไล่: รุ่นหลักลอง 2 ครั้ง → ถ้ายังไม่ไหวค่อยเปลี่ยนรุ่นสำรอง (แต่ละรุ่นลองครั้งเดียว)
  const plan = [GEMINI_MODEL, GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];
  let lastErr;
  for (let attempt = 1; attempt <= plan.length; attempt++) {
    const model = plan[attempt - 1];
    try {
      const res = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: productName + hint }] }],
        },
        { params: { key: GEMINI_API_KEY }, headers: { "content-type": "application/json" }, timeout: GEMINI_TIMEOUT_MS },
      );
      const parts = res.data?.candidates?.[0]?.content?.parts || [];
      const text  = parts.map(p => p.text || "").join("").trim();
      if (!text) throw new Error("Gemini ตอบกลับว่าง");
      return text;
    } catch (e) {
      lastErr = e;
      const code = e?.response?.status;
      // ลองต่อเฉพาะที่ลองแล้วมีโอกาสผ่าน (แน่น/เกินโควตา/รุ่นปิด/เน็ตสะดุด)
      const worthRetry = code === 503 || code === 429 || code === 500 || code === 404 || !code;
      if (!worthRetry || attempt === plan.length) break;
      const next = plan[attempt];
      console.warn("[askGemini] " + model + " ไม่ไหว (HTTP " + (code || "ไม่มีรหัส") + ") → ลอง " + next);
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  const code = lastErr?.response?.status;
  const tried = "ลองมาแล้ว " + plan.length + " รอบ";
  throw new Error(
    code === 503 ? "Gemini แน่นอยู่ทุกรุ่น (" + tried + ") ลองใหม่อีกครั้ง"
    : code === 429 ? "โควตา Gemini เต็มแล้ว (" + tried + ") รอสักพักแล้วลองใหม่"
    : (lastErr?.message || "เรียก Gemini ไม่สำเร็จ"));
}

/**
 * ปุ่ม Gemini — วิเคราะห์พิกัดด้วย AI (ไม่ใช่คำตอบจากคลัง)
 *
 * 🔴 ภูม 2026-10-15: *"มันไม่ตอบไรเลยอะ"* → log บอก `timeout of 30000ms exceeded`
 *    ต้นเหตุจริงคือ **replyToken ของ LINE มีอายุสั้น (~30 วิ)** แต่ Gemini คิด 15–40 วิ
 *    ⇒ รอคำตอบแล้วค่อย reply = ไม่ทันเกือบทุกครั้ง (ยิ่งบน Render Free Tier ที่เพิ่งตื่น)
 *
 *    ⇒ แก้ด้วยการ **ตอบรับทันทีด้วย replyToken** ("กำลังวิเคราะห์…")
 *       แล้วค่อยส่งคำตอบจริงด้วย pushMessage ตอน Gemini ตอบเสร็จ (ไม่ติดเพดานเวลา)
 */
async function handleGeminiAnalysis(event, productName) {
  const to = event.source.userId || event.source.groupId || event.source.roomId;

  if (!GEMINI_API_KEY) {
    return lineClient.replyMessage(event.replyToken, { type: "text", text:
      "🔑 ยังไม่ได้ใส่ GEMINI_API_KEY ที่ Render\n(Render → line-bot-fms2 → Environment → Add)\nระหว่างนี้พิมพ์ชื่อสินค้าเฉยๆ เพื่อค้นในคลังได้" });
  }

  // ตอบรับก่อน — ใช้ replyToken ตอนที่ยังสดอยู่
  await lineClient.replyMessage(event.replyToken, { type: "text",
    text: "✨ กำลังให้ Gemini วิเคราะห์ \"" + productName + "\" …\n(ใช้เวลาราว 15–40 วินาที เดี๋ยวส่งมาให้)" });

  // แล้วค่อยทำงานจริง — ส่งผลด้วย push (ไม่ติดเพดานเวลาของ replyToken)
  try {
    // เอาชื่อใกล้เคียงจากคลังไปช่วย prompt (คลังของบอท — ภูมเลือกข้อ ข 15/10)
    let hints = [];
    try {
      const rows = await searchHS(productName);
      hints = rows.map(r => r.th).filter(Boolean).slice(0, 6);
    } catch (_) { /* หาไม่ได้ก็ไม่เป็นไร */ }

    const reply = await askGemini(productName, hints);
    // 🔒 พิกัดผิด = ภาษีผิด ⇒ ติดป้ายเสมอว่านี่คือคำแนะนำของ AI ยังไม่ยืนยัน
    const text = ["✨ Gemini วิเคราะห์: " + productName, "⚠️ AI แนะนำ — ยังไม่ยืนยัน ตรวจกับกรมศุลก่อนใช้จริง", "━━━━━━━━━━━━", "", reply].join("\n").slice(0, 4900);
    return lineClient.pushMessage(to, { type: "text", quickReply: QUICK, text: text });
  } catch (err) {
    console.error("[handleGeminiAnalysis]", (err && err.response && JSON.stringify(err.response.data).slice(0, 200)) || (err && err.message) || err);
    return lineClient.pushMessage(to, { type: "text", text:
      "⚠️ Gemini ตอบไม่ได้ตอนนี้ (" + ((err && err.message) || "ไม่ทราบสาเหตุ") + ")\nลองใหม่อีกครั้ง หรือพิมพ์ชื่อสินค้าเฉยๆ เพื่อค้นในคลังแทน" });
  }
}

async function askGroq(messages) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 1500,
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        },
        timeout: 30000,
      }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("Groq API error:", err?.response?.data || err.message);
    return "⚠️ ระบบ AI ไม่สามารถวิเคราะห์ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
  }
}

// ============================================================
// AI ANALYSIS HANDLER
// ============================================================
async function handleAIAnalysis(event, productName, userId) {
  const riskInfo   = analyzeRisk(productName);
  const history    = await loadHistory(userId);
  const userPrompt = `ชื่อสินค้าที่ต้องการวิเคราะห์: "${productName}"\nตอบตาม Template ที่กำหนดเท่านั้น`;

  const messages = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userPrompt },
  ];

  await saveMessage(userId, "user", userPrompt);
  const aiReply = await askGroq(messages);
  await saveMessage(userId, "assistant", aiReply);

  const finalText = `${riskInfo.message}\n\n🧠 การวิเคราะห์โดยผู้ช่วยศุลกากร AI:\n\n${aiReply}`.slice(0, 5000);

  // Flex message พร้อมปุ่มติดต่อเจ้าหน้าที่
  const staffFlex = buildStaffContactFlex(productName, finalText);

  return lineClient.replyMessage(event.replyToken, [
    { type: "text", text: finalText },
    staffFlex,
  ]);
}

/** Flex ปุ่มติดต่อเจ้าหน้าที่ — แสดงหลัง AI วิเคราะห์เสร็จ */
function buildStaffContactFlex(productName) {
  return {
    type: "flex",
    altText: "ติดต่อเจ้าหน้าที่ DOC",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1A1A2E",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "📋 ไม่แน่ใจพิกัดที่ AI แนะนำ?",
            weight: "bold",
            size: "sm",
            color: "#E0E0FF",
            wrap: true,
          },
          {
            type: "text",
            text: `สินค้า: ${productName}`,
            size: "xs",
            color: "#AAAACC",
            margin: "sm",
            wrap: true,
          },
          {
            type: "text",
            text: "ให้เจ้าหน้าที่ DOC ตรวจสอบพิกัดจริงให้คุณได้เลย ✅",
            size: "xs",
            color: "#9999BB",
            margin: "sm",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        backgroundColor: "#16213E",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#06C755",  // LINE green
            height: "sm",
            action: {
              type: "uri",
              label: "💬 ติดต่อเจ้าหน้าที่ DOC",
              uri: `https://line.me/ti/p/~${STAFF_LINE_ID}`,
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "message",
              label: "🔍 ค้นหาพิกัดใหม่",
              text: productName,
            },
          },
        ],
      },
    },
  };
}

// ============================================================
// MAIN EVENT HANDLER
// ============================================================
async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;

  const rawText  = event.message.text;
  const userId   = event.source.userId;
  const keyword  = rawText.replace(/^@DOC BOT\s*/i, "").trim();

  console.log(`[handleEvent] userId=${userId} keyword="${keyword}"`);

  // ════════════════════════════════════════════════════════════
  // 🚪 ด่านสิทธิ์ (ภูม 2026-10-20) — ต้องอยู่ "ก่อนทุกอย่าง"
  //
  // ภูม: *"ถ้าคนที่ออกไปแล้วมาพิมพ์อะไรในบอทก็ให้ขึ้นไม่มีสิทธิ์ใช้งานบอทไปเลย"*
  //
  // 🔒 ยกเว้น 2 กรณี (ตั้งใจ · กันล็อกตัวเองออกจากบอท):
  //    · เจ้าของบอท (OWNER_LINE_ID หรือ NOTIFY_TO ที่เป็นไลน์ส่วนตัว)
  //    · ในกลุ่ม — ไม่บังคับ เพราะกลุ่มเป็นของที่ภูมเชิญบอทเข้าไปเอง (ของเดิมไม่พัง)
  // ════════════════════════════════════════════════════════════
  const inPrivateChat = !event.source.groupId && !event.source.roomId;
  if (inPrivateChat && !isBotOwner(userId)) {
    const pass = await staffRegistry.gate(userId);

    if (!pass.ok) {
      // 🎟 ยังไม่ผูก + พิมพ์อะไรที่หน้าตาเหมือนรหัสเชิญ ⇒ ลองผูกให้เลย
      if (pass.reason === "not_linked" && staffRegistry.INVITE_RE.test(keyword.toUpperCase())) {
        const r = await staffRegistry.redeemInvite(userId, keyword);
        if (!r.ok) {
          return lineClient.replyMessage(event.replyToken, { type: "text", text: "❌ " + r.message });
        }
        const s = r.staff;
        return lineClient.replyMessage(event.replyToken, { type: "text", quickReply: QUICK, text: [
          "✅ ผูกบัญชีเรียบร้อย",
          "",
          "คุณ " + (s.nickname || s.name),
          (s.department || "-") + " · " + (s.position || "-"),
          "",
          s.notify.length
            ? "จะได้รับแจ้งเตือน: " + s.notify.join(" · ")
            : "ยังไม่ได้เปิดหมวดแจ้งเตือนให้ — แจ้งผู้ดูแลบอทได้เลย",
          "",
          "พิมพ์ \"เมนู\" เพื่อเริ่มใช้งาน",
        ].join("\n") });
      }

      if (pass.reason === "resigned") {
        return lineClient.replyMessage(event.replyToken, { type: "text", text: [
          "🔒 ไม่มีสิทธิ์ใช้งานบอท",
          "",
          "บัญชีพนักงานของคุณปิดอยู่ในระบบ Pacred (ลาออก/ล็อก)",
          "ถ้าคิดว่าผิดพลาด ติดต่อผู้ดูแลบอทครับ",
        ].join("\n") });
      }

      return lineClient.replyMessage(event.replyToken, { type: "text", text: [
        "👋 สวัสดีครับ — บอทนี้สำหรับพนักงาน Pacred",
        "",
        "ยังไม่ได้ผูกบัญชี · ขอ \"รหัสเชิญ\" จากผู้ดูแลบอท",
        "แล้วพิมพ์รหัสนั้นมาได้เลย (เช่น  BAM-7421)",
      ].join("\n") });
    }
  }

  const state = await getState(userId);
  console.log(`[handleEvent] current state = ${state?.state || "null"}`);

  // ============================================================
  // [0] AI TRIGGER จากปุ่ม "ให้ AI วิเคราะห์แทน"
  //     หรือพิมพ์ขึ้นต้นด้วย Al: / AI:
  // ============================================================
  /* 🔍 กดปุ่ม "ค้นพิกัด" แล้วพิมพ์ชื่อสินค้าตามมา (ภูม 2026-10-16)
     อยู่ก่อนทุกตัวจับคำ เพราะคนเพิ่งถูกถามว่า "พิมพ์ชื่อสินค้ามาได้เลย" ⇒ สิ่งที่พิมพ์คือชื่อสินค้า */
  if (state && state.state === "hs_search_wait") {
    if (/^(ยกเลิก|เลิก|ออก|cancel)$/i.test(keyword)) {
      await clearState(userId);
      return lineClient.replyMessage(event.replyToken, { type: "text", quickReply: QUICK, text: "ยกเลิกการค้นพิกัดแล้วครับ" });
    }
    return handleHsSearch(event, keyword, userId);
  }

  // ── ✨ ปุ่ม/คำสั่ง Gemini (ภูม 2026-10-15) ──
  if (/^(gemini|เจมิไน|เจมินาย)[:\s]/i.test(keyword)) {
    const name = keyword.replace(/^(gemini|เจมิไน|เจมินาย)[:\s]+/i, "").trim();
    if (!name) return lineClient.replyMessage(event.replyToken, { type: "text", text: "พิมพ์ชื่อสินค้าต่อท้ายด้วยนะ เช่น  Gemini: ปั๊มลม" });
    return handleGeminiAnalysis(event, name);
  }

  if (/^(Al|AI):/i.test(keyword)) {
    const productName = keyword.replace(/^(Al|AI):\s*/i, "").trim();
    return handleAIAnalysis(event, productName, userId);
  }

  // ── "เช็คระบบ" — บอกว่าอะไรพร้อม/ไม่พร้อม ในคำสั่งเดียว (ภูม 2026-10-15) ──
  if (/^เช็คระบบ|^เชคระบบ|^สถานะระบบ|^status$/i.test(keyword)) {
    const lines = ["🔧 สถานะระบบ", ""];
    lines.push(PACRED_API_URL ? "✅ ตั้ง PACRED_API_URL แล้ว" : "❌ ยังไม่ได้ตั้ง PACRED_API_URL");
    lines.push(PACRED_API_SECRET ? "✅ ตั้ง PACRED_API_SECRET แล้ว" : "❌ ยังไม่ได้ตั้ง PACRED_API_SECRET");
    lines.push(GEMINI_API_KEY ? "✅ ตั้ง GEMINI_API_KEY แล้ว (รุ่น " + GEMINI_MODEL + ")" : "❌ ยังไม่ได้ตั้ง GEMINI_API_KEY");
    lines.push(NOTIFY_TO ? "✅ ตั้ง NOTIFY_TO แล้ว — แจ้งเตือนทุก 5 นาที" : "❌ ยังไม่ได้ตั้ง NOTIFY_TO — ยังไม่เด้งแจ้งเตือน");
    lines.push("");
    try {
      const r = await pacredGet("hs-pending");
      lines.push("✅ เว็บ Pacred ตอบแล้ว — งานรอตอบพิกัด " + (r?.hsPending?.count ?? "?") + " ใบ");
      if (r?.push) lines.push(r.push.configured ? "✅ เว็บดันหาบอทได้ (แบบ B เปิดอยู่)" : "⚪ เว็บยังไม่ได้ตั้งตัวดัน (แบบ B ปิด · แบบ A ยังทำงาน)");
    } catch (e) { lines.push("❌ " + explainPacredError(e).split("\n")[0]); }
    return lineClient.replyMessage(event.replyToken, { type: "text", quickReply: QUICK, text: lines.join("\n") });
  }

  // ── "ไอดีฉัน" — บอก LINE id เพื่อเอาไปใส่ env NOTIFY_TO ที่ Render ──
  if (/^ไอดีฉัน|^ไอดี|^my ?id$/i.test(keyword)) {
    const gid = event.source.groupId || event.source.roomId || null;
    const lines = ["🪪 ไอดีสำหรับตั้งแจ้งเตือน", "", "ของคุณ: " + userId];
    if (gid) lines.push("ของกลุ่มนี้: " + gid);
    lines.push("", "เอาไปใส่ที่ Render → Environment → NOTIFY_TO", "(ใส่ของกลุ่ม = ทั้งกลุ่มได้รับแจ้งเตือน)");
    return lineClient.replyMessage(event.replyToken, { type: "text", text: lines.join("\n") });
  }

  // ============================================================
  // [0.5] ผู้ช่วยงาน Pacred (ภูม 2026-08-27) — พิมพ์ "อัพล่าสุด" / "แทรคค้าง"
  //       → ไปถามระบบ Pacred (API ลับ) แล้วตอบสรุปในไลน์
  // ============================================================
  if (!state && isWorkCommand(keyword)) {
    return handleWorkAssistant(event, keyword);
  }

  // ============================================================
  // [1] FLOW ADD — ฟอร์มข้อความเดียว copy & กรอก
  // ============================================================
  if (!state && (keyword.startsWith("เพิ่มสินค้า") || keyword.toLowerCase().startsWith("add"))) {
    const FORM_TEMPLATE =
      "📦 กรอกข้อมูลสินค้าแล้วส่งกลับมาเลย:\n\n" +
      "ชื่อไทย: \n" +
      "ชื่ออังกฤษ: \n" +
      "HS CODE: \n" +
      "NO: \n" +
      "FE: \n" +
      "หมายเหตุ: ";
    await setState(userId, "add_form_wait", {});
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: FORM_TEMPLATE,
    });
  }

  if (state?.state === "add_form_wait") {
    // parse ทีละบรรทัด รองรับทั้ง "ชื่อไทย: ค่า" และ "ชื่อไทย:ค่า"
    const lines = keyword.split("\n").map(l => l.trim()).filter(Boolean);
    const get = (label) => {
      const line = lines.find(l => l.startsWith(label));
      return line ? line.replace(label, "").replace(/^:\s*/, "").trim() || "-" : "-";
    };

    const th      = get("ชื่อไทย");
    const en      = get("ชื่ออังกฤษ");
    const hs_raw  = get("HS CODE").replace(/\s/g, "");
    const no      = get("NO");
    const fe      = get("FE");
    const note    = get("หมายเหตุ");

    // validate ชื่อ + HS CODE
    const errors = [];
    if (!th || th === "-")  errors.push("• ชื่อไทย ยังว่างอยู่");
    if (!en || en === "-")  errors.push("• ชื่ออังกฤษ ยังว่างอยู่");
    if (!/^\d{6,10}$/.test(hs_raw)) errors.push("• HS CODE ต้องเป็นตัวเลข 6–10 หลัก");

    if (errors.length > 0) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `❌ ข้อมูลไม่ครบหรือไม่ถูกต้อง:\n${errors.join("\n")}\n\nกรุณาส่งฟอร์มใหม่อีกครั้ง`,
      });
    }

    const newRow = { hs_code: hs_raw, th, en, no, fe, note, stat: "-" };
    const ok = await addNewHSRow(newRow);
    await clearState(userId);

    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: ok
        ? `✅ เพิ่มสินค้าสำเร็จ!\n\n📋 สรุป:\n• ชื่อไทย: ${th}\n• ชื่ออังกฤษ: ${en}\n• HS CODE: ${hs_raw}\n• NO: ${no}\n• FE: ${fe}\n• หมายเหตุ: ${note}`
        : "⚠️ เพิ่มสินค้าไม่สำเร็จ กรุณาลองใหม่",
    });
  }

  // ============================================================
  // [2] FLOW EDIT
  // ============================================================
  if (!state && /^(แก้สินค้า|แก้พิกัด|แก้\s)/.test(keyword)) {
    const searchKey = keyword
      .replace(/^(แก้สินค้า|แก้พิกัด|แก้\s)/, "")
      .trim();

    if (!searchKey) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "กรุณาระบุชื่อสินค้า เช่น: แก้สินค้า ไฟฉาย LED",
      });
    }

    const found = await searchHS(searchKey);

    if (found.length === 0) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `❌ ไม่พบสินค้า "${searchKey}" ในฐานข้อมูล`,
      });
    }

    if (found.length === 1) {
      // เก็บแค่ itemId — ป้องกัน Supabase jsonb truncate object ใหญ่
      await setState(userId, "edit_select_field", { itemId: found[0].id });
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: buildEditMenu(found[0]),
      });
    }

    // หลายรายการ — เก็บแค่ id array ไม่เก็บ object ทั้งก้อน
    const listIds  = found.map(item => item.id);
    const listText = found.map((item, i) => `${i + 1}) ${item.th} (HS: ${item.hs_code})`).join("\n");
    await setState(userId, "edit_select_item", { listIds, count: found.length });
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: `พบ ${found.length} รายการ กรุณาเลือกหมายเลข:\n\n${listText}`,
    });
  }

  if (state?.state === "edit_select_item") {
    const index = parseInt(keyword);
    const count  = state.data.count || 0;

    if (isNaN(index) || index < 1 || index > count) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `กรุณาเลือกหมายเลข 1–${count}`,
      });
    }

    // refetch จาก Supabase ด้วย id — ไม่พึ่ง object ใน state
    const targetId = state.data.listIds[index - 1];
    const { data: selectedArr } = await supabase
      .from("hs_codes").select("*").eq("id", targetId);
    const selected = selectedArr?.[0];

    if (!selected) {
      await clearState(userId);
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "⚠️ ไม่พบรายการในฐานข้อมูล กรุณาลองใหม่",
      });
    }

    await setState(userId, "edit_select_field", { itemId: selected.id });
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: buildEditMenu(selected),
    });
  }

  if (state?.state === "edit_select_field") {
    const FIELD_MAP = {
      "1": "th",       "ชื่อไทย": "th",
      "2": "en",       "ชื่ออังกฤษ": "en",
      "3": "hs_code",  "hs": "hs_code", "hs code": "hs_code",
      "4": "fe",
      "5": "no",
      "6": "note",     "หมายเหตุ": "note",
    };
    const field = FIELD_MAP[keyword.toLowerCase().trim()];

    if (!field) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "กรุณาเลือกหัวข้อให้ถูกต้อง (พิมพ์ 1–6)",
      });
    }

    // refetch item จาก DB แทนการอ่านจาก state
    const { data: itemArr } = await supabase
      .from("hs_codes").select("*").eq("id", state.data.itemId);
    const currentItem = itemArr?.[0];
    if (!currentItem) {
      await clearState(userId);
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "⚠️ ไม่พบรายการ กรุณาเริ่มใหม่",
      });
    }

    // เก็บแค่ itemId + field — ไม่เก็บ object
    await setState(userId, "edit_input_value", { itemId: state.data.itemId, field });
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: `✏️ กรุณาส่งค่าใหม่สำหรับ "${field}" ของ "${currentItem.th}"\n\n(ค่าปัจจุบัน: ${currentItem[field] || "-"})`,
    });
  }

  if (state?.state === "edit_input_value") {
    const { itemId, field } = state.data;

    // refetch ก่อน update เพื่อเอาชื่อมาแสดง
    const { data: itemArr } = await supabase
      .from("hs_codes").select("*").eq("id", itemId);
    const currentItem = itemArr?.[0];

    const { error } = await supabase
      .from("hs_codes")
      .update({ [field]: keyword })
      .eq("id", itemId);

    await clearState(userId);

    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: error
        ? "⚠️ แก้ไขไม่สำเร็จ กรุณาลองใหม่"
        : `✅ แก้ไขสำเร็จ!\n📦 ${currentItem?.th || itemId}\n🔧 ${field} → ${keyword}`,
    });
  }

  // ============================================================
  // [3] FLOW DELETE
  // ============================================================
  if (!state && /^(ลบสินค้า|ลบพิกัด|ลบ\s)/.test(keyword)) {
    const searchKey = keyword.replace(/^(ลบสินค้า|ลบพิกัด|ลบ\s)/, "").trim();

    if (!searchKey) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "กรุณาระบุชื่อสินค้าที่ต้องการลบ\nเช่น: ลบสินค้า หมวก",
      });
    }

    const found = await searchHS(searchKey);

    if (found.length === 0) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `❌ ไม่พบสินค้า "${searchKey}" ในฐานข้อมูล`,
      });
    }

    // หลายรายการ ให้เลือกก่อน
    if (found.length > 1) {
      const listIds  = found.map(item => item.id);
      const listText = found.map((item, i) => `${i + 1}) ${item.th} (HS: ${item.hs_code})`).join("\n");
      await setState(userId, "delete_select_item", { listIds, count: found.length });
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `พบ ${found.length} รายการ กรุณาเลือกหมายเลขที่ต้องการลบ:\n\n${listText}`,
      });
    }

    // รายการเดียว — ถามยืนยันทันที
    const item = found[0];
    await setState(userId, "delete_confirm", { itemId: item.id });
    return lineClient.replyMessage(event.replyToken, buildDeleteConfirmFlex(item));
  }

  // เลือกรายการที่จะลบ (กรณีเจอหลายรายการ)
  if (state?.state === "delete_select_item") {
    const index = parseInt(keyword);
    const count  = state.data.count || 0;

    if (isNaN(index) || index < 1 || index > count) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `กรุณาเลือกหมายเลข 1–${count}`,
      });
    }

    const targetId = state.data.listIds[index - 1];
    const { data: itemArr } = await supabase.from("hs_codes").select("*").eq("id", targetId);
    const selected = itemArr?.[0];

    if (!selected) {
      await clearState(userId);
      return lineClient.replyMessage(event.replyToken, { type: "text", text: "⚠️ ไม่พบรายการ กรุณาลองใหม่" });
    }

    await setState(userId, "delete_confirm", { itemId: selected.id });
    return lineClient.replyMessage(event.replyToken, buildDeleteConfirmFlex(selected));
  }

  // รอการยืนยัน ใช่ / ไม่ใช่
  if (state?.state === "delete_confirm") {
    const answer = keyword.trim().toLowerCase();

    if (!["ใช่", "yes", "ยืนยัน", "y", "confirm"].includes(answer)) {
      await clearState(userId);
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "❎ ยกเลิกการลบแล้ว ไม่มีข้อมูลถูกลบ",
      });
    }

    const { itemId } = state.data;
    const { data: itemArr } = await supabase.from("hs_codes").select("*").eq("id", itemId);
    const item = itemArr?.[0];

    const { error } = await supabase.from("hs_codes").delete().eq("id", itemId);
    await clearState(userId);

    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: error
        ? "⚠️ ลบไม่สำเร็จ กรุณาลองใหม่"
        : `🗑️ ลบสำเร็จ!\n\n📦 ${item?.th || "-"}\n🔢 HS: ${item?.hs_code || "-"}\n\nรายการนี้ถูกลบออกจากฐานข้อมูลแล้ว`,
    });
  }

  // ============================================================
  // [4] SEARCH MODE
  // ============================================================
  if (!state) {
    const isAddCmd    = /^(เพิ่มสินค้า|add\s)/i.test(keyword);
    const isEditCmd   = /^(แก้สินค้า|แก้พิกัด|แก้\s)/i.test(keyword);
    const isDeleteCmd = /^(ลบสินค้า|ลบพิกัด|ลบ\s)/i.test(keyword);

    if (!isAddCmd && !isEditCmd && !isDeleteCmd) {
      const riskInfo = analyzeRisk(keyword);
      const results  = await searchHS(keyword);

      if (results.length > 0) {
        return lineClient.replyMessage(event.replyToken, buildHSFlex(results, riskInfo, keyword));
      }

      return lineClient.replyMessage(event.replyToken, buildNoResultFlex(keyword, riskInfo));
    }
  }
}

// ============================================================
// HELPER
// ============================================================

/** Flex ยืนยันการลบ — แสดงก่อนลบจริง */
function buildDeleteConfirmFlex(item) {
  return {
    type: "flex",
    altText: `ยืนยันลบ: ${item.th}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#2D0A0A",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "🗑️ ยืนยันการลบสินค้า", weight: "bold", size: "sm", color: "#FF6B6B", wrap: true },
          { type: "separator", margin: "md", color: "#5A1A1A" },
          {
            type: "box", layout: "vertical", margin: "md", spacing: "xs",
            contents: [
              { type: "text", text: `📦 ${item.th || "-"}`,          size: "sm",  color: "#FFCCCC", wrap: true },
              { type: "text", text: `🌐 ${item.en || "-"}`,          size: "xs",  color: "#CC9999", wrap: true },
              { type: "text", text: `🔢 HS: ${item.hs_code || "-"}`, size: "xs",  color: "#CC9999" },
            ],
          },
          { type: "separator", margin: "md", color: "#5A1A1A" },
          { type: "text", text: "⚠️ การลบไม่สามารถกู้คืนได้!", size: "xs", color: "#FF9999", margin: "md", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        paddingAll: "12px",
        backgroundColor: "#1A0808",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#CC2222",
            flex: 1,
            height: "sm",
            action: { type: "message", label: "🗑️ ยืนยันลบ", text: "ใช่" },
          },
          {
            type: "button",
            style: "secondary",
            flex: 1,
            height: "sm",
            action: { type: "message", label: "❎ ยกเลิก", text: "ไม่ใช่" },
          },
        ],
      },
    },
  };
}

function buildEditMenu(item) {
  return (
    `✏️ แก้ไขรายการ: "${item.th}"\n` +
    `HS CODE: ${item.hs_code}\n\n` +
    `เลือกหัวข้อที่ต้องการแก้:\n` +
    `1) ชื่อไทย\n2) ชื่ออังกฤษ\n3) HS CODE\n4) FE\n5) NO\n6) หมายเหตุ`
  );
}

// ============================================================
// EXPRESS ROUTES
// ============================================================

app.get("/webhook", (req, res) => res.send("DOC BOT is running ✅"));
// /ping บอกด้วยว่ารันโค้ดชุดไหน + ฟีเจอร์ไหนพร้อม
// (ภูม 2026-10-15: deploy แล้วแต่ยังใช้ไม่ได้ เพราะเป็นโค้ดคนละชุด ⇒ ต้องตรวจได้จากข้างนอก)
app.get("/ping", (req, res) => res.json({
  status: "ok",
  time: new Date().toISOString(),
  commit: (process.env.RENDER_GIT_COMMIT || "").slice(0, 7) || null,
  features: {
    hsPending: true,
    gemini: Boolean(GEMINI_API_KEY),
    notify: Boolean(NOTIFY_TO),
    pacredApi: Boolean(PACRED_API_URL && PACRED_API_SECRET),
  },
}));

app.post("/webhook", middleware(lineConfig), (req, res) => {
  res.sendStatus(200);
  Promise.all(req.body.events.map(handleEvent))
    .catch(err => console.error("handleEvent error:", err));
});

// 🛠 หน้าจัดการสิทธิ์ (ภูม 2026-10-20) — ต้องต่อ "หลัง" /webhook
//    เพราะ /webhook ต้องได้ body ดิบไปตรวจลายเซ็น LINE ก่อนที่ express.json() จะแตะ
mountStaffAdmin(app, staffRegistry);

app.use(express.json());

// ============================================================
// 🔔 แบบ B — เว็บ Pacred ยิงมาทันทีที่งานเข้าสถานะ "รอตรวจพิกัด/เอกสาร"
//    เว็บส่ง { kind:"hs-pending", hno:"P22704", at:"..." } + header Bearer <PACRED_API_SECRET>
//    บอทไม่เชื่อ payload ตรงๆ — ถามเว็บซ้ำผ่าน tellPending() แล้วค่อยเด้ง (กันคนยิงมั่ว)
// ============================================================
app.post("/pacred-hook", (req, res) => {
  const got = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!PACRED_API_SECRET || got !== PACRED_API_SECRET) return res.sendStatus(401);
  res.sendStatus(200);
  console.log("[pacred-hook] งานใหม่ " + ((req.body && req.body.hno) || "(ไม่ระบุเลข)"));
  tellPending({ isNew: true }).catch(e => console.error("[pacred-hook]", (e && e.message) || e));
});

// ============================================================
// SELF PING — แก้ปัญหา cold start บน Render Free Tier
// ============================================================
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
if (SELF_URL) {
  setInterval(async () => {
    try {
      await axios.get(`${SELF_URL}/ping`, { timeout: 5000 });
      console.log(`[Keep-alive] pinged ${SELF_URL}/ping`);
    } catch (e) {
      console.warn("[Keep-alive] ping failed:", e.message);
    }
  }, 13 * 60 * 1000);
}

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 DOC BOT is running on port ${PORT}`);
  if (SELF_URL) console.log(`🔄 Keep-alive enabled → ${SELF_URL}/ping`);
});