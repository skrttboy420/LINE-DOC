const express = require('express');
const bodyParser = require('body-parser');
const { Client, middleware } = require('@line/bot-sdk');

// โหลดไฟล์ JSON รวมเป็นก้อนเดียว
const hs1 = require('./data/hs_1_200.json');
const hs2 = require('./data/hs_201_400.json');
const hs3 = require('./data/hs_401_600.json');
const hs4 = require('./data/hs_601_640.json');

// รวมข้อมูลทั้งหมดไว้ใน array เดียว
const hsData = [...hs1, ...hs2, ...hs3, ...hs4];

// ตั้งค่า LINE Bot
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_SECRET'
};

const client = new Client(config);
const app = express();

app.use(middleware(config));
app.use(bodyParser.json());


// ⭐ ฟังก์ชันค้นหา HS Code
function searchHS(keyword) {
  keyword = keyword.toLowerCase();

  return hsData.filter(item =>
    (item.hsCode || '').toLowerCase().includes(keyword) ||
    (item.en || '').toLowerCase().includes(keyword) ||
    (item.th || '').toLowerCase().includes(keyword)
  );
}


// ⭐ Webhook endpoint
app.post('/webhook', (req, res) => {
  // ตอบกลับ LINE ทันที (สำคัญมาก)
  res.sendStatus(200);

  // ประมวลผล event ทั้งหมด
  Promise.all(req.body.events.map(handleEvent))
    .catch((err) => console.error(err));
});


// ⭐ ฟังก์ชันหลักที่ใช้ตอบข้อความ
function handleEvent(event) {

  // ถ้าไม่ใช่ข้อความ text → ไม่ตอบ
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const text = event.message.text;
  const sourceType = event.source.type; // user / group / room


  // ⭐ ถ้าอยู่ในกลุ่ม → ต้องแท็กก่อน
  if (sourceType === 'group' || sourceType === 'room') {
    if (!text.startsWith('@DOC BOT')) {
      return Promise.resolve(null); // ไม่ตอบถ้าไม่แท็ก
    }
  }

  // ⭐ ตัดชื่อบอทออก เหลือแต่คำค้น
  const keyword = text.replace('@DOC BOT', '').trim();

  // ⭐ ค้นหา HS Code
  const result = searchHS(keyword);

  let replyText = '';

  if (result.length === 0) {
    replyText = 'ไม่พบข้อมูลที่ค้นหา';
  } else {

    // ⭐ จัดรูปแบบผลลัพธ์ให้สวยงาม
    replyText = result.slice(0, 5).map(item =>
`──────────────
📦 HS CODE: ${item.hsCode}
🇬🇧 EN: ${item.en}
🇹🇭 TH: ${item.th}
💰 อากร: ${item.no || "-"}
📊 FE: ${item.fe || "-"}
──────────────`
    ).join('\n');
  }

  // ⭐ ส่งข้อความกลับไปที่ LINE
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}


// ⭐ เริ่มรันเซิร์ฟเวอร์ (Render จะกำหนด PORT เอง)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE bot is running on port ${PORT}`);
});
