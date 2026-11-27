// ยามตรวจนับสต็อก — ภูม 2026-11-27
//
// เคสในนี้ยกมาจากของจริง (PR179 · 27/11) ทั้งหมด:
//   ระบบ + MOMO ตรงกันว่ามี 387 กล่อง · ยิงรับเข้าโกดังจริง 422 · ของบนชั้นเหลือ ~160
//   ⇒ ~227 กล่องออกไปโดยไม่มีใครบันทึก · ร่องรอย: ใบมอบงานคนขับ 0 แถว · รูป 3/161 แทรค
const assert = require("node:assert/strict");
const { reconcileCount, baseOf, digitsCore, keyFormsOf } = require("./warehouse-count-core");

let n = 0;
function ok(name, fn) { fn(); n++; console.log("  ✓ " + name); }

console.log("warehouse-count-core.test.js — ตรวจนับสต็อก (ภูม 2026-11-27)");

// ── รูปเลขแทรค ──
ok("เลขหลัก: ตัดหาง -i และ -i/n", () => {
  assert.equal(baseOf("1794460795-61/89"), "1794460795");
  assert.equal(baseOf("1792990621-5"), "1792990621");
  assert.equal(baseOf("1794460795"), "1794460795");
  assert.equal(baseOf("  1794460795-1/89  "), "1794460795");
});

ok("🪤 ตัดตัวอักษรนำหน้า JYM188067486656 → 188067486656 (ของจริง PR649)", () => {
  assert.equal(digitsCore("JYM188067486656"), "188067486656");
  assert.equal(digitsCore("YT7654942649999"), "7654942649999");
  assert.equal(digitsCore("1794460795"), null, "เลขล้วน = ไม่มีอะไรให้ตัด");
  assert.equal(digitsCore("ABCDE12345678"), null, "ตัวอักษรเกิน 4 ตัว = ไม่ใช่รูปนี้");
});

ok("กุญแจเทียบ: เลขเต็ม → เลขหลัก → เลขที่ตัดตัวอักษร", () => {
  assert.deepEqual(keyFormsOf("JYM188067486656-2/2"), ["JYM188067486656-2/2", "JYM188067486656", "188067486656"]);
  assert.deepEqual(keyFormsOf("1794460795"), ["1794460795"]);
  assert.deepEqual(keyFormsOf("   "), []);
});

// ── นับเป็นกล่อง ไม่ใช่แทรค ──
ok("🔴 1 แทรค 19 กล่อง ยิง 4 ครั้ง = เจอ 4 ขาด 15 (เคสที่ภูมเจอ)", () => {
  const r = reconcileCount(
    [{ tracking: "1791256737-2", boxes: 19 }],
    ["1791256737-2", "1791256737-2", "1791256737-2", "1791256737-2"],
  );
  assert.equal(r.totals.expectedBoxes, 19);
  assert.equal(r.totals.foundBoxes, 4);
  assert.equal(r.totals.missingBoxes, 15, "ยิง 1 ครั้งห้ามนับว่าเจอทั้ง 19 กล่อง");
  assert.equal(r.partial.length, 1);
  assert.equal(r.missing.length, 0, "เจอบางส่วน ≠ หายทั้งแถว");
});

ok("ยิงครบ = เข้ากอง 'ครบ'", () => {
  const r = reconcileCount([{ tracking: "A1", boxes: 3 }], ["A1", "A1", "A1"]);
  assert.equal(r.full.length, 1);
  assert.equal(r.totals.missingBoxes, 0);
});

ok("🔴 ไม่ยิงเลย = ของหายทั้งแถว", () => {
  const r = reconcileCount([{ tracking: "A1", boxes: 5 }, { tracking: "A2", boxes: 2 }], ["A1", "A1", "A1", "A1", "A1"]);
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].tracking, "A2");
  assert.equal(r.totals.missingBoxes, 2);
});

ok("🟡 ยิงเจอแต่ระบบไม่รู้จัก = กองเกิน (ของมาผิดที่)", () => {
  const r = reconcileCount([{ tracking: "A1", boxes: 1 }], ["A1", "ZZ999", "ZZ999"]);
  assert.equal(r.extra.length, 1);
  assert.deepEqual(r.extra[0], { code: "ZZ999", scanned: 2 });
  assert.equal(r.totals.extraScans, 2);
  assert.equal(r.totals.missingBoxes, 0);
});

ok("ยิงเกินจำนวนกล่องของแถวที่รู้จัก = นับเป็น over ไม่ใช่ของหาย", () => {
  const r = reconcileCount([{ tracking: "A1", boxes: 2 }], ["A1", "A1", "A1"]);
  assert.equal(r.totals.foundBoxes, 2);
  assert.equal(r.totals.overBoxes, 1);
  assert.equal(r.totals.missingBoxes, 0);
});

// ── เคสพี่น้อง ──
ok("ยิงเลขหลัก กระจายลงกล่องพี่น้องที่ยังขาด", () => {
  const r = reconcileCount(
    [{ tracking: "B-1/3", boxes: 1 }, { tracking: "B-2/3", boxes: 1 }, { tracking: "B-3/3", boxes: 1 }],
    ["B", "B", "B"],
  );
  assert.equal(r.totals.foundBoxes, 3, "ยิงเลขหลัก 3 ครั้ง = เติมพี่น้องครบ 3 ใบ");
  assert.equal(r.missing.length, 0);
});

ok("ยิงเลขเต็ม ต้องลงแถวนั้นก่อน ไม่ใช่แถวพี่น้อง", () => {
  const r = reconcileCount(
    [{ tracking: "B-1/2", boxes: 1 }, { tracking: "B-2/2", boxes: 1 }],
    ["B-2/2"],
  );
  const got = r.rows.find((x) => x.tracking === "B-2/2");
  assert.equal(got.scanned, 1);
  assert.equal(r.rows.find((x) => x.tracking === "B-1/2").scanned, 0);
});

ok("🪤 ระบบคีย์ไม่มีตัวอักษรนำหน้า แต่ยิงป้ายที่มี = ต้องจับคู่ได้ (ไม่เตือนลวง)", () => {
  const r = reconcileCount(
    [{ tracking: "188067486656-1/2", boxes: 1 }, { tracking: "188067486656-2/2", boxes: 1 }],
    ["JYM188067486656", "JYM188067486656"],
  );
  assert.equal(r.totals.foundBoxes, 2);
  assert.equal(r.totals.extraScans, 0, "ถ้าเตือนว่า 'ไม่รู้จัก' คนจะเลิกเชื่อผลนับทั้งใบ");
});

// ── เคสจริง PR179 ──
ok("🔴 PR179 ย่อส่วน: ระบบ 387 ยิงเจอ 160 ⇒ ของหาย 227", () => {
  const expected = [
    { tracking: "1791256737", boxes: 120 },
    { tracking: "1794460795", boxes: 89 },
    { tracking: "1792990621", boxes: 61 },
    { tracking: "1789622714", boxes: 57 },
    { tracking: "1792040614", boxes: 52 },
    { tracking: "1793516105", boxes: 8 },
  ];
  // ภูม: *"1794460795 อาจจะในโกดังแค่ 4 กล่อง · 1793516105 อาจจะเหลือ 5 กล่อง"*
  const found = { "1791256737": 60, "1794460795": 4, "1792990621": 40, "1789622714": 30, "1792040614": 21, "1793516105": 5 };
  const scans = [];
  for (const [t, c] of Object.entries(found)) for (let i = 0; i < c; i++) scans.push(t);

  const r = reconcileCount(expected, scans);
  assert.equal(r.totals.expectedBoxes, 387);
  assert.equal(r.totals.foundBoxes, 160);
  assert.equal(r.totals.missingBoxes, 227, "นี่คือตัวเลขที่ต้องเอาไปคุยกับพนักงานโกดัง");
  assert.equal(r.partial.length, 6, "ทุกชิปเม้นขาดบางส่วน — ไม่มีใบไหนหายหมดทั้งใบ");
  const worst = r.rows.find((x) => x.tracking === "1794460795");
  assert.equal(worst.boxes - worst.scanned, 85);
});

// ── ของเสีย ──
ok("ข้อมูลเพี้ยนไม่ล้ม", () => {
  assert.equal(reconcileCount(null, null).totals.expectedBoxes, 0);
  assert.equal(reconcileCount(undefined, ["A"]).totals.extraScans, 1);
  const r = reconcileCount([{ tracking: "A1" }, { tracking: "" }, null], ["a1", "  ", null]);
  assert.equal(r.rows[0].boxes, 1, "ไม่บอกจำนวนกล่อง = ถือว่า 1");
  assert.equal(r.rows[0].scanned, 1, "ตัวพิมพ์เล็ก/ใหญ่ต้องเทียบกันได้");
});

ok("รอบที่ยังไม่ยิงอะไรเลย = ทุกแถวอยู่กองหาย (ไม่ใช่ 'ครบ')", () => {
  const r = reconcileCount([{ tracking: "A1", boxes: 2 }], []);
  assert.equal(r.missing.length, 1);
  assert.equal(r.full.length, 0);
  assert.equal(r.totals.missingBoxes, 2);
});

console.log("\n✅ ผ่าน " + n + " ข้อ");
