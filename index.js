// ------------------------------------------------------
// ⭐ IMPORT MODULES
// ------------------------------------------------------
const express = require('express');
const bodyParser = require('body-parser');
const { Client, middleware } = require('@line/bot-sdk');
const axios = require("axios");

// ------------------------------------------------------
// ⭐ LOAD JSON DATA
// ------------------------------------------------------
const hs1 = require('./data/hs_1_200.json');
const hs2 = require('./data/hs_201_400.json');
const hs3 = require('./data/hs_401_600.json');
const hs4 = require('./data/hs_601_640.json');

const hsData = [...hs1, ...hs2, ...hs3, ...hs4];

// ------------------------------------------------------
// ⭐ LINE BOT CONFIG
// ------------------------------------------------------
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_SECRET'
};

const client = new Client(config);
const app = express();

app.use(middleware(config));
app.use(bodyParser.json());

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
// ⭐ AI RESPONSE FUNCTION (GEMINI)
// ------------------------------------------------------
async function generateAIResponse(item) {
  const prompt = `
คุณคือผู้เชี่ยวชาญด้านศุลกากรไทย ทำหน้าที่วิเคราะห์สินค้าและจัดพิกัดศุลกากรอย่างถูกต้อง
ให้คุณใช้เหตุผลประกอบภายในใจของคุณเองเพื่อวิเคราะห์ แต่ห้ามแสดงเหตุผลประกอบออกมา
ให้แสดงเฉพาะผลลัพธ์สุดท้ายตามรูปแบบด้านล่างเท่านั้น

🔷 ชื่อสินค้า

📋 รายละเอียด
– TH:
– EN:
– HS CODE:
– อากร:
– FE:
– ออกใบกำกับภาษีได้หรือไม่:
– ออกใบขนสินค้าได้หรือไม่:

📌 สรุป:
– รหัสสินค้า:
– หมายเหตุ:
– ข้อควรระวัง:

ข้อมูลสินค้า (ใช้เพื่อวิเคราะห์):
HS CODE: ${item.hsCode}
EN: ${item.en}
TH: ${item.th}
อากร: ${item.no}
FE: ${item.fe}

ให้คุณวิเคราะห์เองว่า:
- สินค้านี้ออกใบกำกับภาษีได้หรือไม่
- สินค้านี้ออกใบขนสินค้าได้หรือไม่
และตอบให้เป็นภาษาที่เข้าใจง่าย เหมือนที่ปรึกษาศุลกากรตัวจริง
`;

  try {
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        params: { key: process.env.GEMINI_API_KEY }
      }
    );

    return response.data.candidates[0].content.parts[0].text;

  } catch (err) {
    console.error("AI ERROR:", err.response?.data || err.message);
    return "⚠️ ระบบ AI ไม่สามารถวิเคราะห์ได้ในขณะนี้ (อาจเกิดจาก quota หรือ network) แต่ข้อมูลจากฐานข้อมูลยังใช้งานได้ตามปกติครับ";
  }
}

// ------------------------------------------------------
// ⭐ WEBHOOK ENDPOINT
// ------------------------------------------------------
app.post('/webhook', (req, res) => {
  res.sendStatus(200);

  Promise.all(req.body.events.map(handleEvent))
    .catch((err) => console.error(err));
});

// ------------------------------------------------------
// ⭐ MAIN EVENT HANDLER
// ------------------------------------------------------
async function handleEvent(event) {

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const text = event.message.text;
  const sourceType = event.source.type;

  // กลุ่มต้องแท็กก่อน
  if (sourceType === 'group' || sourceType === 'room') {
    if (!text.startsWith('@DOC BOT')) {
      return Promise.resolve(null);
    }
  }

  const keyword = text.replace('@DOC BOT', '').trim();
  const result = searchHS(keyword);

  if (result.length === 0) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ไม่พบข้อมูลที่ค้นหา'
    });
  }

  const item = result[0];

  // ⭐ PART 1 — JSON DATA
  const jsonPart =
`📦 ข้อมูลจากฐานข้อมูล (JSON)
HS CODE: ${item.hsCode}
EN: ${item.en}
TH: ${item.th}
อากร: ${item.no || "-"}
FE: ${item.fe || "-"}`;

  // ⭐ PART 2 — AI ANALYSIS
  const aiPart = await generateAIResponse(item);

  const replyText = `${jsonPart}\n\n${aiPart}`;

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
