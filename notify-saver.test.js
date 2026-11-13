/**
 * 🛡 ยาม — โหมดประหยัดโควตา (กองแจ้งเตือนไว้ แล้วส่งเป็นรอบ)
 * รัน: node notify-saver.test.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createNotifySaver } = require("./notify-saver");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name + "\n    " + (e && e.message)); }
}

/** เวลาไทยวันที่ 13/11/2026 เวลา HH:MM → ms (ไทย = UTC+7) */
const th = (h, m) => Date.UTC(2026, 10, 13, h - 7, m || 0);

console.log("\n🪫 โหมดประหยัดโควตา");

ok("ยังไม่ถึงรอบ = ไม่ส่ง (กองไว้ก่อน)", () => {
  const s = createNotifySaver({ hours: [9, 13, 17] });
  s.queue("U1", "งานใหม่ 1");
  assert.equal(s.shouldSend(th(8, 30)), false, "8:30 ยังไม่ถึงรอบ 9 โมง");
  assert.equal(s.pending().items, 1, "ของต้องยังอยู่ในกอง");
});

ok("🔴 ถึงรอบแล้ว + มีของค้าง = ส่ง · 1 คน 1 ข้อความ ไม่ว่ากี่เรื่อง", () => {
  /* นี่คือหัวใจของการประหยัด: เดิม 3 เรื่อง = 3 ข้อความ ⇒ ตอนนี้เหลือ 1 */
  const s = createNotifySaver({ hours: [9, 13, 17] });
  s.queue("U1", "เรื่อง A");
  s.queue("U1", "เรื่อง B");
  s.queue("U1", "เรื่อง C");
  s.queue("U2", "เรื่อง D");
  assert.equal(s.shouldSend(th(9, 1)), true);
  const out = s.flush(th(9, 1));
  assert.equal(out.length, 2, "2 คน = 2 ข้อความ");
  const u1 = out.find((x) => x.to === "U1");
  assert.equal(u1.items, 3);
  assert.match(u1.text, /3 เรื่อง/);
  for (const t of ["เรื่อง A", "เรื่อง B", "เรื่อง C"]) assert.ok(u1.text.includes(t), "ต้องมี " + t);
});

ok("🔴 ส่งรอบเดิมซ้ำไม่ได้ (ไม่งั้นเผาโควตาทุก 5 นาที)", () => {
  const s = createNotifySaver({ hours: [9, 13, 17] });
  s.queue("U1", "x");
  assert.equal(s.shouldSend(th(9, 1)), true);
  s.flush(th(9, 1));
  s.queue("U1", "y");
  assert.equal(s.shouldSend(th(9, 30)), false, "รอบ 9 โมงส่งไปแล้ว ต้องรอรอบ 13");
  assert.equal(s.shouldSend(th(12, 59)), false);
  assert.equal(s.shouldSend(th(13, 0)), true, "ถึงรอบ 13 แล้วส่งได้");
});

ok("ไม่มีของค้าง = ไม่ส่งอะไรเลย (ไม่เปลืองโควตาเปล่า)", () => {
  const s = createNotifySaver({ hours: [9] });
  assert.equal(s.shouldSend(th(10, 0)), false, "กองว่าง = ไม่ส่ง");
  assert.equal(s.pending().items, 0);
});

ok("ของที่กองข้ามคืน ต้องได้ส่งรอบแรกของวันใหม่", () => {
  const s = createNotifySaver({ hours: [9, 17] });
  s.queue("U1", "ค้างมาจากเมื่อคืน");
  assert.equal(s.shouldSend(th(9, 5)), true);
  const out = s.flush(th(9, 5));
  assert.equal(out[0].items, 1);
});

ok("🔴 ข้อความยาวเกินที่ LINE รับได้ ต้องตัด ไม่ใช่ส่งแล้วเด้งกลับ", () => {
  const s = createNotifySaver({ hours: [9], maxChars: 300 });
  for (let i = 0; i < 20; i++) s.queue("U1", "เรื่องที่ " + i + " " + "x".repeat(50));
  const out = s.flush(th(9, 1));
  assert.ok(out[0].text.length <= 400, "ต้องไม่ยาวเกินที่ตั้งไว้ · ได้ " + out[0].text.length);
  assert.match(out[0].text, /อีก \d+ เรื่อง/, "ต้องบอกว่าเหลืออีกกี่เรื่อง");
  assert.equal(out[0].items, 20, "ตัวเลขรวมต้องยังบอกครบ");
});

ok("บอกได้ว่ารอบถัดไปกี่โมง (ไว้โชว์ว่าจะเด้งอีกทีเมื่อไหร่)", () => {
  const s = createNotifySaver({ hours: [9, 13, 17] });
  assert.equal(s.nextHour(th(8, 0)), 9);
  assert.equal(s.nextHour(th(9, 30)), 13);
  assert.equal(s.nextHour(th(18, 0)), 9, "พ้นรอบสุดท้ายแล้ว = รอบแรกของพรุ่งนี้");
});

ok("ข้อความ/ผู้รับว่าง = ไม่เก็บเข้ากอง", () => {
  const s = createNotifySaver({ hours: [9] });
  assert.equal(s.queue("", "x"), false);
  assert.equal(s.queue("U1", "   "), false);
  assert.equal(s.pending().items, 0);
});

ok("สรุปสถานะเป็นภาษาคน", () => {
  const s = createNotifySaver({ hours: [9, 13, 17] });
  s.queue("U1", "a"); s.queue("U2", "b");
  const st = s.status(th(10, 0));
  assert.equal(st.pendingPeople, 2);
  assert.match(st.text, /ค้างอยู่ 2 เรื่อง/);
  assert.match(st.text, /รอบถัดไป 13:00/);
});

ok("🔴 ส่งไม่ออก ต้องรู้ว่าต้องคืนคีย์เรื่องไหน (ไม่งั้นงานหายเงียบ)", () => {
  /* 🪤 เลนเด้งทันทีคืนคีย์ด้วย told.delete() เมื่อส่งไม่ออก — เลนประหยัดต้องทำได้เหมือนกัน
     ไม่งั้นกองถูกล้างแล้วรอบหน้าไม่เสนออีก ⇒ งานค้างไม่มีใครรู้ */
  const s = createNotifySaver({ hours: [9] });
  s.queue("U1", "งาน A", th(8, 0), ["hs|U1|P1"]);
  s.queue("U1", "งาน B", th(8, 1), ["hs|U1|P2", "hs|U1|P3"]);
  const out = s.flush(th(9, 1));
  assert.deepEqual(out[0].keys, ["hs|U1|P1", "hs|U1|P2", "hs|U1|P3"], "ต้องคืนคีย์ของทุกเรื่องที่บอกไป");
  assert.deepEqual(out[0].spilled, [], "ไม่มีเรื่องถูกตัด = ไม่มีคีย์ค้าง");
});

ok("🔴 เรื่องที่ถูกตัดท้าย ต้องแยกไว้ในกอง spilled (ยังไม่ได้บอก)", () => {
  const s = createNotifySaver({ hours: [9], maxChars: 200 });
  for (let i = 0; i < 10; i++) s.queue("U1", "เรื่องที่ " + i + " " + "x".repeat(60), th(8, 0), ["k" + i]);
  const out = s.flush(th(9, 1));
  assert.ok(out[0].shown >= 1, "ต้องบอกได้อย่างน้อย 1 เรื่อง");
  assert.ok(out[0].spilled.length > 0, "ที่เหลือต้องอยู่ในกอง spilled");
  assert.equal(out[0].keys.length + out[0].spilled.length, 10, "คีย์ต้องครบ 10 ไม่หายไปเงียบๆ");
  for (const k of out[0].keys) assert.ok(!out[0].spilled.includes(k), "คีย์เดียวกันต้องไม่อยู่ 2 กอง");
});

ok("ไม่ส่งคีย์มาก็ไม่ล้ม (ข้อความระบบที่ไม่มีคีย์กันซ้ำ)", () => {
  const s = createNotifySaver({ hours: [9] });
  s.queue("U1", "⚠️ อ่านแจ้งเตือนไม่ได้");
  const out = s.flush(th(9, 1));
  assert.deepEqual(out[0].keys, []);
  assert.deepEqual(out[0].spilled, []);
});

ok("🔴 โควตาหมดทั้งเดือน กองต้องไม่บวม — ของเก่าเกิน 12 ชม. ถูกทิ้ง + คืนคีย์", () => {
  /* 🪤 ของจริง 13/11: โควตา 300/300 หมดแล้ว ⇒ เทกองไม่ออกเป็นสัปดาห์
     ไม่มีตัวกวาด = วันที่โควตาคืนมา จะยิงสรุปของเก่าเป็นร้อยเรื่องทีเดียว */
  const s = createNotifySaver({ hours: [9] });
  s.queue("U1", "งานเมื่อวาน", th(9, 0) - 20 * 3600_000, ["เก่า1"]);
  s.queue("U1", "งานเมื่อกี้", th(9, 0), ["ใหม่1"]);
  const gone = s.takeExpired(th(9, 0));
  assert.deepEqual(gone, ["เก่า1"], "ของเก่าต้องถูกทิ้งแล้วคืนคีย์ให้เสนอใหม่");
  assert.equal(s.pending().items, 1, "ของสดต้องอยู่ในกองต่อ");
  assert.deepEqual(s.takeExpired(th(9, 0)), [], "เก็บคีย์ไปแล้วต้องไม่ได้ซ้ำ");
});

ok("กองต่อคนไม่ล้น — เกินเพดานทิ้งของเก่าสุดก่อน", () => {
  const s = createNotifySaver({ hours: [9], maxPerPerson: 3 });
  for (let i = 0; i < 6; i++) s.queue("U1", "เรื่อง " + i, th(8, 0) + i, ["k" + i]);
  assert.equal(s.pending().items, 3, "เหลือในกอง 3");
  assert.deepEqual(s.takeExpired(), ["k0", "k1", "k2"], "ของเก่าสุดถูกทิ้งก่อน");
  const out = s.flush(th(9, 1));
  for (const n of ["3", "4", "5"]) assert.ok(out[0].text.includes("เรื่อง " + n), "ต้องเหลือของใหม่สุด");
});

ok("ไม่มีเวลาติดมา = ไม่ทิ้ง (ของที่กองข้ามคืนแบบไม่รู้เวลา)", () => {
  const s = createNotifySaver({ hours: [9] });
  s.queue("U1", "ไม่รู้เวลา");
  assert.deepEqual(s.takeExpired(th(9, 0)), [], "ไม่รู้เวลา = ไม่กล้าทิ้ง");
  assert.equal(s.pending().items, 1);
});

/* ── 🔌 ยามการต่อสาย: โค้ดจริงใน index.js ต้องใช้ของเหล่านี้จริง ───────── */
const IDX = fs.readFileSync("index.js", "utf8");

ok("🔴 index.js: โหมดประหยัดเป็นค่าตั้งต้น · ปิดได้ด้วย NOTIFY_MODE=live", () => {
  assert.ok(IDX.includes('NOTIFY_MODE || "saver"'), "ค่าตั้งต้นต้องเป็น saver");
  assert.ok(IDX.includes('!== "live"'), "ต้องมีทางปิดกลับไปเด้งทันที");
});

ok("🔴 index.js: รอบแจ้งเตือนต้องกองไว้ ไม่ใช่ยิงทันที (หัวใจของการประหยัด)", () => {
  const i = IDX.indexOf("async function runNotifyRound");
  assert.ok(i > 0, "ต้องมี runNotifyRound");
  const body = IDX.slice(i, i + 2600);
  const q = body.indexOf("notifySaver.queue(");
  const p = body.indexOf("lineClient.pushMessage(");
  assert.ok(q > 0, "ต้องเรียก notifySaver.queue");
  assert.ok(p > 0 && q < p, "ต้องกองก่อน แล้วถึงมีเลนยิงตรง (เลน live)");
  assert.ok(body.slice(q, q + 260).includes("return;"), "กองแล้วต้อง return — ห้ามไหลไปยิงต่อ");
  assert.ok(body.slice(q, q + 120).includes("plan.keys"), "ต้องส่งคีย์ไปกับกอง ไม่งั้นคืนให้รอบหน้าไม่ได้");
});

ok("🔴 index.js: ส่งสรุปไม่ออก ต้องคืนคีย์ให้รอบหน้า", () => {
  const i = IDX.indexOf("async function flushSaver");
  assert.ok(i > 0, "ต้องมี flushSaver");
  const body = IDX.slice(i, IDX.indexOf("async function refreshLineQuota"));
  assert.ok(body.includes("told.delete("), "ต้องมีการคืนคีย์ (told.delete) ในเลนนี้");
  assert.ok(body.includes("takeExpired("), "ต้องกวาดของเก่าในกองด้วย ไม่งั้นกองบวมทั้งเดือน");
  assert.ok(body.includes("spilled"), "เรื่องที่ถูกตัดท้ายก็ต้องคืน");
  assert.ok(body.includes("lineBudget.canPush()"), "โควตาหมด = ไม่ยิง");
  assert.ok(body.includes("noteFail(e)"), "เจอ 429 ต้องหยุดทั้งก้อน");
});

ok("🔴 หน้า /admin ต้องบอกว่าโหมดประหยัดเปิดอยู่ · ถามโควตาไม่ได้ก็ยังเห็น", () => {
  /* รันโค้ดวาดแถบจริงจากไฟล์หน้า /admin กับ document ปลอม — ไม่ต้องเปิดเบราว์เซอร์ */
  const ADM = fs.readFileSync("staff-admin.js", "utf8");
  const a = ADM.indexOf('var qb = document.getElementById("quota");');
  assert.ok(a > 0, "ต้องมีแถบโควตาในหน้า /admin");
  const b = ADM.indexOf('document.getElementById("rows")', a);
  assert.ok(b > a, "หาปลายบล็อกไม่เจอ");
  const block = ADM.slice(a, b);
  const run = (d) => {
    const el = { style: {}, innerHTML: "" };
    new Function("d", "document", block)(d, { getElementById: () => el });
    return el;
  };

  const both = run({
    lineQuota: { text: "เหลือ 0/300", blocked: true, left: 0 },
    saver: { text: "🪫 โหมดประหยัดโควตา — รวมส่งวันละ 3 รอบ (09:00 · 13:00 · 17:00)" },
  });
  assert.equal(both.style.display, "block");
  assert.ok(both.innerHTML.includes("โหมดประหยัดโควตา"), "ต้องเห็นว่าโหมดประหยัดเปิดอยู่");
  assert.ok(both.innerHTML.includes("เหลือ 0/300"), "ต้องยังเห็นโควตาด้วย");

  const noQuota = run({ lineQuota: null, saver: { text: "🪫 โหมดประหยัดโควตา" } });
  assert.equal(noQuota.style.display, "block", "ถามโควตาไม่ได้ ก็ยังต้องเห็นโหมด");
  assert.ok(noQuota.innerHTML.includes("🪫"), "ต้องมีบรรทัดโหมดประหยัด");

  const none = run({ lineQuota: null, saver: null });
  assert.equal(none.style.display, "none", "ไม่มีทั้งคู่ = ซ่อนแถบ");
});

ok("🔴 index.js: ตัวเทกองเกาะ timer เดิม ไม่เพิ่มตัวจับเวลาใหม่", () => {
  /* ตัวจับเวลาเดิมของบอทมี 4 ตัว: รอบ 5 นาที · ถามโควตารายชั่วโมง · กวาดทะเบียนรายวัน · self-ping
     โหมดประหยัดต้องเกาะตัวแรก ไม่เพิ่มตัวที่ 5 (เพิ่ม timer จริงๆ = แก้เลขนี้พร้อมเหตุผล) */
  const timers = IDX.split("setInterval(").length - 1;
  assert.equal(timers, 4, "โหมดประหยัดต้องไม่เพิ่มตัวจับเวลาใหม่ · ได้ " + timers);
  const i = IDX.indexOf("PENDING_POLL_MS = ");
  const block = IDX.slice(i, i + 900);
  assert.ok(block.includes("flushSaver()"), "ต้องเรียก flushSaver ในรอบ 5 นาทีเดิม");
});

console.log("\n" + (fail ? "❌" : "✅") + " notify-saver: " + pass + " pass, " + fail + " fail");
if (fail) process.exit(1);
