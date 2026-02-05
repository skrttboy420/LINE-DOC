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
const hs5 = require('./data/hs_0.json');
const hs6 = require('./data/hs_0.1.json');

const hsData = [...hs1, ...hs2, ...hs3, ...hs4, ...hs5, ...hs6];

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
// ⭐ AI RESPONSE FUNCTION (GROQ)
// ------------------------------------------------------
async function askGroq(prompt) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "user", content: prompt }
        ]
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
    return "⚠️ ระบบ AI ไม่สามารถวิเคราะห์ได้ในขณะนี้ แต่ข้อมูลจากฐานข้อมูลยังใช้งานได้ตามปกติครับ";
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

  // ถ้ามีข้อมูลใน JSON → ใช้ item
  // ถ้าไม่มี → item = null
  let item = result.length > 0 ? result[0] : null;

  // ⭐ PART 1 — JSON DATA (ถ้ามี)
  let jsonPart = "📦 ไม่พบข้อมูลในฐานข้อมูล (JSON)";

  if (item) {
    jsonPart =
`📦 ข้อมูลจากฐานข้อมูล (JSON)
HS CODE: ${item.hsCode}
EN: ${item.en}
TH: ${item.th}
อากร: ${item.no || "-"}
FE: ${item.fe || "-"}`;
  }

  // ⭐ PART 2 — AI ANALYSIS (คิดพิกัดใหม่ทุกครั้ง)
  let prompt = "";

  if (item) {
    // กรณีมีข้อมูลใน JSON
    prompt = `
คุณคือผู้เชี่ยวชาญด้านศุลกากรไทย ทำหน้าที่วิเคราะห์สินค้าและจัดพิกัดศุลกากรอย่างถูกต้อง

ให้คุณทำ 2 ส่วน:
1) สรุปข้อมูลจากฐานข้อมูล (อย่าแก้ไข)
2) วิเคราะห์พิกัดใหม่ตามหลักเกณฑ์ศุลกากรไทย โดยใช้ความรู้ของคุณเอง แม้ข้อมูลในฐานข้อมูลจะไม่ครบก็ตาม

รูปแบบคำตอบ:

📦 ข้อมูลจากฐานข้อมูล
– TH: ${item.th}
– EN: ${item.en}
– HS CODE (จากฐานข้อมูล): ${item.hsCode}
– อากร: ${item.no}
– FE: ${item.fe}

🤖 ข้อมูลที่ AI วิเคราะห์เพิ่มเติม
– HS CODE ที่ AI คิดว่าใช่:
– เหตุผล:
– ออกใบกำกับภาษีได้หรือไม่:
– ออกใบขนสินค้าได้หรือไม่:
– ข้อควรระวัง:

ข้อมูลสินค้าเพื่อวิเคราะห์:
TH: ${item.th}
EN: ${item.en}
`;
  } else {
    // กรณีไม่พบใน JSON
    prompt = `
คุณคือผู้เชี่ยวชาญด้านศุลกากรไทย ทำหน้าที่วิเคราะห์สินค้าและจัดพิกัดศุลกากรอย่างถูกต้อง

ให้คุณวิเคราะห์พิกัดศุลกากรจากข้อความนี้:
"${keyword}"

รูปแบบคำตอบ:

🤖 ข้อมูลที่ AI วิเคราะห์
– HS CODE ที่ AI คิดว่าใช่:
– เหตุผล:
– ออกใบกำกับภาษีได้หรือไม่:
– ออกใบขนสินค้าได้หรือไม่:
– ข้อควรระวัง:
`;
  }

  const aiPart = await askGroq(prompt);

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

// force deploy 5
