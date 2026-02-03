const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('@line/bot-sdk');

const config = {
  channelAccessToken: 'YOUR_CHANNEL_ACCESS_TOKEN',
  channelSecret: 'YOUR_CHANNEL_SECRET'
};

const client = new Client(config);
const app = express();

app.use(bodyParser.json());

// Webhook endpoint
app.post('/webhook', (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result));
});

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const replyText = `คุณส่งมา: ${event.message.text}`;
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

app.listen(3000, () => {
  console.log('LINE bot is running on port 3000');
});
