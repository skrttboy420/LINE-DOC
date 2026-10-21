// ============================================================
// 🧪 เทสตัวแจกแจ้งเตือน — ภูม 2026-10-21
//
// รัน:  node notify-feed.test.js
//
// 🔑 ของที่ยามนี้คุม = **แจกถูกคนไหม** (เสี่ยงสุดในก้อนนี้)
//    แจกผิด = เซลเห็นลูกค้าของเซลคนอื่น · CS เห็นงานที่ตัวเองไม่ได้ดูแล
//    ซึ่งเป็นข้อมูลภายในที่ไม่ควรข้ามคน
//
// 🚫 ไม่ต่อไลน์/ฐาน/เว็บ — ตัวแจกเป็นฟังก์ชันล้วน (PURE)
// ============================================================

const assert = require("node:assert/strict");
const { planNotifications, NOTIFY_CATEGORIES, NOTIFY_KEYS } = require("./notify-feed");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

/** ทุกอย่างใหม่หมด (ไม่เคยบอกใคร) */
const allNew = () => true;
/** ไม่มีอะไรใหม่เลย (เคยบอกไปหมดแล้ว) */
const noneNew = () => false;

const BAM  = { line_user_id: "U_BAM",  login: "admin_bam",  name: "แบม",  active: true, notify: [...NOTIFY_KEYS] };
const MAY  = { line_user_id: "U_MAY",  login: "admin_may",  name: "เมย์", active: true, notify: [...NOTIFY_KEYS] };
const PLOY = { line_user_id: "U_PLOY", login: "admin_ploy", name: "พลอย", active: true, notify: [...NOTIFY_KEYS] };
const OUT  = { line_user_id: "U_OUT",  login: "admin_out",  name: "ลาออก", active: false, notify: [...NOTIFY_KEYS] };

/** feed ทรงเดียวกับที่เว็บคืนจริง (ตัวเลขจาก prod 2026-10-21) */
const FEED = {
  windowMinutes: 15,
  arrivals: {
    cnWarehouse: [],
    thArrived: [
      { customerCode: "PR622", customerName: "Woot Usanachitt", salesLogin: "admin_may", csLogin: "admin_ploy", pieces: 27, weightKg: 434.52, sampleTracks: ["YT123"] },
      { customerCode: "PR625", customerName: "พลากร เพ็ญสุขเหลือ", salesLogin: "admin_bam", csLogin: "admin_ploy", pieces: 1, weightKg: 0.1, sampleTracks: [] },
    ],
  },
  shop: {
    awaitingPayment: [
      { hno: "P22778", customerCode: "PR004", customerName: "NANTAPONG", salesLogin: "admin_but", csLogin: "admin_ploy", responsible: "admin_manow", amountThb: 43512, title: "", since: null },
    ],
    awaitingShopShip: [],
    yuanCost: [
      { hno: "P22753", customerCode: "PR833", customerName: "วุฒิชัย", salesLogin: "admin_may", csLogin: "admin_ploy", responsible: "admin_manow", amountThb: 18919.06, title: "", since: null },
    ],
  },
  accounting: {
    slipReview: [],
    whtReview: [{ service: "ใบหัก ณ ที่จ่าย", ref: "FRC2610-00083", label: "หจก. เดอร์มาเด็กซ์", amountThb: 24.67, since: null }],
    containersComplete: [{ service: "ตู้ยิงรับครบแล้ว", ref: "GZE261016-1", label: "249/238 กล่อง", amountThb: null, since: null }],
  },
  errors: [],
};

console.log("\n👤 แจกถูกคน");

ok("🔒 เซลเห็นเฉพาะลูกค้าของตัวเอง", () => {
  const plans = planNotifications(FEED, [BAM, MAY], allNew);
  const bam = plans.filter((p) => p.lineUserId === "U_BAM").map((p) => p.text).join("\n");
  const may = plans.filter((p) => p.lineUserId === "U_MAY").map((p) => p.text).join("\n");
  assert.ok(may.includes("PR622"), "เมย์ต้องเห็น PR622 (ลูกค้าตัวเอง)");
  assert.ok(!may.includes("PR625"), "🔴 เมย์ต้องไม่เห็น PR625 (ลูกค้าของแบม)\n" + may);
  assert.ok(bam.includes("PR625"), "แบมต้องเห็น PR625");
  assert.ok(!bam.includes("PR622"), "🔴 แบมต้องไม่เห็น PR622 (ลูกค้าของเมย์)\n" + bam);
});

ok("🔒 CS เห็นลูกค้าที่ตัวเองดูแล (คนละแกนกับเซล)", () => {
  const plans = planNotifications(FEED, [PLOY], allNew);
  const t = plans.map((p) => p.text).join("\n");
  // พลอยเป็น CS ของทั้ง PR622 และ PR625 ⇒ เห็นทั้งคู่ ทั้งที่ไม่ได้เป็นเซลของใครเลย
  assert.ok(t.includes("PR622") && t.includes("PR625"), "CS ต้องเห็นลูกค้าที่ตัวเองดูแลทุกราย\n" + t);
});

ok("🔒 คนที่ไม่ได้ดูแลลูกค้ารายนั้น ต้องไม่ได้หมวดที่แบ่งตามลูกค้าเลย", () => {
  /* ⚠️ ติ๊กเฉพาะหมวด scope="customer" — หมวดบัญชีเป็น scope="all" ซึ่ง **ตั้งใจ**
        ให้เห็นทุกใบ (งานบัญชีไม่ได้แบ่งตามลูกค้า) ⇒ เอามารวมในยามนี้จะแดงผิดเรื่อง */
  const customerKeys = NOTIFY_CATEGORIES.filter((c) => c.scope === "customer").map((c) => c.key);
  const stranger = { line_user_id: "U_X", login: "admin_stranger", name: "คนนอก", active: true, notify: customerKeys };
  const plans = planNotifications(FEED, [stranger], allNew);
  assert.equal(plans.length, 0, "ไม่ได้ดูแลใครเลย = ต้องไม่มีข้อความ · ได้:\n" + plans.map((p) => p.text).join("\n"));
});

ok("🚪 คนที่ลาออก/ถูกล็อก ต้องไม่ได้รับอะไรเลย", () => {
  const plans = planNotifications(FEED, [OUT], allNew);
  assert.equal(plans.length, 0, "ลาออกแล้วต้องไม่ส่ง · ได้ " + plans.length + " ข้อความ");
});

ok("☑️ ไม่ติ๊กหมวด = ไม่ได้หมวดนั้น", () => {
  const onlyWht = { ...PLOY, notify: ["acc_wht"] };
  const plans = planNotifications(FEED, [onlyWht], allNew);
  const t = plans.map((p) => p.text).join("\n");
  assert.ok(t.includes("FRC2610-00083"), "ต้องได้หมวดที่ติ๊ก");
  assert.ok(!t.includes("PR622"), "🔴 ได้หมวดที่ไม่ได้ติ๊ก\n" + t);
  assert.ok(!t.includes("GZE261016-1"), "🔴 ได้หมวดที่ไม่ได้ติ๊ก");
});

console.log("\n🔕 เงียบเมื่อไม่มีของใหม่");

ok("✅ ไม่มีของใหม่ = ไม่ส่งอะไรเลย (ภูมสั่ง)", () => {
  assert.deepEqual(planNotifications(FEED, [BAM, MAY, PLOY], noneNew), [], "เคยบอกไปแล้วต้องเงียบ");
});

ok("✅ feed ว่าง = ไม่ส่งอะไรเลย", () => {
  const empty = {
    windowMinutes: 15,
    arrivals: { cnWarehouse: [], thArrived: [] },
    shop: { awaitingPayment: [], awaitingShopShip: [], yuanCost: [] },
    accounting: { slipReview: [], whtReview: [], containersComplete: [] },
    errors: [],
  };
  assert.deepEqual(planNotifications(empty, [BAM, PLOY], allNew), []);
  assert.deepEqual(planNotifications(null, [BAM], allNew), [], "feed หาย = ต้องไม่ล้ม");
});

console.log("\n📦 รวมเป็นรอบ ไม่ใช่รายชิ้น");

ok("📦 ลูกค้าหลายรายของคนเดียว = ข้อความเดียว", () => {
  /* 📏 prod 21/10: เด้งต่อชิ้น = เมย์ 80 ข้อความ/วัน ⇒ ปิดแจ้งเตือนแน่นอน
        รวมเป็นรอบ = 1 ข้อความต่อหมวดต่อรอบ */
  const many = JSON.parse(JSON.stringify(FEED));
  many.arrivals.thArrived = Array.from({ length: 12 }, (_, i) => ({
    customerCode: "PR" + (900 + i), customerName: "ลูกค้า " + i,
    salesLogin: "admin_may", csLogin: "", pieces: 3, weightKg: 10, sampleTracks: [],
  }));
  const plans = planNotifications(many, [{ ...MAY, notify: ["arrive_th"] }], allNew);
  assert.equal(plans.length, 1, "12 ลูกค้าต้องรวมเป็น 1 ข้อความ · ได้ " + plans.length);
  assert.ok(plans[0].text.includes("36 ชิ้น · 12 ลูกค้า"), "หัวข้อต้องสรุปยอดรวม\n" + plans[0].text);
  assert.equal(plans[0].keys.length, 12, "ต้องจดว่าบอกไปแล้วทั้ง 12 ราย (กันซ้ำรอบหน้า)");
});

ok("📦 รายการยาวเกิน ต้องตัดแล้วบอกว่าเหลืออีกเท่าไร", () => {
  /* ไลน์ตัดข้อความที่ 5,000 ตัว ⇒ ลิสต์ยาวเกินแล้วหายท้าย = คนไม่รู้ว่าขาด */
  const many = JSON.parse(JSON.stringify(FEED));
  many.arrivals.thArrived = Array.from({ length: 30 }, (_, i) => ({
    customerCode: "PR" + (900 + i), customerName: "ลูกค้า " + i,
    salesLogin: "admin_may", csLogin: "", pieces: 1, weightKg: 1, sampleTracks: [],
  }));
  const plans = planNotifications(many, [{ ...MAY, notify: ["arrive_th"] }], allNew);
  assert.match(plans[0].text, /อีก 10 รายการ/, "ต้องบอกจำนวนที่ตัดไป\n" + plans[0].text);
  /* 🔑 ตัวนับในหัวข้อต้องตรงกับจำนวนบรรทัดที่โชว์จริง —
        ไม่งั้นหัวบอก 30 แต่ลิสต์มี 20 แล้วคนนับไม่ตรงกับที่เห็น */
  assert.ok(plans[0].text.includes("20 ลูกค้า"), "หัวข้อต้องนับเฉพาะที่โชว์จริง\n" + plans[0].text);
});

console.log("\n🧾 งานบัญชี — ไม่แบ่งตามลูกค้า");

ok("🧾 บัญชีเห็นทุกใบ ไม่ว่าลูกค้าของใคร", () => {
  const acc = { line_user_id: "U_AOM", login: "admin_aom", name: "ออม", active: true, notify: ["acc_yuan", "acc_wht", "acc_cnt"] };
  const t = planNotifications(FEED, [acc], allNew).map((p) => p.text).join("\n");
  assert.ok(t.includes("P22753"), "ต้องเห็นใบโอนหยวน (ลูกค้าของเมย์) ทั้งที่ตัวเองไม่ใช่เซล\n" + t);
  assert.ok(t.includes("FRC2610-00083"), "ต้องเห็นใบหัก ณ ที่จ่าย");
  assert.ok(t.includes("GZE261016-1"), "ต้องเห็นตู้ที่ยิงครบ");
});

console.log("\n🗂 ทะเบียนหมวด");

ok("🗂 ทุกหมวดมีครบทุกช่อง + คีย์ไม่ซ้ำ", () => {
  const seen = new Set();
  for (const c of NOTIFY_CATEGORIES) {
    for (const k of ["key", "group", "label", "scope"]) {
      assert.ok(c[k], "หมวด " + JSON.stringify(c) + " ขาดช่อง " + k);
    }
    assert.ok(["customer", "all"].includes(c.scope), "scope ต้องเป็น customer หรือ all · ได้ " + c.scope);
    assert.ok(!seen.has(c.key), "คีย์ซ้ำ: " + c.key);
    seen.add(c.key);
  }
});

ok("🗂 หมวดในทะเบียนบอท ต้องตรงกับหมวดที่ตัวแจกรู้จัก", () => {
  /* 🔴 ถ้า 2 ที่ไม่ตรงกัน จะเกิดสวิตช์ที่ติ๊กได้แต่ไม่มีอะไรส่ง (หรือกลับกัน) */
  const { CATEGORIES } = require("./staff");
  const inRegistry = new Set(CATEGORIES.map((c) => c.key));
  for (const k of NOTIFY_KEYS) {
    assert.ok(inRegistry.has(k), `หมวด "${k}" มีตัวแจกแต่ไม่มีให้ติ๊กในทะเบียน`);
  }
});

console.log("\nรวม: " + pass + " ผ่าน" + (fail ? " · " + fail + " ตก" : ""));
process.exit(fail ? 1 : 0);
