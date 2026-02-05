const express = require('express');
const bodyParser = require('body-parser');
const { Client, middleware } = require('@line/bot-sdk');

// โหลดไฟล์ JSON
const hs1 = require('./data/hs_1_200.json');
const hs2 = require('./data/hs_201_400.json');
const hs3 = require('./data/hs_401_600.json');
const hs4 = require('./data/hs_601_640.json');

const hsData = [...hs1, ...hs2, ...hs3, ...hs4];

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'uNAfXhwru741v4jGgEzSgvWcxj1ybZPDvnikgnY9CbKLGQnl7ogTXhwdxaroqtIUIghM6aht4cUizvaSFdrfkiRpoqp/DUzdd7Yy/4uI/PGq1SI5Qzp2eyL7V6ey88BxeXQt6WUbQqUAB3lWYqvL+wdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.CHANNEL_SECRET || '6301b4525bc2ae0a4b6973ef7c53004d'
};

const client = new Client(config);
const app = express();

app.use(middleware(config));
app.use(bodyParser.json());

// ฟังก์ชันค้นหา HS
function searchHS(keyword) {
  keyword = keyword.toLowerCase();

  return hsData.filter(item =>
    (item.hsCode || '').toLowerCase().includes(keyword) ||
    (item.en || '').toLowerCase().includes(keyword) ||
    (item.th || '').toLowerCase().includes(keyword)
  );
}

// Webhook endpoint
app.post('/webhook', (req, res) => {
  // ตอบกลับทันทีด้วย 200 เพื่อให้ LINE Verify ผ่าน
  res.sendStatus(200);

  // ประมวลผล event ที่ LINE ส่งมา
  Promise.all(req.body.events.map(handleEvent))
    .catch((err) => console.error(err));
});

function handleEvent(event) {
  // ถ้าไม่ใช่ข้อความ text → ข้าม
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const keyword = event.message.text;
  const result = searchHS(keyword);

  let replyText = '';

  if (result.length === 0) {
    replyText = 'ไม่พบข้อมูลที่ค้นหา';
  } else {
    replyText = result.slice(0, 5).map(item =>
`📦 HS CODE: ${item.hsCode}
🇬🇧 EN: ${item.en}
🇹🇭 TH: ${item.th}
💰 อากร: ${item.no || "-"}
📊 FE: ${item.fe || "-"}`
).join('\n');
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

// Render จะใช้ PORT จาก environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE bot is running on port ${PORT}`);
});
