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

async function pacredGet(q) {
  if (!PACRED_API_URL || !PACRED_API_SECRET) throw new Error("ยังไม่ได้ตั้ง PACRED_API_URL / PACRED_API_SECRET");
  const res = await axios.get(`${PACRED_API_URL}/api/bot`, {
    params: { q }, headers: { Authorization: `Bearer ${PACRED_API_SECRET}` }, timeout: 12000,
  });
  return res.data;
}

// พิมพ์อะไรถึงเรียกผู้ช่วย (เมนู / อัพล่าสุด / แทรคค้าง)
function isWorkCommand(text) {
  const t = (text || "").toLowerCase();
  return /^เมนู|ผู้ช่วย|^ช่วย|อัพล่าสุด|อัปเดตล่าสุด|อัพเดทล่าสุด|^ล่าสุด|แทรคค้าง|^ค้าง|ยังไม่เข้า|งานค้าง|สรุปงาน|สถานะงาน/.test(t);
}

// dd/mm/yy hh:mm (พ.ศ.)
function fmtWhen(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear() + 543).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ปุ่มลัดใต้ข้อความ (Quick Reply) — กดถามซ้ำได้เร็ว
const QUICK = { items: [
  { type: "action", action: { type: "message", label: "📦 อัพล่าสุด", text: "อัพล่าสุด" } },
  { type: "action", action: { type: "message", label: "🔴 แทรคค้าง", text: "แทรคค้าง" } },
  { type: "action", action: { type: "message", label: "📋 เมนู", text: "เมนู" } },
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

// dd/mm hh:mm น. (กระชับ — ตัดปีออก)
function fmtWhenShort(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())} น.`;
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
// ⚠️ ไม่ relabel "ระบบ" → ภูม (ตรงนี้ "ระบบ" = cron auto-commit จริงๆ · ภูม 2026-08-28 เคาะให้คงไว้)
function importBlock(title, hist, maxItems = 3) {
  const recent = hist && Array.isArray(hist.recent) ? hist.recent.slice(0, maxItems) : [];
  if (recent.length === 0) return `${title}\n   — ยังไม่มี —`;
  const lines = recent.map((e) => `   • ${fmtWhenShort(e.when)} · ${e.byName} · ${e.count} แทรค`);
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

async function handleWorkAssistant(event, keyword) {
  const t = (keyword || "").toLowerCase();
  try {
    if (/^เมนู|ผู้ช่วย|^ช่วย/.test(t))
      return lineClient.replyMessage(event.replyToken, buildMenuFlex());
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
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "⚠️ เชื่อมต่อระบบ Pacred ไม่ได้ ลองใหม่อีกครั้ง (หรือยังไม่ได้ตั้งค่า PACRED_API_URL / PACRED_API_SECRET ในบอท)",
    });
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
  const state = await getState(userId);
  console.log(`[handleEvent] current state = ${state?.state || "null"}`);

  // ============================================================
  // [0] AI TRIGGER จากปุ่ม "ให้ AI วิเคราะห์แทน"
  //     หรือพิมพ์ขึ้นต้นด้วย Al: / AI:
  // ============================================================
  if (/^(Al|AI):/i.test(keyword)) {
    const productName = keyword.replace(/^(Al|AI):\s*/i, "").trim();
    return handleAIAnalysis(event, productName, userId);
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
app.get("/ping", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.post("/webhook", middleware(lineConfig), (req, res) => {
  res.sendStatus(200);
  Promise.all(req.body.events.map(handleEvent))
    .catch(err => console.error("handleEvent error:", err));
});

app.use(express.json());

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