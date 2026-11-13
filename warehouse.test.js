// ============================================================
// 🧪 เทสโกดัง 3D — ผัง + สีบนจอ (ภูม 2026-11-12)
//
// รัน:  node warehouse.test.js
//
// 🔑 ทำไมต้องมี: สีบนจอ 3D คือตัวบอกพนักงานว่า **หยิบได้/ห้ามหยิบ**
//    ภูม: *"พนักงานแม่งเอาของที่ลูกค้ายังไม่ชำระ ไปส่งลูกค้า"*
//    ⇒ ถ้าสีเพี้ยนแม้ครั้งเดียว = ของออกจากโกดังผิดคน (เงินจริง ลูกค้าจริง)
//    ยามที่นี่ล็อกกติกาสีไว้ทุกข้อ
//
// 🚫 ไม่ต่อไลน์/Supabase/เว็บ Pacred — คณิตศาสตร์กับกติกาเท่านั้น
// ============================================================

const assert = require("node:assert/strict");
const fs = require("node:fs");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}
const section = (s) => console.log("\n" + s);

const L = require("./warehouse-layout");
const W = require("./warehouse");

/* ════ ① ผังตรงกับไฟล์ที่ภูมส่งมา ════════════════════════════════════ */
section("ผังโกดัง (ตามไฟล์ของภูม)");

ok("ขนาดช่อง 250 × 120 × 165 · คาน 10 · เสา 7 · ทางเดิน 300", () => {
  assert.deepEqual(L.CELL, { w: 250, d: 120, h: 165 });
  assert.equal(L.STRUCT.beam, 10);
  assert.equal(L.STRUCT.post, 7);
  assert.equal(L.STRUCT.aisle, 300);
});

ok("3 แถว — ซ้าย 6 · กลาง 10 · ขวา 10 ล็อก · 4 ชั้น", () => {
  assert.equal(L.LEVELS, 4);
  assert.deepEqual(L.ROWS.map((r) => r.key), ["A", "B", "C"]);
  assert.deepEqual(L.ROWS.map((r) => r.bays), [10, 10, 6], "แถวที่สั้น 6 ล็อก คือ C (ภูมยืนยัน 12/11)");
});

ok("รวม 26 ล็อก · 104 ช่องชั้น · 208 ช่องวาง (2 ฝั่งต่อช่อง)", () => {
  const t = L.buildLayout().totals;
  assert.deepEqual(t, { bays: 26, cells: 104, slots: 208 });
});

/* ════ ② รหัสโลเคชั่น [Row][Bay][Level] ═══════════════════════════════ */
section("รหัสโลเคชั่น");

ok("A0101 = แถว A ล็อก 1 ชั้น 1 (ตามตัวอย่างในไฟล์)", () => {
  assert.equal(L.locationCode("A", 1, 1), "A0101");
  assert.deepEqual(L.parseLocation("A0101"), { row: "A", bay: 1, level: 1, code: "A0101" });
});

ok("อ่านได้แม้พิมพ์ตัวเล็ก/มีขีด/มีเว้นวรรค (พนักงานพิมพ์มือ)", () => {
  assert.equal(L.parseLocation("a0101").code, "A0101");
  assert.equal(L.parseLocation(" A-01-01 ").code, "A0101");
  assert.equal(L.parseSlot("a0101-l").slot, "A0101-L");
});

ok("🔴 ช่องที่ไม่มีในผังต้องไม่ผ่าน (กันคีย์ช่องผี)", () => {
  assert.equal(L.parseLocation("C0107"), null, "แถว C มีแค่ 6 ล็อก");
  assert.equal(L.parseLocation("A0111"), null, "แถว A มีแค่ 10 ล็อก");
  assert.equal(L.parseLocation("A0501"), null, "มีแค่ 4 ชั้น");
  assert.equal(L.parseLocation("A0105").bay, 5, "A0105 = ชั้น 1 ล็อก 5 (รูปใหม่ ชั้นก่อนล็อก)");
  assert.equal(L.parseLocation("D0101"), null, "ไม่มีแถว D");
  assert.throws(() => L.locationCode("C", 7, 1), /ล็อกที่ 7 ไม่มีอยู่/);
  assert.throws(() => L.locationCode("A", 1, 5), /ชั้นที่ 5 ไม่มีอยู่/);
});

ok("ฝั่งรับแค่ L / R", () => {
  assert.equal(L.slotCode("A0101", "r"), "A0101-R");
  assert.throws(() => L.slotCode("A0101", "X"), /ฝั่งต้องเป็น/);
  assert.equal(L.parseSlot("A0101-X"), null);
});

ok("ชื่อที่คนอ่านรู้เรื่อง", () => {
  assert.equal(L.slotLabel("A0101-L"), "โซนขวา ชั้น 1 ล็อก 1 (ฝั่งซ้าย)");
  assert.equal(L.slotLabel("B0410"), "โซนกลาง ชั้น 4 ล็อก 10");
});

/* ════ ③ พิกัด XYZ ════════════════════════════════════════════════════ */
section("พิกัด XYZ (หน่วยเซนติเมตรของจริง)");

ok("แถวห่างกัน = ลึกชั้นวาง 120 + ทางเดิน 300", () => {
  assert.equal(L.rowOriginX("A"), 0);
  assert.equal(L.rowOriginX("B"), 420);
  assert.equal(L.rowOriginX("C"), 840);
});

ok("🔴 ทิศของผัง — ยืนยันกับภูมแล้ว 12/11 (ชี้จากผังมองจากบน)", () => {
  /* ภูม: ประตูหน้าโกดัง = ขอบซ้ายของผัง (ฝั่งล็อก 1) · แถว A = แถวล่างของผัง
     🪤 รอบแรกผมพลิกทั้งผังเพราะอ่านจอผิด (จอ 3D ตั้งกล้องไว้หลังโกดัง)
        ⇒ ยามนี้ล็อกทิศที่ภูมยืนยันไว้ ใครจะพลิกต้องมาแก้ตรงนี้ด้วย */
  assert.equal(L.DOOR.bayOneAtFarZ, false, "ล็อก 1 อยู่ต้นแกน Z (ฝั่งประตู)");
  assert.equal(L.DOOR.rowAatFarX, false, "แถว A อยู่ต้นแกน X");
  assert.equal(L.bayZ0("B", 1), 0, "ล็อก 1 ชิดขอบฝั่งประตู");
  assert.ok(L.bayZ0("B", 10) > L.bayZ0("B", 1), "ล็อกเลขมากกว่า = ลึกเข้าไปจากประตู");

  /* 🔴 แถว C สั้นกว่าเพื่อน (ภูม: *"ล็อก A ที่ 6 ล็อกต้องเป็น C"*)
     ส่วนที่หายอยู่ "ด้านใน" (ฝั่งออฟฟิศ) ไม่ใช่ด้านประตู */
  assert.equal(L.baysOf("C"), 6, "แถวสั้นคือ C");
  assert.equal(L.baysOf("A"), 10, "แถว A ยาวเต็มพื้นที่");
  const c = L.rowZSpan("C"), b = L.rowZSpan("B");
  assert.equal(c.end, b.end, "แถว C ต้องชิดผนังด้านหลังเท่ากับแถวอื่น");
  assert.ok(c.start > b.start, "ช่วงที่ว่างของแถว C ต้องอยู่ทางฝั่งประตู ไม่ใช่ด้านหลัง");
  assert.ok(L.bayZ0("C", 1) > L.bayZ0("B", 1), "ล็อก 1 ของ C เริ่มลึกเข้าไปจากประตู");
  assert.equal(L.bayZ0("C", 6), L.bayZ0("B", 10), "ล็อกลึกสุดของ C ต้องเสมอกับล็อกลึกสุดของ B");
});

ok("ล็อกถัดไปห่าง 257 (กว้าง 250 + เสา 7) · ชั้นถัดไปสูงขึ้น 175 (165 + คาน 10)", () => {
  assert.equal(L.BAY_PITCH, 257);
  assert.equal(L.LEVEL_PITCH, 175);
  const b1 = L.slotBox("B0101", "L"), b2 = L.slotBox("B0102", "L");
  assert.equal(b2.z - b1.z, 257, "ล็อกถัดไป = ลึกเข้าไปจากประตู 257");
  const l1 = L.slotBox("B0101", "L"), l2 = L.slotBox("B0201", "L");
  assert.equal(l2.y - l1.y, 175);
});

ok("2 ฝั่งในช่องเดียวกันไม่ทับกัน (กว้างครึ่งช่องคนละครึ่ง)", () => {
  const l = L.slotBox("A0101", "L"), r = L.slotBox("A0101", "R");
  assert.equal(l.w, 125);
  assert.equal(l.z - r.z, 125, "ซ้ายอยู่ลึกกว่าขวา 125 ซม. (ซ้าย=ครึ่งลึก ตามที่เห็นจากทางเดิน · ภูม 2026-11-13)");
  assert.equal(l.x, r.x);
  assert.equal(l.y, r.y);
});

ok("ของวางอยู่บนคาน ไม่จมพื้น", () => {
  const b = L.slotBox("A0101", "L");
  assert.equal(b.y - b.h / 2, L.STRUCT.beam, "ท้องของต้องอยู่สูงเท่าคาน");
});

ok("ขนาดโกดังรวม = 960 × 700 × 2570 ซม.", () => {
  assert.deepEqual(L.layoutExtent(), { x: 960, y: 700, z: 2570 });
});

/* ════ ④ 🔴 สีบนจอ = หยิบได้/ห้ามหยิบ (หัวใจของงานนี้) ════════════════ */
section("สีบนจอ 3D");

const job = (o) => Object.assign({ tracking: "T1", status: 6, paid: true, arrivedAt: "2026-11-10" }, o);

ok("🟢 ชำระแล้ว + ถึงไทยแล้ว = หยิบส่งได้", () => {
  const s = W.pickStateOf(job({}), true);
  assert.equal(s.pick, "ready");
  assert.equal(s.color, "#16a34a");
});

ok("🔴🟡 ยังไม่ชำระ = ห้ามหยิบ (เคสที่พนักงานหยิบผิดจริง)", () => {
  const s = W.pickStateOf(job({ status: 5, paid: false }), true);
  assert.equal(s.pick, "wait");
  assert.match(s.why, /ยังไม่ชำระ/);
  assert.match(s.why, /ห้ามหยิบ/);
});

ok("🟡 ชำระแล้วแต่ของมาไม่ครบทุกกล่อง = รอให้ครบ", () => {
  const s = W.pickStateOf(job({ boxesIn: 7, boxesTotal: 10 }), true);
  assert.equal(s.pick, "wait");
  assert.match(s.why, /7\/10/);
});

ok("ครบแล้ว = เขียว", () => {
  assert.equal(W.pickStateOf(job({ boxesIn: 10, boxesTotal: 10 }), true).pick, "ready");
});

ok("🔴 ระบบบอกส่งแล้ว แต่ของยังอยู่บนชั้น = มีคนหยิบกล่องอื่นไปส่งแทน", () => {
  const s = W.pickStateOf(job({ status: 7 }), true);
  assert.equal(s.pick, "problem");
  assert.match(s.why, /ส่งแล้ว/);
});

ok("🔴 ของอยู่บนชั้นไทย แต่ระบบยังเป็นกำลังส่งมาไทย = ยังไม่ได้ยิงรับเข้า", () => {
  const s = W.pickStateOf(job({ status: 3, paid: false, arrivedAt: null }), true);
  assert.equal(s.pick, "problem");
  assert.match(s.why, /ยังไม่ได้ยิงรับเข้า/);
});

ok("🔴 งานถูกระงับ = แดงเสมอ แม้ชำระแล้ว", () => {
  assert.equal(W.pickStateOf(job({ hold: true }), true).pick, "problem");
});

ok("⬛ มีของแต่หาแทรคในระบบไม่เจอ = เตือน ไม่ใช่เขียว", () => {
  const s = W.pickStateOf(null, true);
  assert.equal(s.pick, "unknown");
  assert.notEqual(s.color, "#16a34a");
});

ok("⬜ ไม่มีของวาง = ว่าง", () => {
  assert.equal(W.pickStateOf(null, false).pick, "empty");
  assert.equal(W.pickStateOf(job({}), false).pick, "empty", "ช่องว่างต้องว่าง แม้งานจะชำระแล้ว");
});

ok("🔴 งานเครดิตที่ถูกดันเป็นสถานะ 6 ก่อนของถึงไทย ต้องไม่เขียว", () => {
  /* เว็บดันเครดิตเป็น 6 ตอนอนุมัติ ⇒ paid=true ทั้งที่ของยังไม่ถึง
     ถ้าตัดสินด้วยตัวเลขสถานะเดียว จะได้เขียว = พนักงานออกไปหาของที่ยังอยู่จีน
     วัดจริงบน prod 11-12: งานเครดิตสถานะ 6 ที่ยังไม่มีวันชำระ มีอยู่จริง */
  assert.equal(W.pickStateOf(job({ status: 3, paid: true, arrivedAt: null }), true).pick, "problem");
  assert.equal(W.pickStateOf(job({ status: 6, paid: true, arrivedAt: null }), true).pick, "problem",
    "สถานะ 6 แต่ยังไม่ลงวันถึงไทย = ของยังไม่ถึง ห้ามเขียว");
  assert.equal(W.pickStateOf(job({ status: 6, paid: true, arrivedAt: "  " }), true).pick, "problem",
    "วันถึงไทยเป็นช่องว่าง = ยังไม่ถึง");
});

ok("🔴 ชำระแล้วแต่ยังไม่มีที่อยู่จัดส่ง = ห้ามเขียว (หยิบไปก็ส่งไม่ได้)", () => {
  const s = W.pickStateOf(job({ needsAddress: true }), true);
  assert.equal(s.pick, "wait");
  assert.match(s.why, /ยังไม่มีที่อยู่จัดส่ง/);
});

ok("งานรับเองหน้าโกดังที่ชำระแล้ว = เขียว + บอกว่ารับเอง", () => {
  const s = W.pickStateOf(job({ selfPickup: true, needsAddress: false }), true);
  assert.equal(s.pick, "ready");
  assert.match(s.why, /รับเองหน้าโกดัง/);
});

ok("ยังไม่ชำระ ชนะเรื่องที่อยู่ (เตือนเรื่องเงินก่อน)", () => {
  const s = W.pickStateOf(job({ status: 5, paid: false, needsAddress: true }), true);
  assert.equal(s.pick, "wait");
  assert.match(s.why, /ยังไม่ชำระ/);
});

ok("ช่องที่อยู่ถูกส่งต่อให้หน้าเว็บวาด", () => {
  const v = W.mergeView(
    [{ tracking: "T1", slot: "A0101-L", boxes: 1, placed_by: "u" }],
    [job({ tracking: "T1", address: "1/2 บางรัก กรุงเทพ 10500", receiver: "สมชาย ใจดี", tel: "0812345678", carrier: "2" })],
  );
  const it = v.layout.slots.find((s) => s.slot === "A0101-L").items[0];
  assert.equal(it.address, "1/2 บางรัก กรุงเทพ 10500");
  assert.equal(it.receiver, "สมชาย ใจดี");
  assert.equal(it.tel, "0812345678");
  assert.equal(it.carrier, "2");
});

ok("🔴 ช่องที่มีหลายกล่อง เอาสีที่ \"แรงสุด\" ไม่ใช่เสียงส่วนมาก", () => {
  assert.equal(W.worstOf(["ready", "ready", "wait"]), "wait", "มี 1 กล่องห้ามหยิบ ต้องเห็นว่าเตือน");
  assert.equal(W.worstOf(["ready", "wait", "problem"]), "problem");
  assert.equal(W.worstOf(["ready", "unknown"]), "unknown");
  assert.equal(W.worstOf(["ready", "ready"]), "ready");
  assert.equal(W.worstOf([]), "empty");
});

/* ════ ⑤ รวมข้อมูลทั้งโกดัง ═══════════════════════════════════════════ */
section("รวมผัง + ของที่วาง + งานจากเว็บ");

const PL = (t, slot, extra) => Object.assign({ tracking: t, slot: slot, boxes: 1, placed_by: "u1" }, extra);

ok("ช่องที่มีของได้สีตามงาน · ช่องที่เหลือว่าง", () => {
  const v = W.mergeView(
    [PL("TA", "A0101-L"), PL("TB", "B0305-R")],
    [job({ tracking: "TA" }), job({ tracking: "TB", status: 5, paid: false })],
  );
  const a = v.layout.slots.find((s) => s.slot === "A0101-L");
  const b = v.layout.slots.find((s) => s.slot === "B0305-R");
  assert.equal(a.status, "ready");
  assert.equal(b.status, "wait");
  assert.equal(v.counts.ready, 1);
  assert.equal(v.counts.wait, 1);
  assert.equal(v.counts.empty, 206, "ที่เหลือจาก 208 ต้องว่าง");
});

ok("ช่องเดียววางได้หลายแทรค · นับกล่องรวม", () => {
  const v = W.mergeView(
    [PL("T1", "A0101-L", { boxes: 3 }), PL("T2", "A0101-L", { boxes: 2 })],
    [job({ tracking: "T1" }), job({ tracking: "T2" })],
  );
  const s = v.layout.slots.find((x) => x.slot === "A0101-L");
  assert.equal(s.items.length, 2);
  assert.equal(s.boxes, 5);
});

ok("🔴 รายการเตือน — ช่องที่ขัดกับระบบต้องโผล่ในลิสต์ให้กดดูได้", () => {
  const v = W.mergeView([PL("TX", "A0410-R")], [job({ tracking: "TX", status: 7 })]);
  assert.equal(v.alerts.length, 1);
  assert.equal(v.alerts[0].slot, "A0410-R");
  assert.equal(v.alerts[0].tracking, "TX");
});

ok("🔴 งานพร้อมส่งที่ยังไม่มีใครคีย์ช่อง ต้องขึ้นเตือน (ไม่งั้นพนักงานหาไม่เจอแล้วหยิบมั่ว)", () => {
  const v = W.mergeView([], [job({ tracking: "TZ", memberCode: "PR001" })]);
  assert.equal(v.unplaced.length, 1);
  assert.equal(v.unplaced[0].tracking, "TZ");
  assert.equal(v.unplaced[0].memberCode, "PR001");
});

ok("งานที่ยังไม่ชำระและไม่มีช่อง ไม่ต้องเตือน (ยังไม่ถึงคิวหยิบ)", () => {
  const v = W.mergeView([], [job({ tracking: "TY", status: 5, paid: false })]);
  assert.equal(v.unplaced.length, 0);
});

ok("ของที่คีย์ช่องผี (ช่องไม่มีในผัง) ไม่ทำให้ทั้งจอล้ม — แยกไว้ให้แก้", () => {
  const v = W.mergeView([PL("TP", "Z9999-L"), PL("TQ", "A0101-L")], [job({ tracking: "TQ" })]);
  assert.equal(v.orphans.length, 1);
  assert.equal(v.orphans[0].tracking, "TP");
  assert.equal(v.layout.slots.find((s) => s.slot === "A0101-L").status, "ready");
});

ok("อ่านงานจากเว็บไม่ได้ = ช่องที่มีของขึ้น \"หาในระบบไม่เจอ\" ไม่ใช่เขียวหลอก", () => {
  const v = W.mergeView([PL("T1", "A0101-L")], []);
  assert.equal(v.layout.slots.find((s) => s.slot === "A0101-L").status, "unknown");
});

/* ════ ⑥ 🔒 ขอบเขต — ห้ามแตะระบบ Pacred ═════════════════════════════ */
section("ขอบเขต (ภูม: อย่าไปยุ่งกับระบบ pacred)");

ok("🔒 โค้ดโกดังเขียนได้แค่ตารางของบอท (wh_*) ห้ามแตะตารางของ Pacred", () => {
  const src = fs.readFileSync("warehouse.js", "utf8");
  for (const t of ["tb_forwarder", "tb_users", "momo_import_tracks", "tb_address", "tb_order"])
    assert.ok(!src.includes(t), "ห้ามอ้างตารางของ Pacred: " + t);
  const writes = src.match(/\.from\("([^"]+)"\)/g) || [];
  for (const w of writes)
    assert.ok(/wh_(placement|move_log)/.test(w), "ตารางที่แตะต้องเป็น wh_* เท่านั้น — เจอ " + w);
});

ok("🔒 อ่านเว็บ Pacred ผ่านท่อ pacredGet เท่านั้น (ไม่ยิงฐานตรง)", () => {
  const src = fs.readFileSync("warehouse.js", "utf8");
  assert.ok(src.includes('pacredGet("warehouse"'), "ต้องอ่านผ่าน /api/bot?q=warehouse");
  assert.ok(!/SUPABASE_URL|createClient/.test(src), "ห้ามสร้างตัวต่อฐานเอง — รับเข้ามาจาก index.js");
});

ok("🔴 ต้องส่งเลขแทรคที่อยู่บนชั้นไปถามเว็บ (ไม่งั้นเคส \"ส่งแล้วแต่ยังอยู่บนชั้น\" ขึ้นเทา)", () => {
  const src = fs.readFileSync("warehouse.js", "utf8");
  assert.ok(src.includes("jobsFromPacred(placements.map"), "view() ต้องส่งเลขแทรคไปด้วย");
  assert.ok(src.includes("slice(0, 400)"), "ต้องมีเพดานจำนวนที่ถาม");
});

ok("🔒 จอภาพรวมต้องขอ \"แค่ธง\" — ไม่ลากที่อยู่ลูกค้าทั้งโกดังมาทุกครั้งที่เปิดจอ", () => {
  /* owner/เดฟ 2026-11-12: *"จอ 3D ได้ชื่อ/เบอร์/ที่อยู่ของทุกกล่องบนชั้น ~585
     — ควรส่งแค่ธง แล้วถามรายกล่อง"*
     🪤 ห้ามแก้ด้วยการ "ไม่ส่ง t" — เคสเตือน "ส่งแล้วแต่ของยังอยู่" จะหาย
        ทางที่ถูก = ส่ง t ครบ แต่ขอ d (รายละเอียด) เป็นชุดว่าง */
  const src = fs.readFileSync("warehouse.js", "utf8");
  assert.ok(/jobsFromPacred\(placements\.map\(\(p\) => p\.tracking\), \[\]\)/.test(src),
    "view() ต้องส่ง t ครบ แต่ขอรายละเอียดเป็นชุดว่าง");
  assert.ok(src.includes("if (detail !== undefined) q.d ="), "ต้องมีช่อง d แยกจาก t");
  const page = fs.readFileSync("warehouse-page.js", "utf8");
  assert.ok(page.includes("jobsFromPacred([t], [t])"), "กดเปิดกล่องรายตัว = ขอรายละเอียดได้");
  assert.ok(page.includes("jobsFromPacred([tracking], [tracking])"), "ยิงรับเข้า = ขอรายละเอียดได้");
});

ok("🔴 ป๊อปอัพต้องไปขอที่อยู่รายกล่องเอง (ไม่งั้นเปิดดูแล้วที่อยู่หายทั้งจอ)", () => {
  const D3 = fs.readFileSync("warehouse-3d.html", "utf8");
  assert.ok(D3.includes("loadAddresses(s.items)"), "เปิดช่องแล้วต้องไปขอที่อยู่");
  assert.ok(D3.includes("/warehouse/api/job"), "ต้องขอผ่านท่อรายกล่อง");
  assert.ok(D3.includes('data-addr="'), "ต้องมีที่ให้เติมที่อยู่ทีหลัง");
});

ok("ตัวอ่านไล่เกิน 1000 แถว (PostgREST ตัดเงียบที่ 1000)", () => {
  const src = fs.readFileSync("warehouse.js", "utf8");
  assert.ok(src.includes(".range("), "ต้องอ่านเป็นช่วง");
  assert.ok(/length < 1000/.test(src), "ต้องวนจนครบ");
});

ok("ทุกการวาง/ย้าย/เอาออก ลงประวัติ", () => {
  const src = fs.readFileSync("warehouse.js", "utf8");
  for (const a of ['"place"', '"move"', '"remove"'])
    assert.ok(src.includes(a), "ต้องลงประวัติชนิด " + a);
});

/* ════ ⑦ ยิงบาร์โค้ด · ป้ายโลเคชั่น · เอาของออก (ภูม 2026-11-12) ════ */
section("ยิงบาร์โค้ด · ป้ายโลเคชั่น · เอาของออก");

const readFile = (p) => fs.readFileSync(p, "utf8");

ok("🔴 ต้องมีช่องก่อนถึงยิงแทรคได้ (ลำดับเดียวกับจอ Pacred)", () => {
  const src = readFile("warehouse-scan.html");
  assert.ok(src.includes("ยิงรหัสช่องก่อน แล้วค่อยยิงแทรค"), "ต้องเตือนให้ยิงช่องก่อน");
  assert.ok(/if \(!fullSlot\(\)\)/.test(src), "ต้องมีด่านเช็คว่ามีช่องแล้วหรือยัง");
});

ok("ยิงโดนรหัสช่อง = จำไว้เฉยๆ ไม่เขียนอะไร (ลอกจาก Pacred)", () => {
  const src = readFile("warehouse-scan.html");
  const i = src.indexOf("① ยิงโดนรหัสช่อง");
  const j = src.indexOf("② ต้องมีช่องก่อน");
  assert.ok(i > 0 && j > i, "ต้องเช็ครหัสช่องก่อนถึงจะไปทางเขียน");
  assert.ok(!src.slice(i, j).includes("/warehouse/api/scan"), "ทางจำรหัสช่องต้องไม่ยิง API เขียน");
});

ok("ยิงเสร็จต้องเคลียร์ช่อง + โฟกัสกลับ (ยิงรัวได้ไม่ต้องแตะจอ)", () => {
  const src = readFile("warehouse-scan.html");
  assert.ok(src.includes("focusScan()"), "ต้องมีตัวโฟกัสกลับ");
  assert.ok(src.includes('$("scan").value = "";'), "ต้องเคลียร์ช่องหลังยิง");
});

ok("🔴 รหัสช่องที่ไม่มีในผัง = เตือน ไม่เอาไปยิงเป็นเลขแทรค", () => {
  const src = readFile("warehouse-scan.html");
  assert.ok(src.includes("ไม่มีช่อง"), "ต้องมีข้อความเตือน");
  assert.ok(src.includes("slotExists("), "ต้องเช็คกับผังจริง");
});

ok("ป้ายโลเคชั่นใช้บาร์โค้ด Code128 เก็บรหัสช่อง", () => {
  const src = readFile("warehouse-labels.html");
  assert.ok(src.includes('format: "CODE128"'), "ต้องเป็น Code128");
  assert.ok(src.includes("l.code"), "บาร์โค้ดต้องเก็บรหัสช่อง");
  assert.ok(src.includes("@media print"), "ต้องมีกติกาสำหรับพิมพ์");
  assert.ok(src.includes("size:A4"), "ต้องตั้งขนาดกระดาษ");
});

ok("🔴 ป้ายต้องเก็บรหัสที่ \"ยิงแล้วเข้าช่องนั้นจริง\" — รูปแบบตรงกับตัวแกะของหน้ายิง", () => {
  /* ป้ายพิมพ์ A0101-L (ต่อช่องวาง) หรือ A0101 (ต่อช่องชั้น) — ทั้ง 2 แบบหน้ายิงต้องอ่านออก */
  const scan = readFile("warehouse-scan.html");
  assert.ok(/\^\(\[A-Z\]\)\(\\d\{2\}\)\(\\d\{2\}\)\(\[LR\]\)\$/.test(scan), "ต้องอ่าน A0101-L ได้");
  assert.ok(/\^\(\[A-Z\]\)\(\\d\{2\}\)\(\\d\{2\}\)\$/.test(scan), "ต้องอ่าน A0101 ได้");
  const lbl = readFile("warehouse-labels.html");
  assert.ok(lbl.includes("s.slot"), "โหมดต่อช่องวางต้องพิมพ์รหัสเต็ม");
  assert.ok(lbl.includes("s.location"), "โหมดต่อช่องชั้นต้องพิมพ์รหัสไม่มีฝั่ง");
});

ok("🚚 เอาของออกแยก 2 ชนิด — ขึ้นรถ กับ เอาออกเฉยๆ", () => {
  const src = readFile("warehouse.js");
  assert.ok(src.includes('kind === "load" ? "load" : "remove"'), "ต้องแยกชนิดตามที่ส่งมา");
  const d3 = readFile("warehouse-3d.html");
  assert.ok(d3.includes("data-out="), "จอ 3D ต้องมีปุ่มเอาขึ้นรถ");
  assert.ok(d3.includes("data-mv="), "จอ 3D ต้องมีปุ่มย้ายช่อง");
  assert.ok(d3.includes('kind: "load"'), "ปุ่มเอาขึ้นรถต้องส่ง kind=load");
});

ok("🔴 ฐานรุ่นเก่าที่ยังไม่รู้จักชนิด 'load' ต้องไม่ทำให้ประวัติหาย", () => {
  const src = readFile("warehouse.js");
  assert.ok(src.includes('String(error.code) === "23514"'), "ต้องจับด่าน check ที่ปฏิเสธ");
  assert.ok(/action: "remove"/.test(src), "ต้องลงเป็น remove แทน");
  assert.ok(src.includes('"ขึ้นรถ"'), "ต้องเขียนเหตุไว้ในหมายเหตุ");
});

ok("ไฟล์ SQL รองรับชนิด 'load' และรันซ้ำได้", () => {
  const sql = readFile("warehouse-schema.sql");
  assert.ok(sql.includes("'place','move','remove','load'"), "ด่านต้องรับ load");
  assert.ok(sql.includes("drop constraint if exists"), "ต้องรันซ้ำได้ไม่พัง");
});

ok("🔒 หน้าใหม่ทั้ง 2 หน้าอยู่หลังด่านคีย์เหมือนหน้าอื่น", () => {
  const page = readFile("warehouse-page.js");
  assert.ok(page.includes('app.get("/warehouse/scan", servePage('), "หน้ายิงต้องผ่าน servePage (มีด่านคีย์)");
  assert.ok(page.includes('app.get("/warehouse/labels", servePage('), "หน้าป้ายต้องผ่าน servePage");
  assert.ok(/app\.post\("\/warehouse\/api\/scan", json, async \(req, res\) => \{\s*if \(!guard\(req, res\)\) return;/.test(page),
    "ท่อยิงต้องมี guard บรรทัดแรก");
});

/* ════ ⑧ 🛡 ยามไวยากรณ์ของสคริปต์ในหน้าเว็บ ════════════════════════
   🪤 เจอจริง 2026-11-12: หน้า "ยิงรับเข้าชั้น" มีเครื่องหมายคำพูดไม่คู่กัน 1 จุด
      ⇒ ทั้งสคริปต์ไม่ทำงาน (กด Enter แล้วเงียบสนิท) แต่หน้าเปิดได้ปกติ ไม่มีอะไรฟ้อง
      node --check ตรวจได้แค่ไฟล์ .js — สคริปต์ที่ฝังในไฟล์ .html ไม่มีใครตรวจ
   ⇒ ยามนี้ดึงสคริปต์ออกมาจากทุกหน้า แล้วให้ node ตรวจไวยากรณ์ให้ */
section("ไวยากรณ์สคริปต์ในหน้าเว็บ");

const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const PAGES = ["warehouse-3d.html", "warehouse-assign.html", "warehouse-scan.html", "warehouse-labels.html"];

for (const page of PAGES) {
  ok("สคริปต์ใน " + page + " ไวยากรณ์ถูก", () => {
    const html = fs.readFileSync(page, "utf8");
    const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter((m) => !/\bsrc=/.test(m[1]));        // ข้ามสคริปต์ที่โหลดจากข้างนอก
    assert.ok(blocks.length > 0, "ต้องมีสคริปต์อย่างน้อย 1 ก้อน");
    blocks.forEach((m, i) => {
      const isModule = /type\s*=\s*["\']module["\']/.test(m[1]);
      const tmp = path.join(os.tmpdir(), "wh-syntax-" + page.replace(/\W/g, "") + "-" + i + (isModule ? ".mjs" : ".js"));
      fs.writeFileSync(tmp, m[2]);
      try {
        execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
      } catch (e) {
        const out = String((e.stderr || e.stdout || e.message) || "").split("\n").slice(0, 6).join("\n");
        throw new Error("สคริปต์ก้อนที่ " + (i + 1) + " พัง:\n" + out);
      } finally {
        try { fs.unlinkSync(tmp); } catch {}
      }
    });
  });
}

ok("🔴 ยามนี้จับของพังได้จริง (พิสูจน์ด้วยสคริปต์ที่ตั้งใจเขียนผิด)", () => {
  const tmp = path.join(os.tmpdir(), "wh-syntax-proof.mjs");
  fs.writeFileSync(tmp, 'const a = "ยังไม่ปิด;\n');
  let threw = false;
  try { execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" }); }
  catch { threw = true; }
  finally { try { fs.unlinkSync(tmp); } catch {} }
  assert.ok(threw, "node --check ต้องฟ้องสคริปต์ที่ผิด ไม่งั้นยามนี้เขียวหลอก");
});

/* ════ ⑨ 🛡 ยามไฟล์ SQL ════════════════════════════════════════════
   🪤 เจอจริง 2026-11-12: ไฟล์ออกมาเป็น `do $` แทน `do $$` ⇒ Supabase ฟ้อง
      "syntax error at or near \"$\"" ภูมรันไม่ผ่าน
      ต้นเหตุ = ตอนเขียนไฟล์ผ่าน String.replace() ของ JS ข้อความแทนที่มองว่า $$ = $ ตัวเดียว
      (ตระกูลเดียวกับบทเรียน backslash หลุดตอนเขียนผ่าน shell)
   ⇒ ยามนี้กันไม่ให้ไฟล์ SQL หลุดออกไปแบบนั้นอีก */
section("ไฟล์ SQL");

const SQL_TEXT = fs.readFileSync("warehouse-schema.sql", "utf8");

ok("🔴 ไม่มีบล็อก do ที่เปิดด้วย $ ตัวเดียว (Supabase รันไม่ผ่าน)", () => {
  assert.ok(!/\bdo\s*\$(?!\$)/i.test(SQL_TEXT),
    "เจอ do $ แบบ $ เดียว — ต้องเป็น $$ หรือเลิกใช้บล็อก do ไปเลย");
});

ok("เครื่องหมาย $$ (ถ้ามี) ต้องคู่กัน", () => {
  const n = (SQL_TEXT.match(/\$\$/g) || []).length;
  assert.equal(n % 2, 0, "$$ ไม่คู่กัน = dollar-quote ไม่ปิด");
});

ok("ทุกคำสั่งปิดด้วย ; (ไม่มีคำสั่งค้าง)", () => {
  /* ตัดคอมเมนต์ออกก่อน แล้วดูว่าเนื้อ SQL จบด้วย ; */
  const body = SQL_TEXT.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.ok(body.endsWith(";"), "ไฟล์ต้องจบด้วย ;");
});

ok("รันซ้ำได้ — ทุกคำสั่งที่สร้างของใหม่ต้องมี if not exists / if exists", () => {
  const lines = SQL_TEXT.split("\n").map((l) => l.trim()).filter((l) => !l.startsWith("--"));
  for (const l of lines) {
    if (/^create (table|index)\b/i.test(l))
      assert.ok(/if not exists/i.test(l), "ต้องมี if not exists → " + l.slice(0, 60));
    if (/^alter table .* drop constraint/i.test(l))
      assert.ok(/if exists/i.test(l), "ต้องมี if exists → " + l.slice(0, 60));
  }
});

/* ════ ⑩ 📱 มือถือ — กรอบไม่ทับกัน + นิ้วซูมได้ (ภูม 2026-11-12) ════ */
section("มือถือ");

const D3D = fs.readFileSync("warehouse-3d.html", "utf8");

ok("🔴 ตำแหน่งป๊อปอัพบนมือถือต้องคิดจากของจริง ไม่ใช่เลขตายตัว", () => {
  /* 🪤 เจอจริง: ตั้ง top:118px ตายตัว แล้วการ์ดสรุปตกเป็น 2 บรรทัดบนจอ 375px
     ⇒ ป๊อปอัพทับแถบสรุป + ทับปุ่มมุมมอง อ่านไม่รู้เรื่อง */
  assert.ok(!/#pop\{[^}]*top:\s*\d+px/.test(D3D), "ห้ามตั้ง top ของป๊อปอัพเป็นเลขตายตัว");
  assert.ok(D3D.includes('$("pop").style.bottom = narrow'), "ต้องคำนวณตำแหน่งจาก JS");
  assert.ok(D3D.includes('$("map").getBoundingClientRect().height'), "ต้องวัดความสูงแผนผังจริง");
});

ok("แถบสรุปบนมือถือเป็นบรรทัดเดียว เลื่อนข้างได้ (ไม่ตก 2 บรรทัดจนดันของอื่น)", () => {
  assert.ok(/#summary\{[^}]*flex-wrap:\s*nowrap/.test(D3D), "ต้อง nowrap");
  assert.ok(/#summary\{[^}]*overflow-x:\s*auto/.test(D3D), "ต้องเลื่อนข้างได้");
});

ok("ย่อ/ขยายแผนผังแล้วต้องจัดตำแหน่งใหม่ (ไม่งั้นป๊อปอัพทับแผนผัง)", () => {
  const i = D3D.indexOf('$("mapHead").addEventListener');
  assert.ok(i > 0, "ต้องมีตัวจับการกดหัวแผนผัง");
  assert.ok(D3D.slice(i, i + 420).includes("resize()"), "กดย่อ/ขยายแล้วต้องเรียก resize()");
});

ok("🤏 รองรับ 2 นิ้ว — ซูมเข้าออก + เลื่อน", () => {
  /* canvas ตั้ง touch-action:none ⇒ เบราว์เซอร์ไม่จัดการท่าทางให้ ต้องเขียนเอง
     ภูม: *"ในมือถือ ภูมิเอานิ้วซูมเข้าออกขยายอะไรแบบในคอมไม่ได้เลย"* */
  assert.ok(/touch-action:\s*none/.test(D3D), "canvas ต้องกันเบราว์เซอร์แย่งท่าทาง");
  assert.ok(D3D.includes("const pointers = new Map()"), "ต้องเก็บนิ้วหลายนิ้ว");
  assert.ok(D3D.includes("pointers.size >= 2"), "ต้องมีทางสำหรับ 2 นิ้ว");
  assert.ok(D3D.includes("pinch.dist / now.dist"), "ต้องคิดซูมจากระยะห่างระหว่างนิ้ว");
  assert.ok(D3D.includes("pointercancel"), "ต้องจับตอนนิ้วหลุด ไม่งั้นค้างสถานะ");
});

ok("🔴 ซูมด้วย 2 นิ้วแล้วต้องไม่เผลอเลือกกล่อง", () => {
  assert.ok(D3D.includes("let gestured = false"), "ต้องมีธงบอกว่าเพิ่งใช้ 2 นิ้ว");
  const i = D3D.indexOf('el.addEventListener("click"');
  assert.ok(D3D.slice(i, i + 200).includes("if (gestured) return;"), "ตัวรับคลิกต้องเช็คธงก่อน");
});

ok("จับ pointer ไม่ได้ ต้องไม่ทำให้ท่าทางพังทั้งหมด", () => {
  assert.ok(/try \{ el\.setPointerCapture/.test(D3D), "setPointerCapture ต้องอยู่ใน try");
});

/* ════ ⑪ 🖨 ป้าย QR + 📷 กล้องมือถือ (ภูม 2026-11-12 รอบ 2) ═══════════
   *"บาโค้ดที่พิมพ์มันเล็กไป ช่วยขยายให้มันใหญ่ขึ้นอีกนิด"*
   *"เพิ่ม QR โค้ดมาด้วย … ให้เพิ่มยิงรับเข้าแบบกล้องมือถือมาด้วย"* */
section("ป้าย QR + กล้องมือถือ");

const LBL = fs.readFileSync("warehouse-labels.html", "utf8");
const SCAN = fs.readFileSync("warehouse-scan.html", "utf8");

ok("ป้ายมีทั้งบาร์โค้ดและ QR เก็บรหัสเดียวกัน", () => {
  assert.ok(LBL.includes("window.JsBarcode"), "ต้องมีตัววาดบาร์โค้ด");
  assert.ok(LBL.includes("window.qrcode(0,"), "ต้องมีตัววาด QR");
  assert.ok(LBL.includes("q.addData(l.code)"), "QR ต้องเก็บรหัสช่องตัวเดียวกับบาร์โค้ด");
});

ok("🔒 QR บนกระดาษต้องไม่มีลิงก์/กุญแจ — ป้ายหลุดไปต้องเปิดระบบไม่ได้", () => {
  /* ป้ายเป็นกระดาษติดชั้นวาง ใครถ่ายรูปไปก็ได้ ⇒ ห้ามฝังที่อยู่เว็บหรือ key ลงไป */
  const i = LBL.indexOf("q.addData(");
  const arg = LBL.slice(i, i + 60);
  assert.ok(!/http|key=|token/i.test(arg), "QR ต้องเก็บแค่รหัสช่อง → " + arg.slice(0, 40));
});

ok("🔴 บาร์โค้ด + QR ต้องมีขอบเงียบ ไม่งั้นอ่านไม่ติด", () => {
  /* 🪤 ของเดิมตั้ง margin: 0 ทั้งคู่ — บนจอดูดี แต่บนกระดาษไม่มีที่ว่างให้ตัวอ่านจับขอบ */
  assert.ok(/marginLeft:\s*20/.test(LBL), "บาร์โค้ดต้องมีขอบเงียบซ้าย 10 แท่ง (20px ที่ width 2)");
  assert.ok(/marginRight:\s*20/.test(LBL), "บาร์โค้ดต้องมีขอบเงียบขวา");
  assert.ok(/cellSize:\s*2,\s*margin:\s*8/.test(LBL), "QR ต้องมีขอบเงียบ 4 ช่อง (margin 8 ที่ cellSize 2)");
});

ok("ขนาดป้ายคิดเป็นมิลลิเมตรจริง — ที่เห็นบนจอ = ที่ได้บนกระดาษ", () => {
  assert.ok(/const PAGE_W = 194/.test(LBL) && /const PAGE_H = 281/.test(LBL),
    "ต้องยึดพื้นที่พิมพ์ A4 ขอบ 8 มม.");
  assert.ok(/#sheet\{width:194mm/.test(LBL), "กรอบพรีวิวต้องกว้างเท่ากระดาษจริง");
  assert.ok(/height:var\(--lh\)/.test(LBL), "ป้ายต้องสูงคงที่ ไม่งั้นนับแผ่นไม่ได้");
});

ok("ค่าตั้งต้นคือขนาดใหญ่ 2 ป้าย/แถว (ภูมบอกของเดิมเล็กไป)", () => {
  const i = LBL.indexOf('<select id="size">');
  const block = LBL.slice(i, i + 260);
  const first = /<option value="(\d)"/.exec(block);
  assert.equal(first && first[1], "2", "ตัวเลือกแรก (= ค่าตั้งต้น) ต้องเป็น 2 ป้าย/แถว");
});

ok("🔴 เตือนเมื่อแท่งบาร์โค้ดเล็กกว่าที่เครื่องยิงอ่านได้", () => {
  /* วัดจริงแล้ว: 4 ป้าย/แถว ได้ 0.18 มม. → ตัวอ่านอ่านไม่ออกจริง ⇒ ต้องมีคำเตือน */
  assert.ok(/mm < 0\.19/.test(LBL), "ต้องมีเส้นแบ่ง 0.19 มม.");
  assert.ok(LBL.includes("เล็กเกินสำหรับเครื่องยิงบาร์โค้ด"), "ต้องบอกเป็นภาษาคน");
});

ok("📷 กล้องอ่านได้ทั้ง QR (ป้ายเรา) และบาร์โค้ด 1 มิติ (กล่องลูกค้า)", () => {
  assert.ok(SCAN.includes("html5-qrcode"), "ต้องมีตัวอ่านกล้อง");
  for (const f of ["QR_CODE", "CODE_128", "CODE_39"])
    assert.ok(SCAN.includes("F." + f), "ต้องเปิดรูปแบบ " + f);
});

ok("🔴 กรอบสแกนต้องใหญ่เกือบเต็มเฟรม", () => {
  /* 🪤 เจอจริงตอนลองกับกล้องจำลอง: กรอบสูง 46% ของจอ ⇒ QR ที่ถือใกล้ล้นกรอบ
     แล้วอ่านไม่ออกเลยสักที โดยไม่ฟ้องอะไรเลย (เงียบสนิท หาสาเหตุยากมาก) */
  const m = /qrbox: \(w, h\) => \(\{[\s\S]{0,220}?\}\)/.exec(SCAN);
  assert.ok(m, "ต้องกำหนดกรอบสแกน");
  const nums = (m[0].match(/0\.\d+/g) || []).map(Number);
  assert.ok(nums.length >= 2, "ต้องคิดกรอบจากขนาดจอ");
  assert.ok(Math.min(...nums) >= 0.75, "กรอบต้องไม่เล็กกว่า 75% ของจอ → " + nums.join(" · "));
});

ok("🔴 กล่องใบเดิมค้างในกรอบ ต้องไม่บันทึกซ้ำ", () => {
  /* 🪤 ลองจริง: กล้องอ่านซ้ำ ~10 ครั้ง/วินาที ⇒ ของใบเดียวถูกบันทึก 3 ครั้งใน 7 วินาที */
  assert.ok(SCAN.includes("const doneThisRound = new Set()"), "ต้องจำว่ารอบนี้ยิงอะไรไปแล้ว");
  assert.ok(SCAN.includes("doneThisRound.has(doneKey(code))"), "ต้องเช็คก่อนยิงซ้ำ");
  assert.ok(/doneKey = \(code\) => code \+ "@" \+/.test(SCAN), "ต้องแยกตามช่องด้วย — ย้ายช่องแล้วยิงใหม่ได้");
});

ok("🔴 ผลการยิงต้องไม่ถูกข้อความสั้นทับ ตราบใดที่ยังเป็นใบเดิม", () => {
  /* ผลที่สำคัญที่สุด (ห้ามหยิบ / ที่อยู่จัดส่ง) ต้องค้างให้คนอ่านจบ
     ไม่ใช่โดน \"ยิงไปแล้ว\" ทับใน 2–3 วินาทีเพราะกล่องยังอยู่ในกรอบ */
  assert.ok(SCAN.includes("if (shownCode === code) return;"), "ใบเดิมที่โชว์อยู่แล้ว = ไม่แตะการ์ด");
});

ok("📱 กล้องเปิดอยู่ ต้องไม่ดึงโฟกัสจนคีย์บอร์ดเด้งทับ", () => {
  const i = SCAN.indexOf("function focusScan(");
  assert.ok(SCAN.slice(i, i + 150).includes("if (camOn) return;"), "focusScan ต้องเช็คว่ากล้องเปิดอยู่");
  assert.ok(SCAN.includes("FINE_POINTER"), "จอสัมผัสต้องไม่โฟกัสเอง");
});

ok("ปิดกล้อง/ออกจากหน้า ต้องหยุดกล้อง (ไม่ค้างกินแบต)", () => {
  assert.ok(/reader\.stop\(\)/.test(SCAN), "ต้องมีการหยุดกล้อง");
  assert.ok(SCAN.includes('addEventListener("pagehide"'), "ออกจากหน้าก็ต้องหยุด");
});

ok("กล้อง + เครื่องยิง เดินผ่านตัวบันทึกตัวเดียวกัน (ไม่มีเส้นทางเงินซ้อน)", () => {
  assert.ok(/const out = await submit\(code\)/.test(SCAN), "ทางกล้องต้องเรียก submit() ตัวเดียวกัน");
  const n = (SCAN.match(/warehouse\/api\/scan/g) || []).length;
  assert.equal(n, 1, "ต้องมีจุดยิงไปที่ server จุดเดียว เจอ " + n);
});

ok("บอกเหตุเป็นภาษาคนเมื่อเปิดกล้องไม่ได้", () => {
  assert.ok(SCAN.includes("window.isSecureContext"), "ต้องเช็ค https ก่อน");
  for (const n of ["NotAllowedError", "NotFoundError", "NotReadableError"])
    assert.ok(SCAN.includes(n), "ต้องแปลเหตุ " + n);
});

/* ════ ⑫ 🔢 รหัส ชั้น-ล็อก + ทิศทางหน้าโกดัง (ภูม 2026-11-12 รอบ 3) ═══ */
section("รหัสชั้น-ล็อก + ทิศทาง");

ok("🔴 รหัสเรียง ชั้นก่อน แล้วค่อยล็อก", () => {
  /* ภูม: *"รหัสให้ขึ้นเป็น ชั้นก่อนแล้วค่อยต่อด้วยล็อก"* */
  assert.equal(L.locationCode("A", 5, 1), "A0105", "ล็อก 5 ชั้น 1 → A0105");
  assert.equal(L.locationCode("B", 10, 4), "B0410", "ล็อก 10 ชั้น 4 → B0410");
  const p = L.parseLocation("B0410");
  assert.equal(p.level, 4); assert.equal(p.bay, 10);
});

ok("🔴 แปลงรหัสรุ่นก่อนได้ (ของที่คีย์ไว้แล้วต้องไม่หาย)", () => {
  assert.equal(L.convertOldCode("A0501-R"), "A0105-R", "เดิม ล็อก5 ชั้น1");
  assert.equal(L.convertOldCode("A1004"), "A0410", "เดิม ล็อก10 ชั้น4");
  assert.equal(L.convertOldCode("A0107"), null, "เดิมแถว A ไม่มีชั้น 7");
  assert.equal(L.convertOldCode("ไม่ใช่รหัส"), null);
});

ok("ทุกช่องในผังยังครบ 208 และรหัสไม่ซ้ำกัน", () => {
  const b = L.buildLayout();
  assert.equal(b.slots.length, 208);
  assert.equal(new Set(b.slots.map((s) => s.slot)).size, 208, "รหัสซ้ำ = ของทับกัน");
  for (const s of b.slots) assert.ok(L.parseSlot(s.slot), "แกะรหัสไม่ออก: " + s.slot);
});

ok("🔴 หน้า 3D ต้องไม่คิดพิกัด Z เอง — ต้องอ่านจากผัง", () => {
  /* 🪤 เดิมหน้า 3D คิด z ของเสา/คาน/ป้ายเอง ⇒ พอสลับทิศ กล่องย้ายแต่โครงเหล็กไม่ย้าย */
  const D3 = fs.readFileSync("warehouse-3d.html", "utf8");
  assert.ok(D3.includes("row.zStart"), "เสา/คานต้องอ่าน zStart จากผัง");
  assert.ok(D3.includes("row.bayCenterZ"), "ป้ายเลขล็อกต้องอ่าน bayCenterZ จากผัง");
  assert.ok(!/const z = bay \* \(C\.w \+ ST\.post\)/.test(D3), "ห้ามคิด z ของเสาเอง");
});

ok("🔴 หน้าคีย์ตำแหน่งต้องไม่ประกอบรหัสเอง", () => {
  const A = fs.readFileSync("warehouse-assign.html", "utf8");
  assert.ok(!/sel\.zone \+ pad2\(/.test(A), "ห้ามต่อรหัสเอง — ต้องหาจาก LAYOUT.slots");
  assert.ok(A.includes("x.row === sel.zone && x.bay === sel.bay"), "ต้องหาช่องจากผัง");
});

ok("ผังบอกทิศทางหน้าโกดังมาด้วย (หน้าอื่นจะได้ไม่เดา)", () => {
  const b = L.buildLayout();
  assert.equal(b.door.bayOneAtFarZ, false);
  assert.equal(b.door.rowAatFarX, false);
  for (const r of b.rows) {
    assert.equal(r.bayCenterZ.length, r.bays, "ต้องมีตำแหน่งป้ายครบทุกล็อก");
    assert.ok(r.labelZ < r.zStart, "ป้ายตัวอักษรแถวต้องอยู่นอกชั้นวาง ฝั่งประตู");
  }
});

ok("🔴 ของที่คีย์ไว้ด้วยรหัสรูปเก่า ต้องไม่หายจากจอ", () => {
  /* 🪤 ไม่แปลงให้ = แถวเก่ากลายเป็น orphan แล้วหายเงียบๆ ทั้งที่ของยังอยู่บนชั้นจริง */
  const v = W.mergeView([PL("TOLD", "A0501-R")], [job({ tracking: "TOLD" })]);
  const s = v.layout.slots.find((x) => x.slot === "A0105-R");
  assert.equal(s.items.length, 1, "ต้องไปโผล่ที่ช่องเดียวกันในรูปใหม่");
  assert.equal((v.orphans || []).length, 0, "ต้องไม่กลายเป็นของกำพร้า");
});

ok("🔴 ป้าย/หน้าจอ ต้องเรียงคำ ชั้นก่อนล็อก ให้ตรงกับรหัส", () => {
  /* อ่านรหัสได้ลำดับหนึ่ง อ่านคำได้อีกลำดับ = คนเดินหาของผิดช่อง */
  const lb = L.slotLabel("B0410-R");
  assert.ok(/ชั้น 4 ล็อก 10/.test(lb), "ชื่อช่องต้องเรียงชั้นก่อน → " + lb);
  const LBL = fs.readFileSync("warehouse-labels.html", "utf8");
  assert.ok(!/" · ล็อก " \+ s\.bay/.test(LBL), "หน้าป้ายห้ามเรียงคำเอง");
  assert.ok(LBL.includes("String(s.label"), "หน้าป้ายต้องใช้ชื่อที่ผังส่งมา");
});

ok("🔴 กล้องตั้งต้นต้องยืนที่ประตู ไม่ใช่หลังโกดัง", () => {
  /* 🪤 บทเรียน 12/11 (เสียเวลาไป 2 รอบ): จอ 3D ตั้งกล้องไว้หลังโกดัง
     ⇒ เปิดมาเห็นล็อก 10 อยู่ใกล้ตัว เลยสรุปว่า "ผังกลับด้าน" แล้วไปพลิกผังทั้งชุด
     ของจริงผังถูกอยู่แล้ว ที่ผิดคือมุมกล้อง
     ⇒ ยามนี้ผูก 2 อย่างเข้าด้วยกัน: ผังบอกว่าประตูอยู่ต้นแกน Z กล้องก็ต้องหันมาจากฝั่งนั้น
        ใครขยับผัง จะถูกบังคับให้มาคิดเรื่องกล้องด้วย */
  const D3 = fs.readFileSync("warehouse-3d.html", "utf8");
  const m = /\{ k: "3D",[^}]*th: ([^,]+),/.exec(D3);
  assert.ok(m, "ต้องมีมุมตั้งต้นของจอ 3D");
  const th = m[1].trim();
  if (L.DOOR.bayOneAtFarZ === false)
    assert.ok(/\+ Math\.PI/.test(th), "ประตูอยู่ต้นแกน Z ⇒ กล้องต้องหมุนมาอีกฝั่ง → " + th);
  else
    assert.ok(!/\+ Math\.PI/.test(th), "ประตูอยู่ปลายแกน Z ⇒ กล้องห้ามหมุน → " + th);
});

/* เทส "ป้ายหน้าโกดัง" ถอดออกแล้ว — ภูม 2026-11-13 สั่งลบป้ายนั้นออกจากฉาก (ดูไม่สวย)
   ทิศทางยังถูกจากผัง (DOOR) + ป้ายเลขแถว/ล็อก · มุมกล้องตั้งต้นยังมีเทสคุมด้านบน */

ok("🔴 รหัสช่องที่ฝังไว้ในโค้ด ต้องมีอยู่จริงในผังทุกตัว", () => {
  /* 🪤 ตอนย้ายว่าแถวไหนมี 6 ล็อก ข้อมูลตัวอย่างชี้ไป C ล็อก 8/10 ที่ไม่มีแล้ว
     ⇒ ของหายจากจอเงียบๆ (กลายเป็น orphan) โดยไม่มีอะไรฟ้อง */
  for (const file of ["warehouse-demo.js", "warehouse-3d.html", "warehouse-assign.html", "warehouse-scan.html", "SETUP-WAREHOUSE.md"]) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.match(/\b[A-C]\d{4}(-[LR])?\b/g) || []) {
      const okCode = m.includes("-") ? L.parseSlot(m) : L.parseLocation(m);
      assert.ok(okCode, "รหัสผีใน " + file + " → " + m);
    }
  }
});

ok("🔴 ของที่คีย์ไว้ช่องที่ไม่มีในผังแล้ว ต้องค้างในรายการเตือน ไม่ใช่หายเงียบ", () => {
  /* 🪤 ตอนแถว C หดจาก 10 เหลือ 6 ล็อก ของที่เคยคีย์ไว้ C ล็อก 7-10 วาดบนจอไม่ได้อีก
     ⇒ ถ้าบอกแค่ toast 6 วินาที เท่ากับของหายเงียบๆ ทั้งที่ยังอยู่ในฐาน */
  const v = W.mergeView([PL("TGHOST", "C0110-L")], [job({ tracking: "TGHOST" })]);
  assert.equal(v.orphans.length, 1, "ต้องถูกจับเป็นของกำพร้า");
  assert.equal(v.orphans[0].tracking, "TGHOST");
  const D3 = fs.readFileSync("warehouse-3d.html", "utf8");
  assert.ok(/(v.orphans || []).map/.test(D3), "จอต้องเอาของกำพร้าเข้ารายการเตือน");
  assert.ok(D3.includes("ไม่มีในผังโกดังแล้ว"), "ต้องบอกเป็นภาษาคนว่าต้องทำอะไรต่อ");
});

/* ════ สรุป ═══════════════════════════════════════════════════════════ */
console.log("\n" + (fail ? "❌" : "✅") + " warehouse: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
