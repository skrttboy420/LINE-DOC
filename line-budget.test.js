/**
 * 🛡 ยาม — ตัวคุมงบข้อความ push ของ LINE
 * รัน: node line-budget.test.js
 */
const assert = require("node:assert/strict");
const { createLineBudget, isQuotaError, BLOCK_MS } = require("./line-budget");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name + "\n    " + (e && e.message)); }
}
console.log("\n💰 โควตาข้อความ push ของ LINE");

ok("รู้จัก 429 ทุกแบบที่ไลบรารีเขียนมา", () => {
  assert.equal(isQuotaError({ statusCode: 429 }), true, "line-bot-sdk");
  assert.equal(isQuotaError({ response: { status: 429 } }), true, "axios");
  assert.equal(isQuotaError({ status: 429 }), true, "fetch");
  assert.equal(isQuotaError(new Error("Request failed with status code 429")), true, "ข้อความล้วน");
  assert.equal(isQuotaError({ statusCode: 500 }), false, "500 ไม่ใช่โควตา");
  assert.equal(isQuotaError(new Error("timeout")), false);
  assert.equal(isQuotaError(null), false);
});

ok("🔴 เจอโควตาหมดแล้วต้องหยุดยิง ไม่ใช่ยิงต่อทุก 5 นาที", () => {
  /* 🪤 ของจริง 13/11: โควตาหมดแล้วบอทยังยิง 13 คน ทุก 5 นาที
     = ~3,700 คำขอ/วัน ที่รู้อยู่แล้วว่าโดนปฏิเสธ · log ท่วมจนหาของจริงไม่เจอ */
  let t = 1_000_000;
  const b = createLineBudget(() => t);
  assert.equal(b.canPush(), true, "ตอนแรกต้องยิงได้");
  assert.equal(b.noteFail({ statusCode: 429 }), true, "ต้องบอกคนเรียกว่าเป็นเรื่องโควตา");
  assert.equal(b.canPush(), false, "หลังเจอ 429 ต้องหยุด");
  t += BLOCK_MS - 1;
  assert.equal(b.canPush(), false, "ยังไม่ครบเวลา ยังต้องหยุด");
  t += 2;
  assert.equal(b.canPush(), true, "ครบเวลาแล้วลองใหม่ได้");
});

ok("error อื่นไม่ทำให้หยุดยิง (เน็ตสะดุดครั้งเดียวต้องไม่ดับทั้งระบบ)", () => {
  const b = createLineBudget(() => 0);
  assert.equal(b.noteFail(new Error("socket hang up")), false);
  assert.equal(b.canPush(), true);
});

ok("ยิงผ่านเมื่อไหร่ = ปลดล็อกทันที", () => {
  let t = 0;
  const b = createLineBudget(() => t);
  b.noteFail({ statusCode: 429 });
  assert.equal(b.canPush(), false);
  b.noteOk();
  assert.equal(b.canPush(), true, "ส่งได้แล้วต้องกลับมาทำงานเลย ไม่ต้องรอครบชั่วโมง");
});

ok("นับจำนวนครั้งที่ข้ามไป — ไว้บอกว่าเงียบไปเท่าไหร่", () => {
  let t = 0;
  const b = createLineBudget(() => t);
  b.noteFail({ statusCode: 429 });
  b.noteSkip(13); b.noteSkip(13);
  assert.equal(b.status().skipped, 26);
  assert.equal(b.status().blocked, true);
});

ok("อ่านโควตาจาก LINE แล้วบอกเหลือเท่าไหร่เป็นภาษาคน", () => {
  const b = createLineBudget(() => 0);
  assert.equal(b.left(), null, "ยังไม่ได้ถาม = ไม่เดา");
  b.setQuota(300, 300);
  assert.equal(b.left(), 0);
  assert.match(b.status().text, /โควตาหมด/);
  b.setQuota(300, 270);
  assert.equal(b.left(), 30);
  assert.equal(b.status().low, true, "เหลือน้อยต้องติดธงเตือน");
  b.setQuota(15000, 120);
  assert.equal(b.status().low, false);
  assert.match(b.status().text, /เหลือ 14880/);
});

ok("ตัวเลขเพี้ยนจาก LINE ต้องไม่ทำให้พัง", () => {
  const b = createLineBudget(() => 0);
  b.setQuota(undefined, "ไม่รู้");
  assert.equal(b.left(), null);
  assert.equal(b.status().text, "ยังไม่รู้โควตา");
});

console.log("\n" + (fail ? "❌" : "✅") + " line-budget: " + pass + " pass, " + fail + " fail");
if (fail) process.exit(1);
