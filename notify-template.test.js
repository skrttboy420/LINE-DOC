// ============================================================
// 🧪 เทสข้อความแจ้งเตือนที่แก้ไขได้ — ภูม 2026-10-21
//
// รัน:  node notify-template.test.js
//
// 🔑 ภูมถามตรงๆ ว่า *"ข้อความที่แก้ไขจะไม่กระทบกับตัวระบบแจ้งเตือนของบอทนะ …
//    หรือถ้ามันเสี่ยงเกินไปในการแก้ไขข้อความก็บอกภูมิได้เลย"*
//    ⇒ ยามชุดนี้คือคำตอบว่า "ไม่เสี่ยง" — พิสูจน์ 4 กติกาที่กันไว้
// ============================================================

const assert = require("node:assert/strict");
const T = require("./notify-template");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

console.log("\n🛟 กติกา ① ข้อความในโค้ดเป็นตัวสำรองเสมอ");

ok("ไม่มีของที่แก้ไว้ = ใช้ข้อความตั้งต้น", () => {
  const t = T.templateOf("arrive_th", null);
  assert.equal(t.head, T.DEFAULTS.arrive_th.head);
  assert.equal(t.line, T.DEFAULTS.arrive_th.line);
});

ok("ของที่แก้ไว้พัง/ว่าง = ถอยไปใช้ตัวสำรอง (ไม่ส่งข้อความเปล่า)", () => {
  for (const bad of [{}, { head: "" }, { head: "   ", line: null }, { head: 123, line: [] }]) {
    const t = T.templateOf("arrive_th", bad);
    assert.equal(t.head, T.DEFAULTS.arrive_th.head, "head ต้องถอยไปตัวสำรอง · ให้ " + JSON.stringify(bad));
    assert.equal(t.line, T.DEFAULTS.arrive_th.line, "line ต้องถอยไปตัวสำรอง");
  }
});

ok("แก้แค่หัวข้อ = บรรทัดรายการยังใช้ของเดิม", () => {
  const t = T.templateOf("arrive_th", { head: "ของมาแล้ว {จำนวน} ชิ้น" });
  assert.equal(t.head, "ของมาแล้ว {จำนวน} ชิ้น");
  assert.equal(t.line, T.DEFAULTS.arrive_th.line);
});

ok("ทุกหมวดที่แจ้งเตือนได้ ต้องมีข้อความตั้งต้นครบ", () => {
  for (const key of Object.keys(T.KIND_OF)) {
    assert.ok(T.DEFAULTS[key], `หมวด ${key} ไม่มีข้อความตั้งต้น`);
    const v = T.validateTemplate(key, T.DEFAULTS[key].head, T.DEFAULTS[key].line);
    assert.ok(v.ok, `ข้อความตั้งต้นของ ${key} ไม่ผ่านด่านตัวเอง: ${v.message}`);
  }
});

console.log("\n🔒 กติกา ② ช่องบังคับลบไม่ได้");

ok("ลบช่องที่บอกว่าเป็นงานไหน = เซฟไม่ผ่าน", () => {
  /* ลบแล้วแจ้งเตือนจะบอกแค่ "มีงาน 3 ใบ" โดยไม่บอกว่าใบไหน = ใช้งานไม่ได้ */
  const a = T.validateTemplate("arrive_th", "หัว {จำนวน}", "• {ชื่อลูกค้า} — {ชิ้น} ชิ้น");
  assert.equal(a.ok, false);
  assert.match(a.message, /\{รหัสลูกค้า\}/);

  const b = T.validateTemplate("shop_pay", "หัว {จำนวน}", "• {ชื่อลูกค้า} {ยอดเงิน}");
  assert.equal(b.ok, false);
  assert.match(b.message, /\{เลขออเดอร์\}/);

  const c = T.validateTemplate("acc_wht", "หัว {จำนวน}", "• {บริการ} {รายละเอียด}");
  assert.equal(c.ok, false);
  assert.match(c.message, /\{เลขอ้างอิง\}/);
});

ok("ช่องที่ไม่มีจริง = เซฟไม่ผ่าน + บอกว่าใช้อะไรได้", () => {
  /* ปล่อยผ่าน = ข้อความจริงจะมี {ของมั่ว} โผล่ไปถึงพนักงาน */
  const r = T.validateTemplate("arrive_th", "หัว {จำนวน}", "• {รหัสลูกค้า} {ของมั่ว}");
  assert.equal(r.ok, false);
  assert.match(r.message, /ไม่รู้จัก \{ของมั่ว\}/);
  assert.match(r.message, /\{ชื่อลูกค้า\}/, "ต้องบอกชื่อช่องที่ใช้ได้ด้วย");
});

ok("ช่องของหมวดอื่น เอามาใช้ข้ามหมวดไม่ได้", () => {
  // {เลขออเดอร์} ไม่มีในหมวดของถึงโกดัง ⇒ ใส่ไปก็เติมค่าไม่ได้ กลายเป็นข้อความเสีย
  const r = T.validateTemplate("arrive_th", "หัว {จำนวน}", "• {รหัสลูกค้า} {เลขออเดอร์}");
  assert.equal(r.ok, false);
});

console.log("\n📏 กติกา ③ จำกัดความยาว + ห้ามว่าง");

ok("ว่าง/ยาวเกิน = เซฟไม่ผ่าน", () => {
  assert.equal(T.validateTemplate("arrive_th", "", "• {รหัสลูกค้า}").ok, false);
  assert.equal(T.validateTemplate("arrive_th", "หัว", "").ok, false);
  assert.equal(T.validateTemplate("arrive_th", "ก".repeat(T.MAX_HEAD + 1), "• {รหัสลูกค้า}").ok, false);
  assert.equal(T.validateTemplate("arrive_th", "หัว", "• {รหัสลูกค้า}" + "ก".repeat(T.MAX_LINE)).ok, false);
});

ok("หมวดที่ไม่รู้จัก = ปฏิเสธ (ไม่เขียนของมั่วลงฐาน)", () => {
  assert.equal(T.validateTemplate("ของปลอม", "หัว", "บรรทัด").ok, false);
  assert.equal(T.templateOf("ของปลอม", null), null);
});

console.log("\n🖨 ประกอบข้อความจริง");

ok("เติมค่าครบทุกช่อง", () => {
  const txt = T.renderNotification("arrive_th", T.sampleRows("arrive_th"), null, 0);
  assert.ok(txt.includes("PR622"), "ต้องมีรหัสลูกค้า\n" + txt);
  assert.ok(txt.includes("434.52"), "ต้องมีน้ำหนัก");
  assert.ok(txt.includes("28 ชิ้น"), "หัวข้อต้องรวมจำนวนชิ้น (27+1)\n" + txt);
  assert.ok(!/\{[^}]+\}/.test(txt), "ต้องไม่มีช่องเสียบหลงเหลือ\n" + txt);
});

ok("ยอดเงินต้องจัดรูปแบบให้อ่านง่าย", () => {
  const txt = T.renderNotification("shop_pay", T.sampleRows("shop_pay"), null, 0);
  assert.ok(txt.includes("฿43,512.00"), "ต้องมีคั่นหลักพัน + ทศนิยม 2 ตำแหน่ง\n" + txt);
});

ok("ข้อความที่แก้แล้ว ถูกใช้จริง", () => {
  const txt = T.renderNotification("arrive_th", T.sampleRows("arrive_th"),
    { head: "🔥 ของเข้าไทย {ลูกค้า} เจ้า", line: "→ {รหัสลูกค้า} ({ชิ้น})" }, 0);
  assert.ok(txt.startsWith("🔥 ของเข้าไทย 2 เจ้า"), txt);
  assert.ok(txt.includes("→ PR622 (27)"), txt);
});

ok("มีของตัดทิ้ง ต้องบอกจำนวน", () => {
  const txt = T.renderNotification("acc_wht", T.sampleRows("acc_wht"), null, 7);
  assert.ok(txt.includes("… อีก 7 รายการ"), txt);
});

ok("ไม่มีรายการ = ไม่ส่งข้อความ (คืนค่าว่าง)", () => {
  assert.equal(T.renderNotification("arrive_th", [], null, 0), "");
  assert.equal(T.renderNotification("ของปลอม", T.sampleRows("arrive_th"), null, 0), "");
});

ok("ค่าที่หายไปต้องไม่กลายเป็น undefined บนหน้าจอ", () => {
  /* แถวที่ข้อมูลไม่ครบ (ลูกค้าไม่มีชื่อ ฯลฯ) ต้องขึ้นขีด ไม่ใช่คำว่า undefined */
  const txt = T.renderNotification("shop_pay", [{}], null, 0);
  assert.ok(!txt.includes("undefined"), txt);
  assert.ok(!txt.includes("null"), txt);
});

console.log("\nรวม: " + pass + " ผ่าน" + (fail ? " · " + fail + " ตก" : ""));
process.exit(fail ? 1 : 0);
