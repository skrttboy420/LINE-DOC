const express = require('express');
const bodyParser = require('body-parser');
const { Client, middleware } = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_CHANNEL_ACCESS_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_CHANNEL_SECRET'
};

const client = new Client(config);
const app = express();

app.use(bodyParser.json());
app.use(middleware(config));

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

  // ตอบกลับข้อความที่ผู้ใช้ส่งมา
  const replyText = `คุณส่งมา: ${event.message.text}`;
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

