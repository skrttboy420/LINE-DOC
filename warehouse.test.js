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

ok("รวม 26 ล็อก · 104 ช่องชั้น · 104 ช่องวาง (1 ล็อก 1 ชั้น = 1 ช่อง)", () => {
  /* 🔴 ภูม 14/11: *"ไม่ใช้ L กับ R ไม่ต้องแยกซ้ายขวาอะ รวมเป็นล็อกนึงไปเลย"*
     ⇒ ช่องวาง = ช่องชั้น เท่ากันเป๊ะ (เดิม 208 = ผ่าครึ่งซ้าย/ขวา) */
  const t = L.buildLayout().totals;
  assert.deepEqual(t, { bays: 26, cells: 104, slots: 104 });
});

ok("🔴 ไม่มีช่องไหนในผังมีหาง -L/-R แล้ว", () => {
  const b = L.buildLayout();
  const bad = b.slots.filter((s) => /-/.test(s.slot) || "side" in s);
  assert.equal(bad.length, 0, "ยังเหลือช่องที่แยกฝั่ง: " + bad.slice(0, 3).map((s) => s.slot).join(" · "));
  assert.ok(!("sides" in b), "ผังไม่ต้องส่งทะเบียนฝั่งไปให้หน้าจออีก");
  assert.equal(b.slots[0].slot, b.slots[0].location, "รหัสช่อง = รหัสโลเคชั่นตัวเดียวกัน");
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
  assert.equal(L.parseSlot("a0101").slot, "A0101");
});

ok("🔴 ป้ายเก่าที่ยังแปะอยู่บนชั้น (A0101-L) ต้องยิงแล้วเข้าช่อง A0101", () => {
  /* 🪤 ถ้าตัวแกะรหัสปฏิเสธป้ายเก่า: พนักงานยิงป้ายที่ติดอยู่จริง ระบบตอบ "ไม่มีช่องนี้"
        ⇒ งานหยุดกลางโกดัง ทั้งที่ช่องนั้นมีอยู่ (ป้ายใหม่ยังไม่ได้พิมพ์/ยังไม่ได้ไปติด) */
  for (const old of ["A0101-L", "A0101-R", "a0101l", " A0101 - R ", "C0106-L"]) {
    const hit = L.parseSlot(old);
    assert.ok(hit, "อ่านป้ายเก่าไม่ออก: " + old);
    assert.ok(!/-/.test(hit.slot), "ต้องคืนรหัสที่ไม่มีหาง: " + old + " → " + hit.slot);
  }
  assert.equal(L.parseSlot("A0101-L").slot, "A0101");
  assert.equal(L.parseLocation("A0101-R").code, "A0101");
  assert.equal(L.slotLabel("A0105-L"), L.slotLabel("A0105"), "ป้ายเก่า/ใหม่ต้องอ่านเป็นช่องเดียวกัน");
  assert.equal(L.parseSlot("A0101-X"), null, "หางที่ไม่ใช่ L/R ยังต้องไม่ผ่าน");
  assert.equal(L.parseSlot("A0111-L"), null, "ป้ายเก่าที่ชี้ช่องไม่มีจริง ก็ยังต้องไม่ผ่าน");
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

ok("🔴 รหัสช่อง = รหัสโลเคชั่น · ใครยังส่งฝั่งมาต้องฟ้องดังๆ", () => {
  assert.equal(L.slotCode("a0101"), "A0101");
  assert.equal(L.slotCode("A0101-L"), "A0101", "ป้ายเก่าก็ยังรับ");
  /* 🪤 ถ้ากลืนอาร์กิวเมนต์ที่ 2 เงียบๆ โค้ดเก่าที่ลืมแก้จะทำงานต่อได้แบบ "ดูเหมือนถูก"
        แล้ววันหนึ่งค่อยมารู้ว่าฝั่งที่ส่งไปไม่เคยมีผลกับอะไรเลย */
  assert.throws(() => L.slotCode("A0101", "L"), /เลิกใช้ซ้าย\/ขวา/);
  assert.throws(() => L.slotCode("A0101", "R"), /เลิกใช้ซ้าย\/ขวา/);
  assert.equal(L.SIDES, undefined, "ทะเบียนฝั่งต้องไม่มีให้ใครเรียกอีก");
  assert.equal(L.SIDE_TH, undefined);
});

ok("ชื่อที่คนอ่านรู้เรื่อง — ไม่มีวงเล็บฝั่งแล้ว", () => {
  assert.equal(L.slotLabel("A0101"), "โซนขวา ชั้น 1 ล็อก 1");
  assert.equal(L.slotLabel("B0410"), "โซนกลาง ชั้น 4 ล็อก 10");
  assert.ok(!/ฝั่ง/.test(L.slotLabel("A0101-L")), "ป้ายเก่าก็ต้องไม่ขึ้นคำว่าฝั่ง");
});

/* ════ ③ พิกัด XYZ ════════════════════════════════════════════════════ */
section("พิกัด XYZ (หน่วยเซนติเมตรของจริง)");

ok("แถวห่างกัน = ลึกชั้นวาง + ทางเดิน 300 (B เป็นชั้นคู่ = ลึก 2 เท่า)", () => {
  /* 🔴 ภูม 13/11: แถว B เป็นชั้นวางคู่หันหลังชนกัน ⇒ ลึก 240 ไม่ใช่ 120
     ⇒ แถว C ขยับออกไปอีก 120 (ไม่งั้นทางเดินฝั่ง C โดนชั้นที่ 2 ของ B กินไป) */
  assert.equal(L.rowOriginX("A"), 0);
  assert.equal(L.rowOriginX("B"), 420);      // 120 (A) + 300 (ทางเดิน)
  assert.equal(L.rowOriginX("C"), 960);      // 420 + 240 (B ชั้นคู่) + 300 (ทางเดิน)
  assert.equal(L.faceOriginX("B", "B1"), 420, "หน้าซ้ายของ B = ตัวแรก");
  assert.equal(L.faceOriginX("B", "B2"), 540, "หน้าขวาชนหลังพอดี ไม่มีช่องว่าง");
});

ok("🔴 ทิศของผัง — ยืนยันกับภูมแล้ว 12/11 (ชี้จากผังมองจากบน)", () => {
  /* ภูม: ประตูหน้าโกดัง = ขอบซ้ายของผัง (ฝั่งล็อก 1) · แถว A = แถวล่างของผัง
     🪤 รอบแรกผมพลิกทั้งผังเพราะอ่านจอผิด (จอ 3D ตั้งกล้องไว้หลังโกดัง)
        ⇒ ยามนี้ล็อกทิศที่ภูมยืนยันไว้ ใครจะพลิกต้องมาแก้ตรงนี้ด้วย */
  assert.equal(L.DOOR.bayOneAtFarZ, false, "ล็อก 1 อยู่ต้นแกน Z (ฝั่งประตู)");
  assert.equal(L.DOOR.rowAatFarX, false, "แถว A อยู่ต้นแกน X");
  assert.equal(L.bayZ0("A", 1), 0, "ล็อก 1 ของแถวที่ยาวเต็มพื้นที่ ชิดขอบฝั่งประตู");
  assert.ok(L.bayZ0("A", 10) > L.bayZ0("A", 1), "ล็อกเลขมากกว่า = ลึกเข้าไปจากประตู");
  /* 🔴 ภูม 13/11: *"ถอยแถว B ไปชิดหลังโกดังเหมือนแถว C"* ⇒ ปลายทั้ง 3 แถวเสมอกัน */
  for (const k of ["A", "B", "C"])
    assert.equal(L.rowZSpan(k).end, L.fullZ(), "แถว " + k + " ต้องชิดผนังด้านหลัง");
  assert.ok(L.bayZ0("B", 1) > 0, "แถว B ตั้งชิดหลัง ⇒ ล็อก 1 ไม่ได้อยู่ติดประตูแล้ว");

  /* 🔴 แถว C สั้นกว่าเพื่อน (ภูม: *"ล็อก A ที่ 6 ล็อกต้องเป็น C"*)
     ส่วนที่หายอยู่ "ด้านใน" (ฝั่งออฟฟิศ) ไม่ใช่ด้านประตู */
  assert.equal(L.baysOf("C"), 6, "แถวสั้นคือ C");
  assert.equal(L.baysOf("A"), 10, "แถว A ยาวเต็มพื้นที่");
  const c = L.rowZSpan("C"), a = L.rowZSpan("A");
  assert.equal(c.end, a.end, "แถว C ต้องชิดผนังด้านหลังสุดเท่าความยาวโกดัง");
  assert.ok(c.start > a.start, "ช่วงที่ว่างของแถว C ต้องอยู่ทางฝั่งประตู ไม่ใช่ด้านหลัง");
  assert.ok(L.bayZ0("C", 1) > L.bayZ0("A", 1), "ล็อก 1 ของ C เริ่มลึกเข้าไปจากประตู");
  assert.equal(L.bayZ0("C", 6), L.bayZ0("A", 10), "ล็อกลึกสุดของ C ต้องเสมอกับล็อกลึกสุดของแถวยาว");
  /* 🔴 แถว B ชั้นคู่ — ล็อก 1 กับ 6 ต้องอยู่ตรงกันพอดี (คนละด้านของชั้นที่ชนหลังกัน) */
  assert.equal(L.bayZ0("B", 6), L.bayZ0("B", 1), "ล็อก 6 ต้องอยู่หลังล็อก 1 พอดี");
  assert.equal(L.bayZ0("B", 10), L.bayZ0("B", 5), "ล็อก 10 ต้องอยู่หลังล็อก 5 พอดี");
});

ok("ล็อกถัดไปห่าง 257 (กว้าง 250 + เสา 7) · ชั้นถัดไปสูงขึ้น 175 (165 + คาน 10)", () => {
  assert.equal(L.BAY_PITCH, 257);
  assert.equal(L.LEVEL_PITCH, 175);
  const b1 = L.slotBox("B0101", "L"), b2 = L.slotBox("B0102", "L");
  assert.equal(b2.z - b1.z, 257, "ล็อกถัดไป = ลึกเข้าไปจากประตู 257");
  const l1 = L.slotBox("B0101", "L"), l2 = L.slotBox("B0201", "L");
  assert.equal(l2.y - l1.y, 175);
});

ok("1 ช่อง = เต็มล็อก กว้าง 250 (ภูม 14/11: เลิกผ่าครึ่งซ้าย/ขวา)", () => {
  const b = L.slotBox("A0101");
  assert.equal(b.w, L.CELL.w, "กว้างเต็มล็อก ไม่ใช่ครึ่ง");
  assert.equal(b.d, L.CELL.d);
  assert.equal(b.h, L.CELL.h);
  /* ช่องชั้นเดียวกันของล็อกเดียวกัน = ช่องเดียว ⇒ ไม่มี "คู่" ให้เทียบอีก */
  assert.equal(L.buildLayout().slots.filter((s) => s.location === "A0101").length, 1);
});

ok("ของวางอยู่บนคาน ไม่จมพื้น", () => {
  const b = L.slotBox("A0101");
  assert.equal(b.y - b.h / 2, L.STRUCT.beam, "ท้องของต้องอยู่สูงเท่าคาน");
});

ok("ขนาดโกดังรวม = 1080 × 700 × 2570 ซม. (B ชั้นคู่กินกว้างเพิ่ม 120)", () => {
  assert.deepEqual(L.layoutExtent(), { x: 1080, y: 700, z: 2570 });
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
  const it = v.layout.slots.find((s) => s.slot === "A0101").items[0];
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
  /* 🏷 ป้อนรหัสรูปเก่าเข้าไป (ของในฐานตอนนี้ยังเป็นรูปนั้น) แล้วต้องไปโผล่ที่ช่องรูปใหม่ */
  const a = v.layout.slots.find((s) => s.slot === "A0101");
  const b = v.layout.slots.find((s) => s.slot === "B0305");
  assert.equal(a.status, "ready");
  assert.equal(b.status, "wait");
  assert.equal(v.counts.ready, 1);
  assert.equal(v.counts.wait, 1);
  assert.equal(v.counts.empty, 102, "ที่เหลือจาก 104 ต้องว่าง");
});

ok("ช่องเดียววางได้หลายแทรค · นับกล่องรวม", () => {
  const v = W.mergeView(
    [PL("T1", "A0101-L", { boxes: 3 }), PL("T2", "A0101-L", { boxes: 2 })],
    [job({ tracking: "T1" }), job({ tracking: "T2" })],
  );
  const s = v.layout.slots.find((x) => x.slot === "A0101");
  assert.equal(s.items.length, 2);
  assert.equal(s.boxes, 5);
});

ok("🔴 รายการเตือน — ช่องที่ขัดกับระบบต้องโผล่ในลิสต์ให้กดดูได้", () => {
  const v = W.mergeView([PL("TX", "A0410-R")], [job({ tracking: "TX", status: 7 })]);
  assert.equal(v.alerts.length, 1);
  assert.equal(v.alerts[0].slot, "A0410");
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
  assert.equal(v.layout.slots.find((s) => s.slot === "A0101").status, "ready");
});

ok("อ่านงานจากเว็บไม่ได้ = ช่องที่มีของขึ้น \"หาในระบบไม่เจอ\" ไม่ใช่เขียวหลอก", () => {
  const v = W.mergeView([PL("T1", "A0101-L")], []);
  assert.equal(v.layout.slots.find((s) => s.slot === "A0101").status, "unknown");
});

/* ════ ⑥ 🔒 ขอบเขต — ห้ามแตะระบบ Pacred ═════════════════════════════ */
section("ขอบเขต (ภูม: อย่าไปยุ่งกับระบบ pacred)");

ok("🔒 โค้ดโกดังเขียนได้แค่ตารางของบอท (wh_*) ห้ามแตะตารางของ Pacred", () => {
  const src = fs.readFileSync("warehouse.js", "utf8");
  for (const t of ["tb_forwarder", "tb_users", "momo_import_tracks", "tb_address", "tb_order"])
    assert.ok(!src.includes(t), "ห้ามอ้างตารางของ Pacred: " + t);
  const writes = src.match(/\.from\("([^"]+)"\)/g) || [];
  for (const w of writes)
    assert.ok(/wh_(placement|move_log|cage)/.test(w), "ตารางที่แตะต้องเป็น wh_* เท่านั้น — เจอ " + w);
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
  assert.ok(/if \(!slotNow\(\)\)/.test(src), "ต้องมีด่านเช็คว่ามีช่องแล้วหรือยัง");
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

ok("🔴 ป้ายต้องเก็บรหัสที่ \"ยิงแล้วเข้าช่องนั้นจริง\" — ทั้งป้ายใหม่และป้ายเก่า", () => {
  /* ป้ายใหม่พิมพ์ A0101 · ป้ายเก่าที่ยังติดอยู่บนชั้นเป็น A0101-L ⇒ หน้ายิงต้องอ่านออกทั้งคู่ */
  const scan = readFile("warehouse-scan.html");
  assert.ok(scan.includes('.replace(/^([A-Z]\\d{4})[LR]$/, "$1")'),
    "หน้ายิงต้องตัดหางของป้ายเก่าก่อนเทียบผัง");
  assert.ok(/\^\(\[A-Z\]\)\(\\d\{2\}\)\(\\d\{2\}\)\$/.test(scan), "ต้องอ่าน A0101 ได้");
  const lbl = readFile("warehouse-labels.html");
  assert.ok(lbl.includes("s.slot"), "ป้ายต้องพิมพ์รหัสช่องจากผัง");
  assert.ok(!/s\.side/.test(lbl), "หน้าป้ายต้องไม่อ้างฝั่งอีก");
  assert.ok(!lbl.includes('id="mode"'), "ไม่มีโหมดต่อช่องวาง/ต่อช่องชั้นแล้ว (1 ล็อก 1 ชั้น = 1 ป้าย)");
});

ok("🔴 ป้ายโลเคชั่น A4 แผ่นละ 8 ป้าย (ภูม 14/11) · ไม่ล้นกระดาษ · บาร์โค้ดยังอ่านได้", () => {
  /* ภูม: *"ตอนนี้ A4 แผ่นนึงมันได้ 12 ป้าย ให้ปรับให้เป็น A4 ใบละ 8 โลเคชั่นก็พอนะ"*
     🪤 ของเดิมตั้งความสูงป้ายแล้วปัดเศษว่าได้กี่ป้าย ⇒ เลขที่บอกกับที่ออกจากเครื่องพิมพ์คลาดกันได้
        ⇒ ตอนนี้ตั้ง "กี่คอลัมน์ × กี่แถว" เป็นตัวตั้ง แล้วหารขนาดลงมา */
  const lbl = readFile("warehouse-labels.html");
  assert.ok(lbl.includes('const DEFAULT_SIZE = "8";'), "ตั้งต้นต้องเป็น 8 ป้าย/แผ่น");
  assert.ok(lbl.includes('<option value="8">'), "ตัวเลือกแรกต้องเป็น 8 ป้าย/แผ่น");
  assert.ok(/const SIZES = \{ 8: \{ cols: 2, rows: 4,/.test(lbl), "8 ป้าย = 2 คอลัมน์ × 4 แถว");
  assert.ok(lbl.includes("const perSheet = (s) => s.cols * s.rows;"),
    "จำนวนป้าย/แผ่นต้องเป็นเลขเป๊ะ ไม่ใช่ผลของการปัดเศษ");
  assert.ok(lbl.includes("const SAFE_H = PAGE_H - 2;"),
    "ต้องเผื่อความสูงไว้ ไม่งั้นเศษปัดของเครื่องพิมพ์ดันแถวสุดท้ายตกหน้า (ได้ 6 แทน 8)");

  /* คิดเลขตามสูตรในหน้าเดียวกัน — ต้องพอดี A4 (194 × 281 มม.) ทุกขนาด */
  const GAP = 4, PAGE_W = 194, PAGE_H = 281, SAFE_H = PAGE_H - 2;   // เผื่อ 2 มม. กันแถวสุดท้ายตกหน้า
  const PAD = { pad: 2.5, zone: 3.2, codeGap: 1.6, foot: 3.7 };
  const SIZES = { 8: { cols: 2, rows: 4, code: 13 }, 12: { cols: 2, rows: 6, code: 9 }, 24: { cols: 3, rows: 8, code: 6 } };
  for (const k of Object.keys(SIZES)) {
    const s = SIZES[k];
    assert.equal(s.cols * s.rows, Number(k), "ชื่อตัวเลือกต้องตรงกับจำนวนจริง: " + k);
    const w = (PAGE_W - GAP * (s.cols - 1)) / s.cols;
    const h = (SAFE_H - GAP * (s.rows - 1)) / s.rows;
    assert.ok(w * s.cols + GAP * (s.cols - 1) <= PAGE_W + 0.01, "ป้ายล้นความกว้าง A4 ที่ขนาด " + k);
    assert.ok(h * s.rows + GAP * (s.rows - 1) <= PAGE_H - 1.99, "ป้ายล้นความสูง A4 ที่ขนาด " + k);
    /* ที่ว่างที่เหลือให้ QR ต้องยังเป็นบวก ไม่งั้น QR ล้นออกนอกป้าย */
    const marks = h - PAD.pad * 2 - PAD.zone - (s.code * 1.1 + PAD.codeGap) - PAD.foot;
    assert.ok(marks >= 8, "ที่ว่างให้ QR/บาร์โค้ดเหลือ " + marks.toFixed(1) + " มม. ที่ขนาด " + k);
    /* แท่งบาร์โค้ดบางสุดต้องไม่ต่ำกว่า 0.19 มม. (ต่ำกว่านี้เครื่องยิงอ่านไม่ออกจริง) */
    const qr = Math.max(8, Math.min(marks, w * 0.45));
    const mm = (w - 5 - qr - 2) / (11 + 5 * 11 + 11 + 13 + 20);
    assert.ok(mm >= 0.19, "แท่งบาร์โค้ด " + mm.toFixed(3) + " มม. เล็กเกินที่ขนาด " + k);
  }
  /* 104 ช่อง ÷ 8 = 13 แผ่น (เดิม 208 ช่อง ÷ 12 = 18 แผ่น) */
  assert.equal(Math.ceil(L.buildLayout().slots.length / 8), 13, "ทั้งโกดังต้องได้ 13 แผ่น");
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
  assert.ok(src.includes('load: "remove"'), "ชนิด load ต้องถอยไปลงเป็น remove");
  assert.ok(src.includes('cage_put: "place"') && src.includes('cage_del: "remove"'),
    "ชนิดของกรงเหล็กก็ต้องมีทางถอย ไม่งั้นประวัติกรงหายบนฐานรุ่นเก่า");
  assert.ok(src.includes('"ขึ้นรถ"') && src.includes('"ใส่กรงเหล็ก"'), "ต้องเขียนเหตุไว้ในหมายเหตุ");
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
  assert.ok(D3D.includes('$("pop").style.bottom = popBottom + "px"'), "ต้องคำนวณตำแหน่งจาก JS");
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

ok("ค่าตั้งต้น = 8 ป้าย/แผ่น (ภูม 14/11 · ของเดิม 12 ป้าย)", () => {
  const i = LBL.indexOf('<select id="size">');
  const block = LBL.slice(i, i + 300);
  const first = /<option value="(\d+)"/.exec(block);
  assert.equal(first && first[1], "8", "ตัวเลือกแรก (= ค่าตั้งต้น) ต้องเป็น 8 ป้าย/แผ่น");
  assert.ok(!/ป้าย\/แถว/.test(block), "ชื่อตัวเลือกต้องบอกเป็น 'ป้าย/แผ่น' (ภูมคิดเป็นแผ่น)");
});

ok("🔴 เตือนเมื่อแท่งบาร์โค้ดเล็กกว่าที่เครื่องยิงอ่านได้", () => {
  /* วัดจริงแล้ว: 4 ป้าย/แถว (ของเดิม) ได้ 0.18 มม. → เครื่องยิงอ่านไม่ออกจริง
     📌 ชุดขนาดตอนนี้ (8/12/24 ป้ายต่อแผ่น) ผ่าน 0.19 มม. ทุกตัวแล้ว
        แต่ยามนี้ยังต้องอยู่ — เผื่อวันหน้ามีคนเพิ่มขนาดเล็กกว่านี้เข้ามา */
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
  assert.equal(L.convertOldCode("A0501-R"), "A0105", "เดิม ล็อก5 ชั้น1 · หางฝั่งถูกตัด");
  assert.equal(L.convertOldCode("A1004"), "A0410", "เดิม ล็อก10 ชั้น4");
  assert.equal(L.convertOldCode("A0107"), null, "เดิมแถว A ไม่มีชั้น 7");
  assert.equal(L.convertOldCode("ไม่ใช่รหัส"), null);
});

ok("ทุกช่องในผังยังครบ 104 และรหัสไม่ซ้ำกัน", () => {
  const b = L.buildLayout();
  assert.equal(b.slots.length, 104);
  assert.equal(new Set(b.slots.map((s) => s.slot)).size, 104, "รหัสซ้ำ = ของทับกัน");
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
  assert.ok(!/sel\.zone \+ pad2\(/.test(A), "ห้ามต่อรหัสเอง — ต้องหาจาก L.slots");
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
  const s = v.layout.slots.find((x) => x.slot === "A0105");
  assert.equal(s.items.length, 1, "ต้องไปโผล่ที่ช่องเดียวกันในรูปใหม่");
  assert.equal((v.orphans || []).length, 0, "ต้องไม่กลายเป็นของกำพร้า");
});

ok("🔴 ป้าย/หน้าจอ ต้องเรียงคำ ชั้นก่อนล็อก ให้ตรงกับรหัส", () => {
  /* อ่านรหัสได้ลำดับหนึ่ง อ่านคำได้อีกลำดับ = คนเดินหาของผิดช่อง */
  const lb = L.slotLabel("B0410");
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
      assert.ok(L.parseSlot(m), "รหัสผีใน " + file + " → " + m);
    }
  }
  /* 🔴 ข้อมูลตัวอย่าง (ไม่ใช่คอมเมนต์) ห้ามมีหาง -L/-R อีก — ไม่งั้นโหมดลองดูสอนรูปแบบที่เลิกใช้ */
  const demo = fs.readFileSync("warehouse-demo.js", "utf8");
  const tails = demo.match(/[A-C]\d{4}-[LR]/g) || [];
  assert.equal(tails.length, 0, "ข้อมูลลองดูยังมีหางฝั่ง: " + tails.join(" · "));
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

/* ════ ⑬ 🔒 ล็อกแถว — ต้องมองง่าย ไม่ใช่ลาย (ภูม 2026-11-13) ════════ */
section("ล็อกแถว");

const LOCK3D = fs.readFileSync("warehouse-3d.html", "utf8");

ok("🔴 ล็อกแถวแล้วต้องซ่อนโครงเหล็กแถวอื่นด้วย ไม่ใช่ซ่อนแค่กล่อง", () => {
  /* ภูม: *"พอกดล็อกแถวแล้ว … มันลายจนมองยากเลยอะ"*
     ต้นเหตุ = ซ่อนแค่กล่องของแถวอื่น แต่เสา/คานยังบังเต็มหน้า มองทะลุไป 3 แถว */
  /* 🧱 13/11: แถว B เป็นชั้นคู่ ⇒ จำเป็น "หน้าชั้น" ไม่ใช่ "แถว" (ซ่อนทีละฝั่งได้) */
  assert.ok(LOCK3D.includes("postOf.push(f.key)"), "ต้องจำว่าเสาชิ้นไหนของหน้าชั้นไหน");
  assert.ok(LOCK3D.includes("beamOf.push(f.key)"), "ต้องจำว่าคานชิ้นไหนของหน้าชั้นไหน");
  assert.ok(/function paintStructure\(\)/.test(LOCK3D), "ต้องมีตัววาดโครงเหล็ก");
  assert.ok(/const on = !only \|\| postOf\[i\] === only/.test(LOCK3D), "ต้องซ่อนเสาแถวอื่น");
  assert.ok(/const on = !only \|\| beamOf\[i\] === only/.test(LOCK3D), "ต้องซ่อนคานแถวอื่น");
  const i = LOCK3D.indexOf("function applyLock()");
  assert.ok(LOCK3D.slice(i, i + 600).includes("paintStructure()"), "สลับล็อกแล้วต้องทาโครงใหม่");
});

ok("🔴 มุมตอนล็อกต้องเป็นหน้าตรง 90° เป๊ะ (เอียงนิดเดียวชั้นก็ซ้อนกันจนอ่านยาก)", () => {
  const i = LOCK3D.indexOf("function focusRowSide");
  const body = LOCK3D.slice(i, i + 2400);   // เผื่อคอมเมนต์ยาว
  assert.ok(/flyTo\([\s\S]*?Math\.PI \/ 2\);/.test(body), "ต้องยิงกล้องที่ phi = 90°");
  assert.ok(!/, 1\.4\);/.test(body), "ห้ามกลับไปใช้มุมเอียงเดิม");
});

ok("🔴 ต้องมีป้ายเลขล็อก/เลขชั้นแบบตั้ง (ป้ายพื้นนอนอยู่ มองหน้าตรงไม่เห็น)", () => {
  /* 🪤 เจอจริง: ล็อกแถวแล้วมองหน้าตรง ป้ายเลขล็อกของเดิมหายหมด
     เพราะมันวางนอนกับพื้น (rotation.x = -90°) ⇒ มองจากด้านข้างเลยเห็นเป็นเส้นบางๆ
     = ล็อกแถวแล้วไม่รู้ว่าช่องไหนคือล็อกอะไร */
  assert.ok(LOCK3D.includes("function billboard("), "ต้องมีป้ายแบบหันเข้าหากล้อง");
  assert.ok(/rotation\.y = faceRight \? Math\.PI \/ 2 : -Math\.PI \/ 2/.test(LOCK3D), "ป้ายต้องตั้งหันเข้าหากล้อง");
  assert.ok(LOCK3D.includes("showLockTags(lockedFace)"), "ล็อก/ปลดล็อกต้องอัปเดตป้าย");
  assert.ok(LOCK3D.includes("function clearLockTags"), "ปลดล็อกต้องเก็บป้ายคืน (ไม่งั้นค้างทับจอ)");
});

ok("🔴 กดช่องในจอ 3D แล้วต้องเพิ่มของเข้าช่องนั้นได้เลย (ไม่ต้องเลือกช่องใหม่)", () => {
  /* ภูม 2026-11-13: *"กดเพิ่มรายการจากล็อกที่เรากดเลือกไปด้วยเลย …
     พอกดไปแล้ว ก็เท่ากับเลือกล็อกเรียบร้อย ก็ยิงแทรคได้เลย"* */
  const D3 = fs.readFileSync("warehouse-3d.html", "utf8");
  /* 🪤 ยาม 2 บรรทัดนี้เคย "เขียวหลอก" มาแล้ว — ตอนเขียนผ่าน shell เครื่องหมาย / ของ regex
     ถูกกลืนจนกลายเป็น `//...` = คอมเมนต์ แล้วข้อความอธิบายกลายเป็นค่าที่ assert เอาไปตรวจ
     (สตริงไม่ว่าง = ผ่านตลอด) ⇒ ที่นี่ใช้ includes เทียบข้อความตรงๆ ไม่ใช้ regex */
  assert.ok(D3.includes('<div class="padd" id="popAdd">'), "ต้องมีแถวปุ่มเพิ่มของในป๊อปอัพ");
  /* 🏭 ตั้งแต่ 13/11 ต้องพา **โกดัง** ไปด้วย — รหัสช่องซ้ำกันได้ 2 โกดัง
     ส่งแต่ช่องเปล่าๆ = หน้ายิงเดาโกดังเอง แล้วของลงผิดตึก */
  const slotQ = '"&wh=" + encodeURIComponent(WH) + "&slot=" + encodeURIComponent(s.slot)';
  assert.ok(D3.includes("const slotQ = " + slotQ), "ลิงก์ต้องพาทั้งโกดังและช่องที่กด");
  assert.ok(D3.includes('api("/warehouse/scan") + slotQ'), "ปุ่มยิงต้องพาช่องที่กดไปด้วย");
  assert.ok(D3.includes('api("/warehouse/assign") + slotQ'), "ปุ่มคีย์เองต้องพาช่องที่กดไปด้วย");
});

ok("🔴 หน้ายิง/หน้าคีย์ ต้องรับช่องที่ส่งมาแล้วเลือกให้เสร็จ", () => {
  const SC = fs.readFileSync("warehouse-scan.html", "utf8");
  assert.ok(SC.includes('new URLSearchParams(location.search).get("slot")'), "หน้ายิงต้องอ่าน ?slot=");
  assert.ok(SC.includes("if (fromUrl && slotExists(fromUrl.code))"),
    "ต้องตรวจว่าช่องมีจริงก่อนเลือกให้ (กันลิงก์มั่ว)");
  const AS = fs.readFileSync("warehouse-assign.html", "utf8");
  assert.ok(AS.includes('get("slot")'), "หน้าคีย์เองต้องอ่าน ?slot=");
  assert.ok(AS.includes("sel.zone = hit.row"), "ต้องติ๊ก โซน/ล็อก/ชั้น ให้ครบ");
  assert.ok(AS.includes('.replace(/^([A-Z]\\d{4})[LR]$/, "$1")'),
    "ลิงก์เก่าที่ยังมีหางฝั่งต้องเปิดได้ (ไม่ใช่ขึ้นว่าไม่มีช่องนี้)");
  assert.ok(!/id="sides"/.test(AS), "ฟอร์มต้องไม่มีปุ่มเลือกฝั่งแล้ว");
  const SCAN2 = fs.readFileSync("warehouse-scan.html", "utf8");
  assert.ok(!/id="sides"/.test(SCAN2), "หน้ายิงต้องไม่มีปุ่มซ้าย/ขวาแล้ว");
});


/* ════ ⑫ 🏭 แยกโกดัง + กรงเหล็ก (ภูม 2026-11-13) ══════════════════════
 *
 * ภูม: *"ตอนนี้เรามีมากกว่า 1 โกดังแล้ว"* + *"แยก Location ID และข้อมูลสต็อกตาม warehouse_id"*
 * 🔑 ภูมเคาะ: **รหัสช่องเหมือนกันทั้ง 2 โกดัง** แยกด้วยรหัสโกดัง
 *    ⇒ A0101 มี 2 ช่องในโลกจริง ⇒ ถ้าโค้ดไหนลืมดูโกดัง พนักงานจะเดินหาผิดตึก
 */
section("แยกโกดัง (โกดัง 1 · โกดัง 2)");

ok("ทะเบียนโกดังมี 2 โกดัง · โกดังตั้งต้น = โกดัง 1", () => {
  assert.equal(L.WAREHOUSES.length, 2);
  assert.equal(L.DEFAULT_WH, "WH1");
  assert.equal(L.whName("WH2"), "โกดัง 2");
});

ok("อ่านรหัสโกดัง — ว่าง/ไม่รู้จัก = โกดังตั้งต้น · '2' ก็เข้าใจ", () => {
  assert.equal(L.normWh(""), "WH1");
  assert.equal(L.normWh(null), "WH1");
  assert.equal(L.normWh("wh2"), "WH2");
  assert.equal(L.normWh("2"), "WH2");
  assert.equal(L.normWh("WH9"), "WH1", "ไม่รู้จัก = ตั้งต้น (ใช้กับการอ่านเท่านั้น)");
});

ok("🔴 ตอนเขียนฐานห้ามเดาโกดัง — รหัสมั่วต้องถูกปฏิเสธ", () => {
  /* 🪤 ถ้า "เดา" ตอนเขียน ของโกดัง 2 จะไปโผล่โกดัง 1 เงียบๆ แล้วหาไม่เจอทั้งใบ */
  assert.equal(L.isWh("WH2"), true);
  assert.equal(L.isWh("WH9"), false);
  assert.equal(L.isWh(""), false);
  const src = readFile("warehouse.js");
  assert.ok(src.includes("function strictWh("), "ต้องมีตัวตรวจรหัสโกดังแบบเข้ม");
  assert.ok(/strictWh\(o\.wh\)/.test(src), "ตัวคีย์ตำแหน่งต้องใช้ตัวเข้ม ไม่ใช่ normWh");
});

ok("🔴 ผังโกดัง 2 เหมือนโกดัง 1 เป๊ะ (ภูมยืนยัน 13/11)", () => {
  const plan = L.buildLayout();
  assert.equal(plan.totals.slots, 104, "ช่องรวม = 26 ล็อก × 4 ชั้น (ไม่แยกฝั่งแล้ว)");
  assert.equal(plan.warehouses.length, 2, "ผังต้องแนบทะเบียนโกดังไปให้หน้า 3D");
  assert.equal(plan.warehouses[0].id, "WH1");
});

ok("🔴 ของคนละโกดังต้องไม่ปนกันบนจอ", () => {
  /* กรองที่ตัวโหลด (view) — mergeView รับเฉพาะของโกดังที่เลือกมาแล้ว */
  const src = readFile("warehouse.js");
  assert.ok(/all\.filter\(\(p\) => p\.wh === wh\)/.test(src), "view ต้องกรองตามโกดัง");
  assert.ok(src.includes("byWh"), "ต้องนับของแต่ละโกดังไว้ให้ปุ่มสลับโชว์เลข");
});

ok("🔴 ช่องเดียวกันแต่คนละโกดัง = ย้ายจริง ไม่ใช่ 'ไม่มีอะไรเปลี่ยน'", () => {
  const src = readFile("warehouse.js");
  assert.ok(/fromSlot === s\.slot && fromWh === wh/.test(src),
    "ตัวเช็ค 'เหมือนเดิม' ต้องเทียบโกดังด้วย ไม่งั้นย้ายข้ามโกดังแล้วระบบเงียบ");
});

ok("🔴 ฐานที่ยังไม่มีช่องโกดัง: โกดัง 1 คีย์ได้ · โกดัง 2 ต้องฟ้อง ไม่ใช่ลงผิดที่", () => {
  const src = readFile("warehouse.js");
  assert.ok(src.includes("function isMissingSchema("), "ต้องรู้จักอาการ 'ยังไม่ได้ลง SQL'");
  assert.ok(/wh !== LAYOUT\.DEFAULT_WH[\s\S]{0,200}throw new Error/.test(src),
    "โกดังที่ไม่ใช่ตั้งต้น ห้ามถอยไปเขียนแบบไม่มีโกดัง (ของจะไปโผล่ผิดโกดัง)");
});

ok("แถวเก่าที่ยังไม่มีช่องโกดัง ถือว่าอยู่โกดัง 1", () => {
  const src = readFile("warehouse.js");
  assert.ok(/wh: LAYOUT\.normWh\(r\.wh\)/.test(src), "ตัวอ่านต้องเติมโกดังให้แถวเก่า");
});

ok("ไฟล์ SQL เพิ่มช่องโกดังแบบรันซ้ำได้ · ของเดิมไม่ขยับ", () => {
  const sql = readFile("warehouse-schema.sql");
  assert.ok(sql.includes("add column if not exists wh text not null default 'WH1'"),
    "ต้องเติมช่องแบบรันซ้ำได้ + แถวเก่าเป็นโกดัง 1");
  assert.ok(sql.includes("wh in ('WH1','WH2')"), "ด่านต้องรับแค่โกดังที่มีจริง");
});

ok("🔴 SQL เลิกแยกซ้าย/ขวา — ตัดหางให้ของเดิม + ด่านใหม่ไม่รับหาง", () => {
  /* 🪤 ไม่ตัดหางในฐาน = แถวเก่า slot ยังเป็น A0101-L ⇒ ตัวอ่านยังแกะออก (ใจดี)
        แต่ "ช่องเดียวกัน" จะกลายเป็น 2 คีย์ในตาราง ⇒ ค้นตาม slot แล้วเจอไม่ครบ */
  const sql = readFile("warehouse-schema.sql");
  assert.ok(sql.includes("drop constraint if exists wh_placement_slot_fmt"),
    "ต้องถอดด่านเก่าก่อนแก้ข้อมูล ไม่งั้น update ถูกปฏิเสธทั้งชุด");
  assert.ok(sql.includes("alter column side drop not null"), "ช่อง side ต้องปล่อยว่างได้");
  assert.ok(/update public\.wh_placement[\s\S]{0,160}regexp_replace\(slot, '-\[LR\]\$', ''\)/.test(sql),
    "ต้องตัดหางของแถวที่วางอยู่");
  assert.ok(/update public\.wh_cage[\s\S]{0,120}regexp_replace\(slot, '-\[LR\]\$', ''\)/.test(sql),
    "ต้องตัดหางของกรงเหล็กด้วย");
  assert.ok(sql.includes("set id = wh || '-' || slot"), "id ของกรงต้องต่อใหม่จากรหัสที่แก้แล้ว");
  assert.ok(sql.includes("check (slot ~ '^[A-Z][0-9]{4}$')"), "ด่านใหม่ต้องไม่รับหาง -L/-R");
  assert.ok(!/slot ~ '\^\[A-Z\]\[0-9\]\{4\}-\[LR\]\$'/.test(sql),
    "ด่านเก่าที่บังคับให้มีหางต้องไม่เหลืออยู่");
  /* 🗂 ประวัติต้องไม่ถูกเขียนทับ — ตอนนั้นของอยู่ครึ่งนั้นจริง */
  assert.ok(!/update public\.wh_move_log/.test(sql), "ห้ามแก้ประวัติย้อนหลัง");
});

ok("🔴 ตัวเขียนฐานเลิกส่งช่อง side (ฐานรุ่นใหม่ปล่อยว่าง)", () => {
  const src = readFile("warehouse.js");
  assert.ok(!/side: s\.side/.test(src), "ยังเขียน side อยู่ = ฟ้องเพราะ parseSlot ไม่คืนค่านั้นแล้ว");
  assert.ok(src.includes("function isOldSideSchema("),
    "ถ้าโค้ดขึ้นก่อนวาง SQL ต้องบอกเป็นภาษาคน ไม่ใช่โยนข้อความของ Postgres ให้พนักงานอ่าน");
  const demo = readFile("warehouse-demo.js");
  assert.ok(!/side: s\.side/.test(demo), "โหมดลองดูก็ต้องไม่เขียน side");
});

/* ── 🧺 กรงเหล็ก ─────────────────────────────────────────────────────
   ภูม: *"กรงมันขนาดเท่า[ช่อง] มันไม่ได้กินทั้งล็อก ซ้ายขวานะ
          ของในกรงมันก็กล่องนะ แต่กล่องเล็กไง"*
   ⇒ กรง = คุณสมบัติของช่อง · ของในกรง = แถวที่วางในช่องนั้น (ไม่มีที่เก็บแยก) */
section("กรงเหล็ก");

ok("ช่องที่มีกรง ติดข้อมูลกรงมากับช่อง + นับของในกรงให้", () => {
  const v = W.mergeView(
    [PL("T1", "A0101"), PL("T2", "A0101"), PL("T3", "B0101")],
    [],
    [{ slot: "A0101", kind: "nocode", name: "กรง No-Code 01" }],
  );
  const caged = v.layout.slots.find((s) => s.slot === "A0101");
  const plain = v.layout.slots.find((s) => s.slot === "B0101");
  assert.ok(caged.cage, "ช่องนี้ต้องมีกรง");
  assert.equal(caged.cage.name, "กรง No-Code 01");
  assert.equal(caged.cage.kind, "nocode");
  assert.equal(caged.cage.items, 2, "นับของในกรงจากของที่วางในช่องนั้น");
  assert.equal(plain.cage, null, "ช่องที่ไม่มีกรงต้องเป็น null");
  assert.equal(v.counts.cages, 1);
});

ok("ไม่มีกรงเลย = ทุกช่องไม่มีกรง (ของเดิมไม่เปลี่ยน)", () => {
  const v = W.mergeView([PL("T1", "A0101-L")], []);
  assert.equal(v.layout.slots.find((s) => s.slot === "A0101").cage, null);
  assert.equal(v.counts.cages, 0);
});

ok("กรงชนิดมั่ว = ตกเป็นกรงชิ้นเล็ก ไม่ใช่พังทั้งจอ", () => {
  const v = W.mergeView([], [], [{ slot: "C0101-L", kind: "มั่ว", name: "" }]);
  const s = v.layout.slots.find((x) => x.slot === "C0101");
  assert.equal(s.cage.kind, "small");
  assert.equal(s.cage.name, "กรงเหล็ก", "ไม่มีชื่อ = ชื่อสำรอง ไม่ใช่ช่องว่าง");
});

ok("กรงที่ชี้ช่องที่ไม่มีในผัง = ข้ามไป (ไม่ทำให้จอล้ม)", () => {
  const v = W.mergeView([], [], [{ slot: "Z9999-L", kind: "small", name: "กรงผี" }]);
  assert.equal(v.counts.cages, 0);
});

ok("🔴 1 ช่อง 1 กรง + ของในกรงไม่หายตอนเอากรงออก", () => {
  const sql = readFile("warehouse-schema.sql");
  assert.ok(sql.includes("unique (wh, slot)"), "ช่องเดียวกันต้องมีกรงได้ใบเดียว");
  const src = readFile("warehouse.js");
  const i = src.indexOf("async function removeCage(");
  assert.ok(i > 0, "ต้องมีตัวเอากรงออก");
  const body = src.slice(i, i + 700);
  assert.ok(!body.includes("wh_placement"), "เอากรงออกห้ามแตะของที่วางอยู่ (ของยังอยู่ช่องเดิม)");
});

ok("ยังไม่ได้ลงตารางกรง = จอยังเปิดได้ (แค่ไม่มีกรง)", () => {
  const src = readFile("warehouse.js");
  const i = src.indexOf("async function listCages(");
  const body = src.slice(i, i + 600);
  assert.ok(/isMissingSchema\(error\)\) return \[\]/.test(body), "ยังไม่มีตาราง = คืนรายการว่าง ไม่โยน");
  assert.ok(src.includes("ยังไม่ได้ลงตารางกรงเหล็ก"), "ตอนจะ 'ใส่กรง' ต้องบอกตรงๆ ว่าต้องลง SQL ก่อน");
});

ok("ค้นกรงได้จากชื่อ (ข้ามโกดัง)", () => {
  const page = readFile("warehouse-page.js");
  assert.ok(page.includes("warehouse.findCages("), "ท่อค้นหาต้องค้นกรงด้วย");
  assert.ok(/cages: cages/.test(page), "ต้องส่งผลกรงกลับไปให้หน้าเว็บ");
});

ok("🔒 ท่อกรงอยู่หลังด่านคีย์เหมือนท่ออื่น", () => {
  const page = readFile("warehouse-page.js");
  assert.ok(/app\.post\("\/warehouse\/api\/cage", json, async \(req, res\) => \{\s*if \(!guard\(req, res\)\) return;/.test(page),
    "ท่อกรงต้องมี guard บรรทัดแรก");
});


/* ════ ⑬ 🏭 จอ 3D: ปุ่มสลับโกดัง · ป้ายจ่อเมาส์ · กรงเหล็ก ═════════════ */
section("จอ 3D — สลับโกดัง · ป้ายจ่อเมาส์ · กรงเหล็ก");

const D3H = readFile("warehouse-3d.html");

ok("🔴 กล้องตอนล็อก ต้องไปยืน 'ทางเดินของหน้าชั้นนั้น' เสมอ", () => {
  /* ภูม 2026-11-13 (รูปแถว C): *"ล็อกซ้ายมันดันอยู่ขวาแทนอะ มันต้องคอยหมุนกล้องให้ถูกอะ"*
     + *"แค่แถว C อะ เพราะมันชิดกำแพงซ้าย"*
     🔑 ตัวตัดสินเดียว = face.from ในผัง (ฝั่งที่คนยืนในทางเดิน)
        ⇒ ล็อกแถวไหนก็เห็นชั้นวางจากฝั่งที่คนยืนจริง เลขล็อกเดินทางเดียวกันทุกแถว
     🪤 ห้ามกลับไปเดาจากลำดับแถว/ตำแหน่งกล้อง (แถวกลางเคยสลับไปมาเอง)
     📌 14/11 เลิกใช้ซ้าย/ขวาในรหัสช่องแล้ว — face.from เหลือหน้าที่คุมกล้อง/ป้ายอย่างเดียว */
  const i = D3H.indexOf("function focusRowSide(");
  assert.ok(i > 0, "ต้องมีตัวตั้งกล้องตอนล็อกแถว");
  const body = D3H.slice(i, i + 2400);
  assert.ok(/const fromRight = row\.from === "\+X";/.test(body), "ฝั่งกล้องต้องมาจากผัง (face.from)");
  assert.ok(!/camera\.position\.x >/.test(body), "ห้ามเลือกฝั่งตามตำแหน่งกล้อง (แถวกลางจะสลับไปมาเอง)");
  assert.ok(!/rows\.length - 1 \? false/.test(body), "ห้ามเดาฝั่งจากลำดับแถว");

  const j = D3H.indexOf("function showLockTags(");
  const tags = D3H.slice(j, j + 1800);
  assert.ok(/const faceRight = row\.from === "\+X";/.test(tags), "ป้ายต้องอยู่ฝั่งเดียวกับกล้อง");
  assert.ok(!/camera\.position\.x >/.test(tags), "ป้ายห้ามเลือกฝั่งเอง ไม่งั้นไปอยู่หลังชั้นวาง");
  assert.ok(tags.includes("← ล็อก") && tags.includes("ล็อก →"), "ยืนคนละฝั่ง ลูกศรต้องชี้คนละทาง");

  /* 🧭 ของจริงจากผัง: A มองจาก +X · C กับหน้าซ้ายของ B มองจาก -X */
  assert.equal(L.rowOf("A").faces[0].from, "+X");
  assert.equal(L.rowOf("C").faces[0].from, "-X", "C ชิดกำแพงซ้าย ⇒ ทางเดินอยู่ฝั่ง -X");
  assert.equal(L.rowOf("B").faces[0].from, "-X", "หน้าซ้ายของ B หันออกทางเดินฝั่งแถว A");
  assert.equal(L.rowOf("B").faces[1].from, "+X", "หน้าขวาของ B หันออกทางเดินฝั่งแถว C");
});

ok("🔴 1 ช่อง = เต็มล็อก · ช่องติดกันไม่ทับกัน (ภูม 14/11)", () => {
  /* เดิม 1 ช่อง = ครึ่งล็อก (กว้าง 125) ⇒ 1 ล็อกมี 2 ช่องซ้าย/ขวา
     ตอนนี้ 1 ช่อง = เต็มล็อก (กว้าง 250) ⇒ กล่องที่วาดต้องกินเต็มล็อกพอดี ไม่ล้นไปล็อกข้างๆ */
  const a = L.slotBox("A0101"), b = L.slotBox("A0102");
  assert.equal(a.w, L.CELL.w, "ช่องต้องกว้างเต็มล็อก");
  assert.equal(a.d, L.CELL.d);
  assert.equal(a.h, L.CELL.h);
  assert.equal(a.z, L.bayZ0("A", 1) + L.CELL.w / 2, "กึ่งกลางช่องต้องอยู่กลางล็อกพอดี");
  /* ล็อกติดกันห่างกันเท่าระยะล็อก (= กว้างช่อง + เสา) ⇒ ขอบไม่เหลื่อมกัน */
  assert.equal(Math.abs(b.z - a.z), L.BAY_PITCH, "ล็อกติดกันต้องห่างเท่า BAY_PITCH");
  assert.ok(Math.abs(b.z - a.z) >= a.w, "ช่องติดกันห้ามทับกัน");
  /* ป้ายเก่ายิงเข้ามา ต้องได้กล่องเดียวกับป้ายใหม่ */
  assert.deepEqual(L.slotBox("A0101-L"), a);
  assert.deepEqual(L.slotBox("A0101-R"), a);
  /* จอ 3D ต้องวาดเต็มล็อกด้วย ไม่ใช่ครึ่ง (ไม่งั้นเห็นช่องโหว่กลางชั้น) */
  const D3 = readFile("warehouse-3d.html");
  assert.ok(D3.includes("(C.w - 16) * S"), "กล่องสินค้าต้องกว้างเต็มล็อก");
  assert.ok(!/\(C\.w \/ 2 - 10\) \* S/.test(D3), "ยังวาดครึ่งล็อกอยู่");
  assert.ok(/new THREE\.BoxGeometry\(C\.d \* S, \(C\.h \+ ST\.beam\) \* S, C\.w \* S\)/.test(D3),
    "กรอบรับคลิกต้องเต็มล็อก");
});

ok("🧱 แถว B = ชั้นคู่หันหลังชนกัน · ล็อก 1-5 กับ 6-10 จับคู่กันพอดี", () => {
  /* ภูม 2026-11-13: *"ฝั่งซ้าย ยาว 5 ล็อก (B01-B05) · ฝั่งขวา วางหลังชนกับฝั่งซ้าย (B06-B10)
     โดยวางเรียงคู่ขนานกัน (1 คู่ 6, 2 คู่ 7, 3 คู่ 8, 4 คู่ 9, 5 คู่ 10)"* */
  const b = L.rowOf("B");
  assert.equal(b.faces.length, 2, "แถว B ต้องมี 2 หน้าชั้น");
  assert.deepEqual(b.faces.map((f) => [f.first, f.count]), [[1, 5], [6, 5]]);
  for (let n = 0; n < 5; n++) {
    assert.equal(L.bayZ0("B", 1 + n), L.bayZ0("B", 6 + n), "ล็อก " + (1 + n) + " ต้องอยู่ตรงกับล็อก " + (6 + n));
    assert.notEqual(L.slotBox(L.locationCode("B", 1 + n, 1)).x,
      L.slotBox(L.locationCode("B", 6 + n, 1)).x, "แต่ต้องคนละด้านของชั้น (X ต่างกัน)");
  }
  assert.equal(L.faceOfBay("B", 5).face.key, "B1");
  assert.equal(L.faceOfBay("B", 6).face.key, "B2");
});

ok("📷 เปิดดูกล่องไหน ต้องเห็นรูปสินค้าของกล่องนั้น", () => {
  /* ภูม 2026-11-13: *"เวลากดดูแทรคไหน ให้ดึงรูปมาแสดงด้วย
     เวลาพนักงานเช็คของเห็นภาพมันจะสะดวกมากเลย"* */
  /* 🪤 เช็คแค่ 'data-pics=' ไม่พอ — ตัวอ่าน querySelector ก็มีคำนี้ ⇒ ถอดการ์ดออกยามก็ยังเขียว
     ⇒ เช็คที่ "ตัววาดการ์ด" ตรงๆ ว่ายังใส่ที่วางรูปให้ทุกแทรค */
  assert.ok(D3H.includes("'<div class=\"pics\" data-pics=\"'"), "ต้องมีที่วางรูปในการ์ดของแต่ละแทรค");
  assert.ok(D3H.includes("function paintPics("), "ต้องมีตัววาดแถวรูป");
  assert.ok(/\(\(got && got\.images\) \|\| \[\]\)/.test(D3H), "รูปต้องมาจากข้อมูลที่ขอรายกล่อง");
  assert.ok(D3H.includes("function openShot("), "ต้องกดดูรูปใหญ่ได้");
  assert.ok(D3H.includes('referrerpolicy="no-referrer"'), "ขอรูปข้ามเว็บ ไม่ต้องบอกว่ามาจากหน้าไหน");
});

ok("🔴 รูปเสียต้องไม่เหลือกรอบแตก · ไม่มีรูปต้องไม่เหลือช่องว่าง", () => {
  const i = D3H.indexOf("function paintPics(");
  const body = D3H.slice(i, i + 1200);
  assert.ok(/if \(!list\.length\) \{ host\.remove\(\); return; \}/.test(body),
    "ไม่มีรูป = เก็บแถวทิ้ง ไม่ทิ้งช่องว่างให้รก");
  assert.ok(/addEventListener\("error"/.test(body), "รูปเปิดไม่ขึ้น = เอาออกเงียบๆ");
});

ok("🔴 ปิดช่อง/กด Esc ต้องปิดรูปใหญ่ด้วย (ไม่ค้างทับจอ)", () => {
  assert.ok(D3H.includes("function closeShot()"), "ต้องมีตัวปิดรูป");
  const esc = D3H.indexOf('if (e.key !== "Escape") return;');
  assert.ok(D3H.slice(esc, esc + 260).includes("closeShot()"), "Esc ต้องปิดรูปก่อนย้อนมุมกล้อง");
  const cp = D3H.indexOf("window.closePop = ");
  assert.ok(D3H.slice(cp, cp + 260).includes("closeShot()"), "ปิดช่องต้องปิดรูปที่ค้างอยู่");
});

ok("🔴 มือถือ: ป๊อปอัพต้องไม่ทับปุ่มมุมมอง", () => {
  /* ภูม 2026-11-13: *"ในมือถือก็ต้องใช้ได้ไม่ทับกันไม่บัค รีเช็คด้วยนะ"*
     🪤 ของเดิมสูงตายตัว 46vh ⇒ พอแผนผังย่อ/จอเตี้ย แผ่นป๊อปอัพเลยขึ้นไปทับปุ่มมุมมอง */
  const i = D3H.indexOf("function resize()");
  const body = D3H.slice(i, i + 1600);
  assert.ok(body.includes('$("views").getBoundingClientRect().bottom'),
    "ต้องวัดขอบล่างของปุ่มมุมมองจริง ไม่ใช่เดาเป็น vh");
  assert.ok(/\$\("pop"\)\.style\.maxHeight = room/.test(body), "ต้องจำกัดความสูงป๊อปอัพตามที่ว่างจริง");
});

ok("🧱 จอ 3D วาดชั้นคู่ + ล็อกทีละฝั่งได้", () => {
  /* ภูม 2026-11-13: *"ให้มีปุ่มย่อยสำหรับสลับดู ฝั่งซ้าย (B1-B5) และ ฝั่งขวา (B6-B10)
     … และไม่ถูกอีกฝั่งที่หันหลังชนกันบังการคลิก"* */
  assert.ok(/for \(const f of row\.faces\)/.test(D3H), "ต้องวาดทีละหน้าชั้น ไม่ใช่ทีละแถว");
  assert.ok(D3H.includes("function setLockFace("), "ต้องสลับฝั่งได้โดยไม่ปลดล็อก");
  assert.ok(/lockedFace && s\.face !== lockedFace/.test(D3H),
    "อีกฝั่งที่ชนหลังกันต้องคลิกไม่โดน (ไม่งั้นกดทะลุไปโดนของอีกฝั่ง)");
  assert.ok(D3H.includes('"fstack" : "bays"') && D3H.includes('class="fside'),
    "แผนผังต้องโชว์แถวชั้นคู่เป็น 2 บรรทัดติดกัน");
  assert.ok(/data-face="/.test(D3H), "ต้องมีปุ่มเลือกฝั่งในแผนผัง");
  assert.ok(D3H.includes("button.sd"), "แถบล็อกต้องมีปุ่มสลับฝั่ง");
});

ok("มีปุ่มสลับโกดังบนแถบหัว + ขึ้นว่ากำลังดูโกดังไหน", () => {
  assert.ok(D3H.includes('<div id="whTabs"'), "ต้องมีแถวปุ่มสลับโกดังในแถบหัว");
  assert.ok(D3H.includes("#whTabs button.on"), "ต้องมีสถานะ active ให้เห็นว่าอยู่โกดังไหน");
  assert.ok(D3H.includes("function renderWhTabs("), "ต้องวาดปุ่มจากทะเบียนโกดัง ไม่ใช่ฝังตายในหน้า");
});

ok("🔴 ทุกคำขอของจอต้องพารหัสโกดังไปด้วย", () => {
  /* 🪤 ลืมที่เดียว = จอโกดัง 2 โชว์ของโกดัง 1 แล้วพนักงานเดินหาผิดตึก */
  assert.ok(D3H.includes('api("/warehouse/api/view?wh=" + encodeURIComponent(WH))'),
    "ตัวโหลดภาพรวมต้องส่งโกดัง");
  assert.ok(D3H.includes('"/warehouse/assign?wh=" + encodeURIComponent(WH)'), "ลิงก์หน้าคีย์ต้องพาโกดัง");
  assert.ok(D3H.includes('"/warehouse/scan?wh=" + encodeURIComponent(WH)'), "ลิงก์หน้ายิงต้องพาโกดัง");
  assert.ok(/body: JSON\.stringify\(\{ wh: WH, slot: s\.slot/.test(D3H), "ท่อกรงต้องส่งโกดัง");
});

ok("สลับโกดังแล้วจำไว้ (รีเฟรช/แชร์ลิงก์แล้วยังอยู่โกดังเดิม)", () => {
  assert.ok(D3H.includes('localStorage.setItem(WH_KEY, WH)'), "ต้องจำโกดังไว้ในเครื่อง");
  assert.ok(D3H.includes('u.searchParams.set("wh", WH)'), "ต้องติดโกดังไว้ใน URL");
});

ok("🔴 สลับโกดังต้องล้างของเก่าบนจอ ไม่ใช่ค้างไว้", () => {
  const i = D3H.indexOf("async function switchWh(");
  assert.ok(i > 0, "ต้องมีตัวสลับโกดัง");
  const body = D3H.slice(i, i + 1400);
  assert.ok(body.includes("closePop()"), "ต้องปิดป๊อปอัพของช่องโกดังเดิม");
  assert.ok(body.includes("lockedRow = null"), "ต้องปลดล็อกแถวของโกดังเดิม");
  assert.ok(body.includes("await load(true)"), "ต้องโหลดข้อมูลของโกดังใหม่");
  assert.ok(body.includes("toast("), "ต้องขึ้นป้ายบอกว่าสลับมาโกดังไหน");
});

ok("🔴 ค้นหาข้ามโกดัง — ไม่เจอในโกดังนี้ ต้องไปหาอีกโกดังแล้วสลับให้", () => {
  /* ภูม: *"หากผู้ใช้งานค้นหาแทร็กกิ้งที่อยู่ในอีกโกดังหนึ่ง ให้ระบบ Auto-Switch
     สลับไปที่โกดังนั้นให้ทันที พร้อมเลื่อนกล้อง 3D ซูมไปยังช่องชั้นเป้าหมาย"* */
  const i = D3H.indexOf("async function searchOtherWarehouses(");
  assert.ok(i > 0, "ต้องมีตัวค้นข้ามโกดัง");
  const body = D3H.slice(i, i + 1200);
  assert.ok(body.includes('api("/warehouse/api/find?q='), "ต้องถามเซิร์ฟเวอร์ (เครื่องเรามีแค่โกดังเดียว)");
  assert.ok(body.includes("switchWh("), "เจอที่อีกโกดัง = ต้องสลับให้");
  assert.ok(body.includes("อัตโนมัติ"), "ต้องบอกว่าสลับให้อัตโนมัติ");
  assert.ok(body.includes("doSearch(q, true)"), "สลับแล้วต้องค้นซ้ำเพื่อซูมไปช่องนั้น");
  assert.ok(D3H.includes("async function doSearch(term, noHop)"), "ต้องมีตัวกันวนลูปสลับไปมา");
});

ok("ป้ายจ่อเมาส์บอกช่อง + แทรค + ลูกค้า (ตามภาพที่ภูมส่ง)", () => {
  assert.ok(D3H.includes('<div id="tip">'), "ต้องมีป้ายจ่อเมาส์");
  assert.ok(D3H.includes("TRACKING:") && D3H.includes("CUSTOMER:"), "ต้องมีหัวข้อตามภาพตัวอย่าง");
  assert.ok(D3H.includes("function showTipAt("), "ต้องมีตัววาดป้าย");
  assert.ok(/e\.pointerType !== "mouse"/.test(D3H), "จอสัมผัสไม่มี hover ⇒ ต้องข้าม");
});

ok("🔒 ป้ายจ่อเมาส์ห้ามหลุดที่อยู่/เบอร์ลูกค้า", () => {
  /* ภาพรวมขอมาแค่ธง — ถ้าป้ายจ่อไปโชว์ที่อยู่ แปลว่ามีใครแอบดึงข้อมูลส่วนตัวมาทั้งโกดัง */
  const i = D3H.indexOf("function tipHtml(");
  const body = D3H.slice(i, D3H.indexOf("function showTipAt("));
  for (const k of ["address", "receiver", ".tel"])
    assert.ok(!body.includes(k), "ป้ายจ่อเมาส์ห้ามมี " + k);
});

ok("🧺 กรงเหล็ก: ฟ้า = ชิ้นเล็ก · ม่วง = No-Code · มีป้ายชื่อ + จำนวน", () => {
  assert.ok(/CAGE_COLOR = \{ small: 0x22d3ee, nocode: 0xa855f7 \}/.test(D3H),
    "สีต้องตรงตามที่ภูมสั่ง (ฟ้า/ม่วง)");
  assert.ok(D3H.includes("function cageWire("), "ต้องมีโครงตะแกรงโปร่ง");
  assert.ok(D3H.includes("function cageBadge("), "ต้องมีป้ายชื่อกรง");
  assert.ok(/cageBadge\(s\.cage\.name \+ " \(" \+ \(s\.cage\.items \|\| 0\) \+ "\)"/.test(D3H),
    "ป้ายต้องมีชื่อกรง + จำนวนชิ้นข้างใน");
});

ok("🔴 ช่องที่มีกรง ต้องไม่วาดกล่องใหญ่ทับโครงกรง", () => {
  assert.ok(/const show = s\.items\.length > 0 && !s\.cage &&/.test(D3H),
    "ไม่งั้นกล่องใหญ่บังตะแกรงจนไม่รู้ว่ามีกรง");
  assert.ok(D3H.includes("DATA.pickColor[s.status]) || 0xcbd5e1"),
    "กล่องเล็กในกรงต้องใช้สีสถานะ ไม่งั้น 'ห้ามหยิบ' หายไปจากสายตา");
});

ok("🧺 ฟอร์มใส่กรง: เลือกชนิด + ตั้งชื่อ ในที่เดียว", () => {
  assert.ok(D3H.includes("function openCageForm("), "ต้องมีฟอร์มใส่/แก้กรง");
  assert.ok(D3H.includes('data-kind="small"') && D3H.includes('data-kind="nocode"'),
    "ต้องเลือกชนิดกรงได้ 2 แบบ");
  assert.ok(D3H.includes('id="cageName"'), "ต้องตั้งชื่อกรงได้");
  assert.ok(D3H.includes('id="cageAdd"') && D3H.includes('id="cageEdit"') && D3H.includes('id="cageDrop"'),
    "ต้องมีทั้งปุ่มใส่ · แก้ · เอาออก");
});

ok("🔴 เอากรงออก ต้องบอกว่าของข้างในไม่หาย", () => {
  const i = D3H.indexOf("if (drop) drop.addEventListener(");
  assert.ok(i > 0, "ต้องมีปุ่มเอากรงออก");
  const body = D3H.slice(i, i + 1100);
  assert.ok(body.includes("confirm("), "ต้องถามยืนยันก่อน");
  assert.ok(body.includes("ยังอยู่ช่องเดิม"), "ต้องบอกว่าของในกรงไม่ได้ถูกลบ");
});

ok("🧺 ค้นชื่อกรงได้จากช่องค้นหาเดียวกัน", () => {
  assert.ok(/s\.cage && String\(s\.cage\.name\)\.toUpperCase\(\)\.includes\(needle\)/.test(D3H),
    "ต้องค้นจากชื่อกรงในเครื่องก่อน");
});

/* ── 🏭 หน้ายิง / หน้าคีย์ ต้องรู้ว่าอยู่โกดังไหน ───────────────────── */
ok("🔴 หน้ายิง/หน้าคีย์ เลือกโกดังได้ + ส่งโกดังไปกับทุกการบันทึก", () => {
  /* 🪤 รหัสช่องซ้ำกัน 2 โกดัง ⇒ ไม่ส่งโกดัง = ของลงผิดตึกแบบเงียบๆ */
  const SC = readFile("warehouse-scan.html");
  const AS = readFile("warehouse-assign.html");
  for (const [name, src] of [["หน้ายิง", SC], ["หน้าคีย์", AS]]) {
    assert.ok(src.includes('id="whPick"'), name + ": ต้องมีตัวเลือกโกดังบนหัวจอ");
    assert.ok(src.includes('new URLSearchParams(location.search).get("wh")'), name + ": ต้องรับ ?wh= ที่ส่งมาจากจอ 3D");
    assert.ok(src.includes("wh: WH"), name + ": ต้องส่งโกดังไปกับการบันทึก");
    assert.ok(src.includes('api("/warehouse/api/view?wh=" + encodeURIComponent(WH))'), name + ": ต้องโหลดผังของโกดังที่เลือก");
  }
});

/* ════ สรุป ═══════════════════════════════════════════════════════════ */
console.log("\n" + (fail ? "❌" : "✅") + " warehouse: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
