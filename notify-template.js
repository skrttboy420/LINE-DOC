// ============================================================
// ✏️ ข้อความแจ้งเตือนที่แก้ไขได้ — ภูม 2026-10-21
//
// ภูม: *"เราสามารถทำให้มีตัวปรับแต่งข้อความแจ้งเตือนด้วยได้ไหม …
//        โดยที่ข้อความที่แก้ไขจะไม่กระทบกับตัวระบบแจ้งเตือนของบอทนะ
//        หรือถ้ามันเสี่ยงเกินไปในการแก้ไขข้อความก็บอกภูมิได้เลยนะ"*
//
// ── ✅ ทำไมแก้ได้โดยไม่เสี่ยง — 4 กติกา ────────────────────────────────
//   ① **ข้อความในโค้ดเป็นตัวสำรองเสมอ** — อ่านของที่แก้ไว้ไม่ได้/ฐานล่ม = ใช้ของเดิม
//      (ไม่เงียบ ไม่ล่ม · ตัวแจ้งเตือนไม่เคยพึ่งฐานเพื่อจะส่งได้)
//   ② **ช่องเสียบข้อมูลที่บังคับ ลบไม่ได้** — เช่น {รหัสลูกค้า} · {เลขออเดอร์}
//      ลบแล้วแจ้งเตือนจะไม่บอกว่าเป็นงานของใคร ⇒ เซฟไม่ผ่าน + บอกว่าขาดตัวไหน
//   ③ **จำกัดความยาว** — ไลน์ตัดที่ 5,000 ตัว · เกินแล้วหายท้ายแบบเงียบๆ
//   ④ **ดูตัวอย่างก่อนเซฟ + คืนค่าเดิมได้ตลอด**
//
// 🔒 ข้อความพวกนี้ส่งหา **พนักงานเท่านั้น** ไม่ได้ส่งหาลูกค้า
//    ⇒ พิมพ์ผิดแย่สุดคือพนักงานอ่านงง ไม่ใช่เงินผิด/ลูกค้าเห็นของผิด
//
// 🚫 PURE — ไม่ต่อฐาน/ไลน์ (ตัวอ่าน-เขียนฐานอยู่ที่ notify-template-store.js)
// ============================================================

/**
 * ชนิดของแถว — ตัดสินว่าหมวดนั้นมีช่องเสียบอะไรให้ใช้
 *   arrival = ของถึงโกดัง/ถึงไทย (รวมเป็นรายลูกค้า)
 *   order   = ใบฝากสั่งซื้อ
 *   item    = งานบัญชีทั่วไป (สลิป · ใบหัก · ตู้)
 */
const KIND_OF = {
  arrive_cn: "arrival",
  arrive_th: "arrival",
  shop_pay: "order",
  shop_ship: "order",
  acc_yuan: "order",
  acc_slip: "item",
  acc_wht: "item",
  acc_cnt: "item",
  hs_pending: "item",
  track_stuck: "item",
};

/**
 * ช่องเสียบข้อมูลของแต่ละชนิด
 *   `required` = ลบไม่ได้ (ลบแล้วข้อความไม่บอกว่าเป็นงานไหน)
 */
const FIELDS = {
  arrival: {
    head: { all: ["{จำนวน}", "{ลูกค้า}"], required: [] },
    line: { all: ["{รหัสลูกค้า}", "{ชื่อลูกค้า}", "{ชิ้น}", "{น้ำหนัก}"], required: ["{รหัสลูกค้า}"] },
  },
  order: {
    head: { all: ["{จำนวน}"], required: [] },
    line: { all: ["{เลขออเดอร์}", "{รหัสลูกค้า}", "{ชื่อลูกค้า}", "{ยอดเงิน}"], required: ["{เลขออเดอร์}"] },
  },
  item: {
    head: { all: ["{จำนวน}"], required: [] },
    line: { all: ["{บริการ}", "{เลขอ้างอิง}", "{รายละเอียด}"], required: ["{เลขอ้างอิง}"] },
  },
};

/** ข้อความตั้งต้น — **ตัวสำรองที่ใช้เสมอเมื่ออ่านของที่แก้ไว้ไม่ได้** */
const DEFAULTS = {
  arrive_cn: { head: "📦 ถึงโกดังจีนแล้ว — {จำนวน} ชิ้น · {ลูกค้า} ลูกค้า", line: "• {รหัสลูกค้า} {ชื่อลูกค้า} — {ชิ้น} ชิ้น ({น้ำหนัก} กก.)" },
  arrive_th: { head: "🇹🇭 ถึงไทยแล้ว — {จำนวน} ชิ้น · {ลูกค้า} ลูกค้า",      line: "• {รหัสลูกค้า} {ชื่อลูกค้า} — {ชิ้น} ชิ้น ({น้ำหนัก} กก.)" },
  shop_pay:  { head: "💳 รอชำระเงิน — {จำนวน} ใบ",                          line: "• {เลขออเดอร์} {รหัสลูกค้า} {ชื่อลูกค้า} — {ยอดเงิน}" },
  shop_ship: { head: "🚚 รอร้านจีนจัดส่ง — {จำนวน} ใบ",                      line: "• {เลขออเดอร์} {รหัสลูกค้า} {ชื่อลูกค้า} — {ยอดเงิน}" },
  acc_yuan:  { head: "💴 ฝากสั่ง · โอนหยวน/สลิปจีน — {จำนวน} ใบ",            line: "• {เลขออเดอร์} {รหัสลูกค้า} {ชื่อลูกค้า} — {ยอดเงิน}" },
  acc_slip:  { head: "🧾 รอตรวจสลิป — {จำนวน} รายการ",                       line: "• [{บริการ}] {เลขอ้างอิง} — {รายละเอียด}" },
  acc_wht:   { head: "📄 รอตรวจใบหัก ณ ที่จ่าย — {จำนวน} รายการ",            line: "• [{บริการ}] {เลขอ้างอิง} — {รายละเอียด}" },
  acc_cnt:   { head: "📦 ตู้ยิงรับครบแล้ว — {จำนวน} รายการ",                 line: "• [{บริการ}] {เลขอ้างอิง} — {รายละเอียด}" },
  hs_pending:  { head: "📋 ออเดอร์รอตอบพิกัด — {จำนวน} ใบ",                  line: "• {เลขอ้างอิง} — {รายละเอียด}" },
  track_stuck: { head: "📦 แทรครออัพเข้าระบบ — {จำนวน} แทรค",                line: "• {เลขอ้างอิง} — {รายละเอียด}" },
};

/** เพดานความยาว — ไลน์ตัดข้อความที่ 5,000 ตัว */
const MAX_HEAD = 300;
const MAX_LINE = 300;

const money = (v) =>
  "฿" + Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** เติมค่าลงช่องเสียบ — ช่องที่ไม่รู้จักปล่อยไว้เหมือนเดิม (คนจะได้เห็นว่าพิมพ์ผิด) */
function fill(tpl, vars) {
  return String(tpl || "").replace(/\{[^{}]+\}/g, (m) => (m in vars ? String(vars[m]) : m));
}

/** ค่าที่ใช้เติมหัวข้อ */
function headVars(kind, rows) {
  if (kind === "arrival") {
    return {
      "{จำนวน}": rows.reduce((a, r) => a + Number(r.pieces || 0), 0),
      "{ลูกค้า}": rows.length,
    };
  }
  return { "{จำนวน}": rows.length };
}

/** ค่าที่ใช้เติมบรรทัดรายการ */
function lineVars(kind, r) {
  if (kind === "arrival") {
    return {
      "{รหัสลูกค้า}": r.customerCode || "-",
      "{ชื่อลูกค้า}": r.customerName || "-",
      "{ชิ้น}": r.pieces || 0,
      "{น้ำหนัก}": r.weightKg || 0,
    };
  }
  if (kind === "order") {
    return {
      "{เลขออเดอร์}": r.hno || "-",
      "{รหัสลูกค้า}": r.customerCode || "-",
      "{ชื่อลูกค้า}": r.customerName || "-",
      "{ยอดเงิน}": money(r.amountThb),
    };
  }
  return {
    "{บริการ}": r.service || "-",
    "{เลขอ้างอิง}": r.ref || "-",
    "{รายละเอียด}": r.label || "-",
  };
}

/**
 * ข้อความของหมวดหนึ่ง — ใช้ของที่แก้ไว้ถ้ามี · ไม่มี/พังเมื่อไหร่ใช้ตัวสำรอง
 * @param {string} key                  คีย์หมวด
 * @param {object|null} custom          { head, line } ที่ภูมแก้ไว้ (null = ใช้ของเดิม)
 */
function templateOf(key, custom) {
  const base = DEFAULTS[key];
  if (!base) return null;
  const head = custom && typeof custom.head === "string" && custom.head.trim() ? custom.head : base.head;
  const line = custom && typeof custom.line === "string" && custom.line.trim() ? custom.line : base.line;
  return { head, line };
}

/**
 * ประกอบข้อความจริง
 * @param {string} key   คีย์หมวด
 * @param {Array}  rows  แถวที่จะบอก (กรอง + ตัดจำนวนมาแล้ว)
 * @param {object|null} custom
 * @param {number} hidden  จำนวนที่ตัดทิ้งไป (บอกท้ายข้อความ)
 */
function renderNotification(key, rows, custom, hidden) {
  const kind = KIND_OF[key];
  const tpl = templateOf(key, custom);
  if (!kind || !tpl || rows.length === 0) return "";
  const out = [fill(tpl.head, headVars(kind, rows)), "━━━━━━━━━━━━"];
  for (const r of rows) out.push(fill(tpl.line, lineVars(kind, r)));
  if (hidden > 0) out.push(`… อีก ${hidden} รายการ`);
  return out.join("\n");
}

/**
 * ตรวจข้อความที่ภูมพิมพ์มา ก่อนเซฟ
 * @returns {{ok:true}|{ok:false,message:string}}
 */
function validateTemplate(key, head, line) {
  const kind = KIND_OF[key];
  if (!kind) return { ok: false, message: "ไม่รู้จักหมวดนี้" };
  const f = FIELDS[kind];

  const h = String(head ?? "").trim();
  const l = String(line ?? "").trim();
  if (!h) return { ok: false, message: "หัวข้อว่างไม่ได้" };
  if (!l) return { ok: false, message: "บรรทัดรายการว่างไม่ได้" };
  if (h.length > MAX_HEAD) return { ok: false, message: `หัวข้อยาวเกิน ${MAX_HEAD} ตัวอักษร` };
  if (l.length > MAX_LINE) return { ok: false, message: `บรรทัดรายการยาวเกิน ${MAX_LINE} ตัวอักษร` };

  // 🔑 ช่องบังคับ — ลบแล้วแจ้งเตือนจะไม่บอกว่าเป็นงานไหน
  for (const need of f.line.required) {
    if (!l.includes(need)) return { ok: false, message: `บรรทัดรายการต้องมี ${need} ไม่งั้นจะไม่รู้ว่าเป็นงานไหน` };
  }
  for (const need of f.head.required) {
    if (!h.includes(need)) return { ok: false, message: `หัวข้อต้องมี ${need}` };
  }

  // ช่องที่พิมพ์มาแต่ไม่มีจริง — บอกชื่อที่ใช้ได้ (ไม่งั้นจะเห็น {xxx} โผล่ในข้อความจริง)
  const known = new Set([...f.head.all, ...f.line.all, ...f.head.required, ...f.line.required]);
  for (const [where, text, allowed] of [["หัวข้อ", h, f.head], ["บรรทัดรายการ", l, f.line]]) {
    for (const m of text.match(/\{[^{}]*\}/g) || []) {
      if (!known.has(m)) {
        return { ok: false, message: `${where}: ไม่รู้จัก ${m} — ใช้ได้: ${allowed.all.join(" ")}` };
      }
    }
  }
  return { ok: true };
}

/** ตัวอย่างข้อมูลไว้ "ดูตัวอย่าง" บนหน้าจัดการ */
function sampleRows(key) {
  const kind = KIND_OF[key];
  if (kind === "arrival") {
    return [
      { customerCode: "PR622", customerName: "Woot Usanachitt", pieces: 27, weightKg: 434.52 },
      { customerCode: "PR625", customerName: "พลากร เพ็ญสุขเหลือ", pieces: 1, weightKg: 0.1 },
    ];
  }
  if (kind === "order") {
    return [
      { hno: "P22778", customerCode: "PR004", customerName: "NANTAPONG SRITASAEN", amountThb: 43512 },
      { hno: "P22772", customerCode: "PR895", customerName: "กิตติภูมิ เรืองวานิช", amountThb: 1307.88 },
    ];
  }
  return [
    { service: "ใบหัก ณ ที่จ่าย", ref: "FRC2610-00083", label: "หจก. เดอร์มาเด็กซ์ (ประเทศไทย)" },
    { service: "ตู้ยิงรับครบแล้ว", ref: "GZE261016-1", label: "249/238 กล่อง · 103 แทรค" },
  ];
}

module.exports = {
  KIND_OF, FIELDS, DEFAULTS, MAX_HEAD, MAX_LINE,
  templateOf, renderNotification, validateTemplate, sampleRows,
};
