// ------------------------------------------------------
// ⭐ IMPORT MODULES
// ------------------------------------------------------
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// ------------------------------------------------------
// ⭐ SUPABASE INIT
// ------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ------------------------------------------------------
// ⭐ LOAD JSON DATA
// ------------------------------------------------------
const hs1 = require('./data/hs_1_200.json');
const hs2 = require('./data/hs_201_400.json');
const hs3 = require('./data/hs_401_600.json');
const hs4 = require('./data/hs_601_640.json');
const hs5 = require('./data/hs_0.json');
const hs6 = require('./data/hs_0.1.json');

const hsData = [...hs1, ...hs2, ...hs3, ...hs4, ...hs5, ...hs6];

// ------------------------------------------------------
// ⭐ LINE BOT CONFIG
// ------------------------------------------------------
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new Client(config);
const app = express();

// ------------------------------------------------------
// ⭐ FIX: GET /webhook
// ------------------------------------------------------
app.get('/webhook', (req, res) => {
  res.send("OK");
});

// ------------------------------------------------------
// ⭐ POST /webhook
// ------------------------------------------------------
app.post('/webhook', middleware(config), (req, res) => {
  console.log("POST /webhook RECEIVED:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);

  Promise.all(req.body.events.map(handleEvent))
    .catch((err) => console.error("HANDLE EVENT ERROR:", err));
});

// ------------------------------------------------------
// ⭐ SEARCH FUNCTION
// ------------------------------------------------------
function searchHS(keyword) {
  keyword = keyword.toLowerCase();

  return hsData.filter(item =>
    (item.hsCode || '').toLowerCase().includes(keyword) ||
    (item.en || '').toLowerCase().includes(keyword) ||
    (item.th || '').toLowerCase().includes(keyword)
  );
}

// ------------------------------------------------------
// ⭐ AI RESPONSE FUNCTION
// ------------------------------------------------------
async function askGroq(messages) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: messages
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        }
      }
    );

    return response.data.choices[0].message.content;

  } catch (err) {
    console.error("Groq ERROR:", err.response?.data || err.message);
    return "⚠️ ระบบ AI ไม่สามารถวิเคราะห์ได้ในขณะนี้";
  }
}

// ------------------------------------------------------
// ⭐ SAVE MESSAGE
// ------------------------------------------------------
async function saveMessage(userId, role, content) {
  const { error } = await supabase.from("conversation_history").insert({
    user_id: userId,
    role: role,
    content: content
  });

  if (error) {
    console.error("SUPABASE INSERT ERROR:", error);
  }
}

// ------------------------------------------------------
// ⭐ LOAD HISTORY
// ------------------------------------------------------
async function loadHistory(userId) {
  const { data } = await supabase
    .from("conversation_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!data) return [];

  return data.map(row => ({
    role: row.role,
    content: row.content
  }));
}

// ------------------------------------------------------
// ⭐ OVERRIDE FUNCTIONS
// ------------------------------------------------------
async function getOverride(keyword) {
  const { data } = await supabase
    .from("custom_hs_overrides")
    .select("*")
    .eq("keyword", keyword)
    .order("created_at", { ascending: false })
    .limit(1);

  return data?.[0] || null;
}

async function saveOverride(userId, keyword, hsCode) {
  await supabase.from("custom_hs_overrides").insert({
    user_id: userId,
    keyword: keyword,
    correct_hs: hsCode
  });
}

// ------------------------------------------------------
// ⭐ MAIN EVENT HANDLER
// ------------------------------------------------------
async function handleEvent(event) {

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const text = event.message.text;
  const sourceType = event.source.type;
  const userId = event.source.userId;

  if (sourceType === 'group' || sourceType === 'room') {
    if (!text.startsWith('@DOC BOT')) {
      return Promise.resolve(null);
    }
  }

  const keyword = text.replace('@DOC BOT', '').trim();

  await saveMessage(userId, "user", keyword);

  const history = await loadHistory(userId);

  // ------------------------------------------------------
  // ⭐ OVERRIDE LOGIC
  // ------------------------------------------------------
  const hsMatch = keyword.match(/\b\d{6,8}\b/);
  if (hsMatch) {
    const hsCode = hsMatch[0];

    const userMessages = history.filter(m => m.role === "user");
    const lastQuestion = [...userMessages].reverse().find(m => !/\b\d{6}\b/.test(m.content));

    const overrideKeyword = lastQuestion?.content || null;

    if (overrideKeyword) {
      await saveOverride(userId, overrideKeyword, hsCode);

      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `บันทึกพิกัดสำหรับ "${overrideKeyword}" เป็น ${hsCode} เรียบร้อยครับ`
      });
    }
  }

  // ------------------------------------------------------
  // ⭐ SEARCH JSON + APPLY OVERRIDE
  // ------------------------------------------------------
  let results = searchHS(keyword);

  const override = await getOverride(keyword);
  if (override) {
    results.unshift({
      hsCode: override.correct_hs,
      th: `พิกัดที่คุณตั้งไว้`,
      en: `User override`,
      no: "-",
      fe: "-"
    });
  }

  // ------------------------------------------------------
  // ⭐ JSON SUMMARY (Enterprise Style)
// ------------------------------------------------------
  let jsonPart = "📦 ไม่พบข้อมูลในฐานข้อมูล (JSON)";
  let listForAI = "ไม่พบข้อมูลในฐาน JSON";

  if (results.length > 0) {
    const MAX_RESULTS = 10;
    const sliced = results.slice(0, MAX_RESULTS);

    listForAI = sliced.map((item, index) => {
      return (
`【${index + 1}】
HS: ${item.hsCode}
TH: ${item.th}
EN: ${item.en}
อากร: ${item.no} %
FE: ${item.fe} %

────────────────────
`
      );
    }).join('');

    jsonPart =
`📦 ผลการค้นหา (JSON)

${listForAI}`;
  }

  // ------------------------------------------------------
  // ⭐ AI PROMPT (Enterprise Style)
// ------------------------------------------------------
  let prompt = "";

  if (results.length > 0) {
    prompt = `
คุณคือผู้เชี่ยวชาญด้านศุลกากรไทย ทำหน้าที่วิเคราะห์สินค้าและจัดพิกัดศุลกากรอย่างถูกต้อง

ให้คุณทำ 2 ส่วน:
1) สรุปข้อมูลจากฐานข้อมูล (อย่าแก้ไข)
2) วิเคราะห์พิกัดใหม่ตามหลักเกณฑ์ศุลกากรไทย โดยใช้ความรู้ของคุณเอง แบบสรุปสั้นๆ

📦 ข้อมูลจากฐานข้อมูล
${listForAI}

🤖 วิเคราะห์โดย AI (AI Analysis)
【AI-1】
HS CODE ที่ AI คิดว่าใช่:
เหตุผล:
ออกใบกำกับภาษีได้หรือไม่:
ออกใบขนสินค้าได้หรือไม่:
ข้อควรระวัง:

────────────────────
`;
  } else {
    prompt = `
คุณคือผู้เชี่ยวชาญด้านศุลกากรไทย ทำหน้าที่วิเคราะห์สินค้าและจัดพิกัดศุลกากรอย่างถูกต้อง

ให้คุณวิเคราะห์พิกัดศุลกากรจากข้อความนี้:
"${keyword}"

🤖 วิเคราะห์โดย AI (AI Analysis)
【AI-1】
HS CODE ที่ AI คิดว่าใช่:
เหตุผล:
ออกใบกำกับภาษีได้หรือไม่:
ออกใบขนสินค้าได้หรือไม่:
ข้อควรระวัง:

────────────────────
`;
  }

  const messages = [...history, { role: "user", content: prompt }];
  const aiPart = await askGroq(messages);

  await saveMessage(userId, "assistant", aiPart);

  const replyText =
`${jsonPart}

🤖 วิเคราะห์โดย AI (AI Analysis)
${aiPart}
`;

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

// ------------------------------------------------------
// ⭐ START SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE bot is running on port ${PORT}`);
});
