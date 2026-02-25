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
const STAFF_LINE_ID = "LINE_ID_poomlt"; // LINE ID ของเจ้าหน้าที่

// ============================================================
// STATE MACHINE  (Supabase: conversation_state)
// ============================================================
async function setState(userId, state, data = {}) {
  await supabase.from("conversation_state").upsert({
    user_id: userId,
    state,
    data,
    updated_at: new Date().toISOString(),
  });
}

async function getState(userId) {
  const { data, error } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();           // ✅ ไม่ throw error เมื่อไม่พบแถว
  if (error) { console.error("getState error:", error); return null; }
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

  const state = await getState(userId);

  // ============================================================
  // [0] AI TRIGGER จากปุ่ม "ให้ AI วิเคราะห์แทน"
  //     หรือพิมพ์ขึ้นต้นด้วย Al: / AI:
  // ============================================================
  if (/^(Al|AI):/i.test(keyword)) {
    const productName = keyword.replace(/^(Al|AI):\s*/i, "").trim();
    return handleAIAnalysis(event, productName, userId);
  }

  // ============================================================
  // [1] FLOW ADD
  // ============================================================
  if (!state && (keyword.startsWith("เพิ่มสินค้า") || keyword.toLowerCase().startsWith("add"))) {
    await setState(userId, "add_step_1", { row: {} });
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "📦 เพิ่มสินค้าใหม่ (1/6)\n\nกรุณาส่งชื่อ ไทย ของสินค้า",
    });
  }

  if (state?.state === "add_step_1") {
    const row = { ...state.data.row, th: keyword };
    await setState(userId, "add_step_2", { row });
    return lineClient.replyMessage(event.replyToken, { type: "text", text: "📦 (2/6) กรุณาส่งชื่อ อังกฤษ ของสินค้า" });
  }

  if (state?.state === "add_step_2") {
    const row = { ...state.data.row, en: keyword };
    await setState(userId, "add_step_3", { row });
    return lineClient.replyMessage(event.replyToken, { type: "text", text: "📦 (3/6) กรุณาส่ง HS CODE (6 หรือ 8 หลัก)" });
  }

  if (state?.state === "add_step_3") {
    const hs = keyword.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(hs)) {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "❌ รูปแบบ HS CODE ไม่ถูกต้อง\nกรุณาส่งเป็นตัวเลข 6 หรือ 8 หลัก เช่น 850610",
      });
    }
    const row = { ...state.data.row, hs_code: hs };
    await setState(userId, "add_step_4", { row });
    return lineClient.replyMessage(event.replyToken, { type: "text", text: "📦 (4/6) อัตราอากร NO (ปกติ) เช่น 5%, 10% หรือ - ถ้าไม่ทราบ" });
  }

  if (state?.state === "add_step_4") {
    const row = { ...state.data.row, no: keyword || "-" };
    await setState(userId, "add_step_5", { row });
    return lineClient.replyMessage(event.replyToken, { type: "text", text: "📦 (5/6) อัตราอากร FE (FTA/สิทธิพิเศษ) หรือ - ถ้าไม่ทราบ" });
  }

  if (state?.state === "add_step_5") {
    const row = { ...state.data.row, fe: keyword || "-" };
    await setState(userId, "add_step_6", { row });
    return lineClient.replyMessage(event.replyToken, { type: "text", text: "📦 (6/6) หมายเหตุเพิ่มเติม (พิมพ์ - ถ้าไม่มี)" });
  }

  if (state?.state === "add_step_6") {
    const row    = state.data.row;
    const newRow = {
      hs_code: row.hs_code,
      th:      row.th,
      en:      row.en,
      no:      row.no || "-",
      fe:      row.fe || "-",
      note:    keyword || "-",
      stat:    "-",
    };

    const ok = await addNewHSRow(newRow);
    await clearState(userId);

    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: ok
        ? `✅ เพิ่มสินค้าใหม่เรียบร้อย!\n\n📋 สรุป:\n• ชื่อไทย: ${newRow.th}\n• ชื่ออังกฤษ: ${newRow.en}\n• HS CODE: ${newRow.hs_code}\n• NO: ${newRow.no}\n• FE: ${newRow.fe}\n• หมายเหตุ: ${newRow.note}`
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
  // [3] SEARCH MODE
  // ============================================================
  if (!state) {
    const isAddCmd  = /^(เพิ่มสินค้า|add\s)/i.test(keyword);
    const isEditCmd = /^(แก้สินค้า|แก้พิกัด|แก้\s)/i.test(keyword);

    if (!isAddCmd && !isEditCmd) {
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