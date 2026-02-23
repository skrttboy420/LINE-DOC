// ------------------------------------------------------
// ⭐ IMPORT MODULES
// ------------------------------------------------------
require('dotenv').config();
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
// ⭐ STATE MACHINE (เก็บใน Supabase)
// ------------------------------------------------------
async function setState(userId, state, data = {}) {
  await supabase
    .from("conversation_state")
    .upsert({
      user_id: userId,
      state,
      data,
      updated_at: new Date()
    });
}

async function getState(userId) {
  const { data } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  return data || null;
}

async function clearState(userId) {
  await supabase
    .from("conversation_state")
    .delete()
    .eq("user_id", userId);
}

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
// ⭐ GET /webhook
// ------------------------------------------------------
app.get('/webhook', (req, res) => {
  res.send("OK");
});

// ------------------------------------------------------
// ⭐ POST /webhook
// ------------------------------------------------------
app.post('/webhook', middleware(config), (req, res) => {
  res.sendStatus(200);
  Promise.all(req.body.events.map(handleEvent))
    .catch((err) => console.error("HANDLE EVENT ERROR:", err));
});

// ------------------------------------------------------
// ⭐ หลังจาก webhook แล้วค่อยใช้ express.json()
// ------------------------------------------------------
app.use(express.json());

// ------------------------------------------------------
// ⭐ RISK SCANNER
// ------------------------------------------------------
const RISK_KEYWORDS = [
  { keyword: "LED", reason: "สินค้าเกี่ยวกับแสงสว่าง/อิเล็กทรอนิกส์ มักถูกสุ่มตรวจ", level: "สูง" },
  { keyword: "เลเซอร์", reason: "เลเซอร์เป็นสินค้าควบคุมหลายประเภท", level: "สูง" },
  { keyword: "laser", reason: "เลเซอร์เป็นสินค้าควบคุมหลายประเภท", level: "สูง" },
  { keyword: "wireless", reason: "อุปกรณ์ไร้สายอาจเกี่ยวข้องกับ กสทช./มาตรฐานสัญญาณ", level: "กลาง" },
  { keyword: "bluetooth", reason: "อุปกรณ์ไร้สายอาจเกี่ยวข้องกับ กสทช./มาตรฐานสัญญาณ", level: "กลาง" },
  { keyword: "battery", reason: "แบตเตอรี่เป็นสินค้าที่มักถูกตรวจเรื่องความปลอดภัย", level: "กลาง" },
  { keyword: "แบตเตอรี่", reason: "แบตเตอรี่เป็นสินค้าที่มักถูกตรวจเรื่องความปลอดภัย", level: "กลาง" },
  { keyword: "เครื่องมือแพทย์", reason: "เข้าข่ายสินค้าควบคุม อย./ใบอนุญาตเฉพาะ", level: "สูง" },
  { keyword: "medical", reason: "เข้าข่ายสินค้าควบคุม อย./ใบอนุญาตเฉพาะ", level: "สูง" },
  { keyword: "ของเล่น", reason: "ของเล่นเด็กมักเกี่ยวข้องกับมาตรฐานความปลอดภัย", level: "กลาง" },
  { keyword: "toy", reason: "ของเล่นเด็กมักเกี่ยวข้องกับมาตรฐานความปลอดภัย", level: "กลาง" },
  { keyword: "ไฟฟ้า", reason: "สินค้าไฟฟ้ามักเกี่ยวข้องกับ มอก. และความปลอดภัย", level: "กลาง" },
  { keyword: "electrical", reason: "สินค้าไฟฟ้ามักเกี่ยวข้องกับมาตรฐานความปลอดภัย", level: "กลาง" }
];

function analyzeRisk(text) {
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();

  const hits = [];

  for (const rule of RISK_KEYWORDS) {
    const kw = rule.keyword;
    const inUpper = upper.includes(kw.toUpperCase());
    const inLower = lower.includes(kw.toLowerCase());
    if (inUpper || inLower) hits.push(rule);
  }

  if (hits.length === 0) {
    return {
      level: "ต่ำ",
      message: "✅ ไม่พบคำที่เข้าข่ายความเสี่ยงชัดเจนจากชื่อสินค้า"
    };
  }

  let finalLevel = "ต่ำ";
  if (hits.some(h => h.level === "สูง")) finalLevel = "สูง";
  else if (hits.some(h => h.level === "กลาง")) finalLevel = "กลาง";

  const reasons = hits.map(h => `• พบคำว่า "${h.keyword}" → ${h.reason}`).join("\n");

  return {
    level: finalLevel,
    message:
      (finalLevel === "สูง" ? "🚨 พบความเสี่ยงสูงจากชื่อสินค้า\n" :
       finalLevel === "กลาง" ? "⚠️ พบความเสี่ยงปานกลางจากชื่อสินค้า\n" :
       "✅ ความเสี่ยงต่ำจากชื่อสินค้า\n") +
      reasons
  };
}

// ------------------------------------------------------
// ⭐ SEARCH FROM DATABASE
// ------------------------------------------------------
async function searchHS(keyword) {
  const { data, error } = await supabase
    .from("hs_codes")
    .select("*")
    .or(`th.ilike.%${keyword}%,en.ilike.%${keyword}%,hs_code.ilike.%${keyword}%`)
    .limit(20);

  if (error) return [];
  return data;
}
// ------------------------------------------------------
// ⭐ FLEX MESSAGE BUILDER (COMPACT VERSION)
// ------------------------------------------------------
function buildHSFlex(results, riskInfo, keyword) {
  // จำกัดผลลัพธ์แค่ 2 รายการ เพื่อลด payload
  const topResults = results.slice(0, 2);

  const headerBubble = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "HS CODE",
          weight: "bold",
          size: "md"
        },
        {
          type: "text",
          text: `คำค้น: ${keyword}`,
          size: "xs",
          wrap: true,
          margin: "sm",
          color: "#666666"
        },
        {
          type: "text",
          text: `ความเสี่ยง: ${riskInfo.level}`,
          size: "xs",
          wrap: true,
          margin: "sm",
          color: "#444444"
        }
      ]
    }
  };

  const itemBubbles = topResults.map((item, i) => ({
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: `#${i + 1} HS: ${item.hs_code || "-"}`,
          weight: "bold",
          size: "sm",
          wrap: true
        },
        {
          type: "text",
          text: `TH: ${item.th || "-"}`,
          size: "sm",
          wrap: true
        },
        {
          type: "text",
          text: `EN: ${item.en || "-"}`,
          size: "xs",
          wrap: true,
          color: "#666666"
        }
      ]
    }
  }));

  return {
    type: "flex",
    altText: "ผลการค้นหา HS CODE",
    contents: {
      type: "carousel",
      contents: [headerBubble, ...itemBubbles]
    }
  };
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
        messages
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
    return "⚠️ ระบบ AI ไม่สามารถวิเคราะห์ได้ในขณะนี้";
  }
}

// ------------------------------------------------------
// ⭐ SAVE / LOAD HISTORY
// ------------------------------------------------------
async function saveMessage(userId, role, content) {
  await supabase.from("conversation_history").insert({
    user_id: userId,
    role,
    content
  });
}

async function loadHistory(userId) {
  const { data } = await supabase
    .from("conversation_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  return data?.map(row => ({
    role: row.role,
    content: row.content
  })) || [];
}

// ------------------------------------------------------
// ⭐ MAIN EVENT HANDLER (เวอร์ชันเคลียร์ + เสถียร)
// ------------------------------------------------------
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text;
  const userId = event.source.userId;
  const keyword = text.replace('@DOC BOT', '').trim();

 
  // ⭐ ประกาศ riskInfo
  const riskInfo = analyzeRisk(keyword);
  
  // --------------------------------------------------
// ⭐ SEARCH MODE
// --------------------------------------------------
const results = await searchHS(keyword);

if (results.length > 0) {
  const flex = buildHSFlex(results, riskInfo, keyword);
  return client.replyMessage(event.replyToken, flex);
}

    const systemPrompt = `
กำหนดให้คุณเป็น "เพื่อนร่วมงานสายลุยด่านศุลกากร" ที่เชี่ยวชาญและชำนาญการด้านการนำเข้า–ส่งออก
โดยเฉพาะการวิเคราะห์พิกัดศุลกากรไทย (HS CODE) ตามโครงสร้างพิกัดของกรมศุลกากรไทย
อิงจากฐานข้อมูลพิกัดศุลกากรฉบับใหม่ HS 2022 (HH22) เท่านั้น

บริบทงาน:
- งานหลักคือการนำเข้าสินค้าจากจีนเข้าไทย (ทางเรือ, รถ, เครื่องบิน)
- การอ้างอิงพิกัดและอัตราอากร ให้ยึดตามกรมศุลกากรไทยเป็นหลัก
- ให้คำนึงถึงการใช้สิทธิพิเศษทางภาษี เช่น FORM E, ACFTA และตรวจสอบว่ามีข้อห้าม/ข้อจำกัดประเทศต้นทางหรือไม่
- ให้พิจารณาว่าสินค้า "ติดกรม" หรือไม่ เช่น อย., มอก., กรมโรงงาน, กรมควบคุมมลพิษ, การป้องกันและตอบโต้ทางการค้า ฯลฯ
- ให้มองมุมมองแบบ "บริษัทเฟรทที่สนิทกับเจ้าหน้าที่" มีประสบการณ์เคลียร์งาน เคลียร์ตู้ ปิดตรวจ โดยไม่โดนย้อนหลัง
  แต่ทุกคำแนะนำต้องอยู่ในเชิง "เลี่ยงความเสี่ยงอย่างชาญฉลาด" ไม่ใช่ชี้นำให้ทำผิดกฎหมายตรง ๆ

บุคลิกของคุณ:
- เป็นฟีลเพื่อนร่วมงานที่กวน ๆ หน่อยได้ พูดตรง มีมุก มีคำด่าเบา ๆ ได้ แต่ต้องมีสาระ
- น้ำเสียงกันเอง ไม่ต้องเป็นทางการเกินไป แต่ต้องชัดเจนและมืออาชีพในเนื้อหา
- ไม่พูดจาเหยียดหยาม หรือชี้นำให้ทำผิดกฎหมายอย่างชัดเจน
- โฟกัสที่การ "ลดความเสี่ยง" และ "จัดการเอกสาร/พิกัดให้เนียนและปลอดภัยที่สุด"

หน้าที่หลักของคุณเมื่อได้รับ "ชื่อสินค้า" หรือ "คำอธิบายสินค้า" (หรือแม้แต่แค่รูปสินค้า ถ้ามีข้อมูลพอ):
1) วิเคราะห์พิกัดศุลกากร (HS CODE) ที่เหมาะสมที่สุดตามหลักการของกรมศุลกากรไทย (HS 2022)
2) แจ้งชื่อสินค้า "ภาษาไทย–อังกฤษ" ที่เหมาะสมสำหรับใช้ลงในใบขน
3) ระบุ:
   - HS CODE หลักที่แนะนำ
   - อัตราอากรขาเข้า (STAT 000) โดยอิงโครงสร้างปกติของกรมศุลกากร (ถ้าระบุตัวเลขไม่ได้ ให้บอกเป็นแนวโน้ม เช่น ต่ำ/กลาง/สูง)
   - ความเป็นไปได้ในการใช้สิทธิ FORM E (หรือ FTA อื่น ๆ ถ้าเกี่ยวข้อง) และอัตราอากรเมื่อใช้สิทธิ
   - ตรวจว่ามีโอกาสติด ACFTA หรือข้อจำกัดประเทศต้นทางหรือไม่ (ถ้าข้อมูลไม่พอ ให้ระบุว่า "ต้องตรวจสอบเพิ่มเติม")
4) ตรวจสอบและแจ้งว่า:
   - สินค้ามีโอกาสติดหน่วยงานกำกับดูแลใดบ้าง เช่น อย., มอก., กรมโรงงาน, กรมควบคุมมลพิษ, กสทช., การป้องกันและตอบโต้ทางการค้า ฯลฯ
   - ถ้ามี ให้ระบุ "ใบอนุญาต/มาตรฐาน" ที่อาจเกี่ยวข้อง เช่น มอก., อย., ใบอนุญาตนำเข้า ฯลฯ
5) ถ้าพิกัดหลักมีความเสี่ยงสูง หรือติดกรม/ติดใบอนุญาต:
   - ให้เสนอ "ทางเลือกพิกัดที่ความเสี่ยงต่ำกว่า" หรือ "คำอธิบายสินค้า" ที่อาจช่วยลดการตีความให้ไม่ติดกรม
   - แต่ต้องไม่บิดเบือนข้อเท็จจริงของสินค้าอย่างชัดเจน
6) ให้เตือนเสมอว่า:
   - การประเมินทั้งหมดเป็น "การประเมินเบื้องต้น" เท่านั้น
   - การตัดสินใจสุดท้ายขึ้นกับด่านศุลกากรและเจ้าหน้าที่ที่รับผิดชอบ

รูปแบบคำตอบที่ต้องการ (สำคัญมาก):
- ให้ตอบเป็นภาษาไทย
- ใช้อีโมจิพอประมาณเพื่อให้อ่านง่าย
- แบ่งหัวข้อชัดเจน อ่านง่าย ก๊อปวางง่าย
- หลีกเลี่ยงยาวเยิ่นเย้อเกินไป เน้น "เอาไปใช้ทำงานได้จริง"

โครงสร้างคำตอบ (Template):

📦 สินค้า:
- ชื่อไทย: <ชื่อไทยที่แนะนำ>
- ชื่ออังกฤษ: <ชื่ออังกฤษที่แนะนำ>

📘 พิกัดศุลกากรที่แนะนำ:
- HS CODE: <รหัส HS ที่แนะนำ หรือ "ต้องตรวจสอบเพิ่มเติม">
- คำอธิบายพิกัด (ย่อ ๆ): <อธิบายสั้น ๆ ว่าพิกัดนี้คืออะไร>

💰 อัตราอากร (ประเมินจากโครงสร้างกรมศุลกากร):
- อากรขาเข้า (STAT 000): <เช่น 5% / 10% / "ต้องตรวจสอบเพิ่มเติม">
- สิทธิพิเศษ FORM E / FTA: <ใช้ได้/ใช้ไม่ได้/มีโอกาสใช้ได้ พร้อมเหตุผลสั้น ๆ>
- หมายเหตุ: <ถ้ามีเงื่อนไขพิเศษ เช่น ต้องมี C/O, ต้องระบุ description แบบใด>

🚨 ความเสี่ยง & การติดกรม/ใบอนุญาต:
- ระดับความเสี่ยง: ต่ำ / กลาง / สูง (จากมุมมองด่านศุลกากร)
- หน่วยงานที่อาจเกี่ยวข้อง: <เช่น อย., มอก., กสทช., กรมโรงงาน ฯลฯ หรือ "ไม่พบชัดเจน">
- ใบอนุญาต/มาตรฐานที่อาจต้องใช้: <ถ้ามี>
- ข้อควรระวัง: <คำเตือนสั้น ๆ>

🧩 ทางเลือก/เล่ห์เหลี่ยมเชิงเทคนิค (ในกรอบกฎหมาย):
- แนวทางการเขียนชื่อสินค้าในใบขนให้ "เนียน" แต่ไม่โกหก: <ตัวอย่างคำอธิบาย>
- พิกัดทางเลือก (ถ้ามี): <HS CODE + เหตุผลสั้น ๆ>
- ข้อควรระวังถ้าใช้ทางเลือกนี้: <เตือนความเสี่ยง>

📎 หมายเหตุสำคัญ:
- การประเมินนี้เป็นเพียงแนวทางเบื้องต้นจากมุมมองผู้เชี่ยวชาญ
- การตัดสินใจสุดท้ายขึ้นกับด่านศุลกากร เอกสารประกอบ และการตรวจของเจ้าหน้าที่
- ถ้าข้อมูลสินค้าไม่ครบถ้วน ให้คุณถามกลับแบบเพื่อนร่วมงาน เช่น ขอสเปกเพิ่ม, วัสดุ, การใช้งาน, รูปสินค้า ฯลฯ

น้ำเสียง:
- เป็นกันเอง กวนได้ ด่าได้เบา ๆ แบบเพื่อนร่วมงาน แต่ต้องไม่หยาบคายเกินไป
- เน้นสาระและความชัดเจน ให้คนอ่าน "เอาไปใช้ทำงานจริง" ได้เลย
`;

  const userPrompt = `
ชื่อสินค้าที่ต้องการวิเคราะห์:
"${keyword}"

ให้คุณตอบตามรูปแบบที่กำหนดด้านบนเท่านั้น
`;

  const history = await loadHistory(userId);
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userPrompt }
  ];

  const aiPart = await askGroq(messages);

  await saveMessage(userId, "assistant", aiPart);

  const finalText = `${riskInfo.message}\n\n🧠 การวิเคราะห์โดยผู้ช่วยศุลกากร AI:\n\n${aiPart}`;

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: finalText
  });
  
  }
// ------------------------------------------------------
// ⭐ START SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE bot is running on port ${PORT}`);
});