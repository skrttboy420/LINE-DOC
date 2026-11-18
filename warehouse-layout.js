// ============================================================
// 🏭 ผังโกดัง 3D — ตัวตัดสินเดียวเรื่อง "โลเคชั่น" (ภูม 2026-11-12)
//
// ภูม: *"ระบบ จำลองโกดังสินค้า 3D (Digital Twin) ตามผังและพารามิเตอร์จริง"*
//      *"ตอนนี้ในระบบเรามันเป็นแค่ A1 , B1 ไรงี้ แต่อย่าพึ่งไปเปลี่ยนระบบ pacred นะ
//        ให้ทำโลเคชั่นใหม่เตรียมไว้ก่อน"*
//
// 🔒 ไฟล์นี้ไม่แตะฐาน ไม่แตะเน็ต ไม่แตะระบบ Pacred — คณิตศาสตร์ล้วน
//    ⇒ เทสได้เต็ม (node warehouse-layout.test.js) · เอาไปใช้ซ้ำได้ทุกที่
//
// 🔑 ทำไมต้องมีตัวตัดสินเดียว: รหัสโลเคชั่นถูกใช้ 4 ที่ (หน้า 3D · หน้าคีย์ตำแหน่ง ·
//    ฐานข้อมูล · ช่องค้นหา) ถ้าแต่ละที่แกะรหัสเอง จะมีวันที่ "A0101" ของหน้าหนึ่ง
//    ไม่ใช่ช่องเดียวกับ "A0101" ของอีกหน้า แล้วพนักงานเดินไปผิดช่อง
// ============================================================

/* ── ① พารามิเตอร์จริงจากไฟล์ของภูม (หน่วย = เซนติเมตร) ───────────────── */

/** ขนาด 1 ช่องชั้น (Cell Unit) — กว้าง 250 · ลึก 120 · สูง 165 */
const CELL = Object.freeze({ w: 250, d: 120, h: 165 });

/** คานส้มหนา 10 · เสาสีฟ้ากว้าง 7 · ทางเดินระหว่างแถว 300 (3 เมตร) */
const STRUCT = Object.freeze({ beam: 10, post: 7, aisle: 300 });

/** จำนวนชั้นต่อ 1 ล็อก */
const LEVELS = 4;

/* 🔴 ภูม 2026-11-14: *"คอนเฟิร์มแล้วว่าไม่ใช้ L กับ R ไม่ต้องแยกซ้ายขวาอะ รวมเป็นล็อกนึงไปเลย
      A0101 = โซน A ชั้น 1 ล็อก 1"*
   ⇒ **1 ล็อก 1 ชั้น = 1 ช่องวาง** · รหัสช่อง = รหัสโลเคชั่น ไม่มีหางต่อท้าย
   🏷 ป้ายที่พิมพ์ไปก่อน 14/11 มีหาง "-L"/"-R" และ **ยังแปะอยู่บนชั้นจริง**
      ⇒ ตัวแกะรหัสต้องอ่านป้ายเก่าออก แล้วคืนช่องเดียวกับป้ายใหม่ (LEGACY_SIDE ข้างล่าง)
         ไม่งั้นพนักงานยิงป้ายที่ติดอยู่ ระบบตอบ "ไม่มีช่องนี้" = งานหยุดกลางโกดัง */
const LEGACY_SIDE = /^([A-Z]\d{4})[LR]$/;

/**
 * 3 แถว/โซนหลัก ตามผังจริง
 *   A = โซนซ้าย  6 ล็อก (ช่วงท้ายติดออฟฟิศโกดัง ⇒ สั้นกว่าเพื่อน)
 *   B = โซนกลาง  10 ล็อก (ยาวเต็มพื้นที่)
 *   C = โซนริมขวา 10 ล็อก (ยาวเต็มพื้นที่)
 *
 * 🔧 ถ้าของจริงต่างจากนี้ (เพิ่มล็อก · เพิ่มแถว) แก้ที่นี่ **ที่เดียว**
 *    ทั้งหน้า 3D · ช่องค้นหา · ตัวตรวจรหัส เดินตามเอง
 */
/* 🧭 ยืนที่ประตูหน้าโกดังมองเข้าไป: A ขวามือ · B กลาง · C ซ้ายมือ
   ✅ ภูมยืนยัน 12/11: **แถวที่สั้น 6 ล็อก คือ C** (ไม่ใช่ A) — *"ล็อก A ที่ 6 ล็อกต้องเป็น C"*
   🪤 รอบก่อนผมแก้ผิดวิธี: ไป "ย้ายตำแหน่งแถว A" แทนที่จะ "สลับว่าแถวไหนมี 6 ล็อก"
      ⇒ ชั้นวางย้ายข้ามโกดังทั้งแถว ทั้งที่ของจริงไม่ได้ย้ายไปไหน */
/* 🧭 "หน้าชั้น" (face) = ด้านที่คนยืนในทางเดินแล้วมองเข้าหาชั้นวาง (ภูม 2026-11-13)
 *
 * 🔑 หัวใจ: **ชั้นวางหันหน้าออกทางเดินฝั่งไหน** ⇒ กล้องต้องไปยืนทางเดินฝั่งนั้น
 *    (เลิกใช้ซ้าย/ขวาในรหัสช่องแล้ว 14/11 แต่ "ยืนฝั่งไหน" ยังเป็นตัวตั้งกล้อง)
 *
 * from: "+X" = ทางเดินอยู่ฝั่ง X มาก (ยืนที่ X มาก มองย้อนเข้าหาชั้น)
 *       "-X" = ทางเดินอยู่ฝั่ง X น้อย
 * first/count = ล็อกที่อยู่บนหน้านี้ (เรียงตาม Z จากประตูเข้าไป)
 */
const ROWS = Object.freeze([
  Object.freeze({
    key: "A", name: "โซนขวา", bays: 10, band: 0, depth: 0,
    note: "ตั้งยาวเต็มพื้นที่ · ชิดกำแพง",
    faces: Object.freeze([
      Object.freeze({ key: "A", name: "แถว A", from: "+X", first: 1, count: 10 }),
    ]),
  }),
  /* 🆕 ชั้นวางเหล็กตัวใหม่ 2026-11-18 — ภูม: *"เพิ่มชั้นวางเหล็กตัวใหม่มา 3 ล็อก ล็อกละ 4 ชั้น"*
     อยู่ **ฝั่งประตู** ของแถบกลาง ตรงกับล็อก A 1-2-3 พอดี · ห่างกำแพงออฟฟิศ ~20 ซม.
     🔧 depth 1 = วางชิดฝั่งออฟฟิศ · ถ้าของจริงอยู่อีกฝั่งของแถบ เปลี่ยนเป็น depth: 0 บรรทัดเดียวจบ */
  Object.freeze({
    key: "B", name: "โซนหน้าออฟฟิศ", bays: 3, band: 1, depth: 1,
    note: "ชั้นวางใหม่ 3 ล็อก · ฝั่งประตู ตรงกับล็อก A 1-2-3 · ห่างกำแพงออฟฟิศ ~20 ซม.",
    faces: Object.freeze([
      Object.freeze({ key: "B", name: "แถว B", from: "-X", first: 1, count: 3 }),
    ]),
  }),
  /* 🔄 แถบกลาง (2026-11-18) — ชั้นคู่หันหลังชนกันเดิมชื่อ "B" **แยกเป็น C กับ D** แล้ว
     ภูม: *"ที่เป็นแถว B เก่าที่เป็นแถวคู่ ให้เปลี่ยนเป็น C / D"* + ยืนยัน 18/11:
       C หันออกทางเดินฝั่งแถว A · D หันออกทางเดินฝั่งแถว E
     ⇒ 2 โซนนี้คือชั้นวางตัวเดียวกันที่หลังชนกัน ⇒ **อยู่แถบเดียวกัน** (band 1) ต่างกันที่ depth
       ถ้าแยกเป็นคนละ band จอจะวาดทางเดินเกินที่ของจริงไม่มี */
  Object.freeze({
    key: "C", name: "โซนกลาง ฝั่ง A", bays: 5, band: 1, depth: 0, alignBack: true,
    note: "ชั้นคู่หันหลังชนกัน · หันออกทางเดินฝั่งแถว A · ชิดผนังหลัง",
    faces: Object.freeze([
      Object.freeze({ key: "C", name: "แถว C", short: "ฝั่ง A", from: "+X", first: 1, count: 5 }),
    ]),
  }),
  Object.freeze({
    key: "D", name: "โซนกลาง ฝั่ง E", bays: 5, band: 1, depth: 1, alignBack: true,
    note: "ชั้นคู่หันหลังชนกัน · หันออกทางเดินฝั่งแถว E · ชิดผนังหลัง",
    faces: Object.freeze([
      Object.freeze({ key: "D", name: "แถว D", short: "ฝั่ง E", from: "-X", first: 1, count: 5 }),
    ]),
  }),
  /* 🔄 แถวติดออฟฟิศเดิมชื่อ "C" → **E** (ตัวชั้นวางไม่ได้ย้ายไปไหน แค่เปลี่ยนชื่อ) */
  Object.freeze({
    key: "E", name: "โซนซ้าย", bays: 6, band: 2, depth: 0, alignBack: true,
    note: "ชั้นวางตั้งชิดด้านหลังโกดัง · ชิดกำแพง · ช่วงติดประตูเว้นไว้ (ออฟฟิศ)",
    faces: Object.freeze([
      Object.freeze({ key: "E", name: "แถว E", from: "-X", first: 1, count: 6 }),
    ]),
  }),
]);

/** แถบทางเดิน — แถวที่อยู่แถบเดียวกันใช้ทางเดินคู่เดียวกัน (ไม่มีทางเดินคั่นระหว่างกัน) */
function bandsOfRows() {
  const byBand = new Map();
  for (const r of ROWS) {
    const b = r.band == null ? -1 : r.band;
    if (!byBand.has(b)) byBand.set(b, []);
    byBand.get(b).push(r);
  }
  return [...byBand.keys()].sort((a, b) => a - b).map((b) => byBand.get(b));
}

/** แถบนี้ลึกกี่ช่วง (ชั้นคู่หลังชนกัน = 2) */
function bandDepth(band) {
  return Math.max.apply(null, band.map((r) => (r.depth || 0) + 1));
}

/* 🧭 ทิศทาง — ยืนที่ "หน้าโกดัง" แล้วมองเข้าไปข้างใน
   ภูม 2026-11-12: *"ล็อกที่ 10 ควรเป็นล็อกที่ 1 นะ เพราะหน้าโกดังอยู่ฝั่งนี้
                     ไม่ใช่อีกฝั่งที่แกใส่มา"* + *"แถว C ควรเป็นแถว A"*
   ⇒ ล็อก 1 = ล็อกที่อยู่ติดประตูหน้าโกดัง · นับลึกเข้าไปเรื่อยๆ
   ⇒ แถว A = แถวซ้ายมือเมื่อยืนหันหน้าเข้าโกดัง
   🔧 ถ้าของจริงกลับด้าน สลับ 2 ค่านี้ได้เลย — ทั้งผัง · หน้า 3D · ป้าย เดินตามเอง */
const DOOR = Object.freeze({
  /** true = ล็อก 1 อยู่ปลายไกลของแกน Z · false = อยู่ต้นแกน (Z = 0) */
  bayOneAtFarZ: false,
  /** true = แถว A อยู่ปลายไกลของแกน X · false = อยู่ต้นแกน (X = 0) */
  rowAatFarX: false,
});
/* ✅ ยืนยันกับภูมแล้ว 12/11 (ชี้จากผังมองจากบน): ประตู = ขอบซ้ายของผัง (ล็อก 1) · แถว A = แถวล่าง
   🪤 รอบแรกผมพลิกทั้ง 2 ค่าเป็น true เพราะอ่านจอผิด — จอ 3D ตั้งกล้องไว้ "หลังโกดัง"
      ⇒ เห็นล็อก 10 อยู่ใกล้ตัว เลยนึกว่าเลขกลับด้าน ทั้งที่ผังถูกอยู่แล้ว
      ของจริงที่ต้องแก้คือ "มุมกล้องตั้งต้น" ไม่ใช่ผัง */

/* ── 🏭 ทะเบียนโกดัง (ภูม 2026-11-13: *"ตอนนี้เรามีมากกว่า 1 โกดังแล้ว"*) ─────
 *
 * 🔑 ภูมเคาะ: **รหัสช่องเหมือนกันทั้ง 2 โกดัง** (A0101 มีทั้งคู่) แล้วแยกด้วยรหัสโกดัง
 *    ⇒ ป้ายสติกเกอร์ชุดเดิมเอาไปติดโกดัง 2 ได้เลย ไม่ต้องพิมพ์ชุดใหม่
 *    ⚠️ แลกกับ: หน้ายิง/หน้าคีย์ตำแหน่ง **ต้องรู้ว่าตอนนี้อยู่โกดังไหน**
 *       ไม่งั้นของลงผิดโกดังแล้วหาไม่เจอ ⇒ ทุกหน้าจำโกดังที่เลือกไว้ + โชว์ตัวใหญ่ๆ
 *
 * 🔧 วันที่โกดัง 2 ผังไม่เหมือนโกดัง 1 แล้ว: ใส่ `rows` ของตัวเองในแถวนั้น
 *    (ตอนนี้ภูมยืนยัน 13/11 ว่า **เหมือนกันเป๊ะ** ⇒ ใช้ ROWS ชุดเดียว)
 */
const WAREHOUSES = Object.freeze([
  Object.freeze({ id: "WH1", name: "โกดัง 1", short: "1" }),
  Object.freeze({ id: "WH2", name: "โกดัง 2", short: "2" }),
]);
/** โกดังตั้งต้น — แถวเก่าในฐานที่ยังไม่มีช่องโกดัง ถือว่าอยู่ที่นี่ */
const DEFAULT_WH = WAREHOUSES[0].id;

/** รหัสโกดังที่รู้จักไหม (ไม่เดา — ใช้ก่อนเขียนฐานเสมอ) */
function isWh(x) {
  const s = String(x == null ? "" : x).trim().toUpperCase();
  return WAREHOUSES.some((w) => w.id === s);
}

/** อ่านรหัสโกดังแบบใจดี — ว่าง/ไม่รู้จัก = โกดังตั้งต้น (ใช้กับ "อ่าน/โชว์" เท่านั้น) */
function normWh(x) {
  const s = String(x == null ? "" : x).trim().toUpperCase();
  if (!s) return DEFAULT_WH;
  const hit = WAREHOUSES.find((w) => w.id === s || w.short === s);
  return hit ? hit.id : DEFAULT_WH;
}

/** ชื่อไทยของโกดัง เช่น "โกดัง 2" */
function whName(x) {
  const id = normWh(x);
  const hit = WAREHOUSES.find((w) => w.id === id);
  return hit ? hit.name : id;
}

/** ระยะห่างจากล็อกหนึ่งไปล็อกถัดไป = กว้างช่อง + เสา 1 ต้นที่แชร์กัน */
const BAY_PITCH = CELL.w + STRUCT.post;   // 257
/** ระยะห่างจากชั้นหนึ่งไปชั้นถัดไป = สูงช่อง + คาน */
const LEVEL_PITCH = CELL.h + STRUCT.beam; // 175

/* ── ② รหัสโลเคชั่น [แถว][ล็อก][ชั้น] เช่น A0501 = แถว A ล็อก 5 ชั้น 1 ──
   🔴 ภูม 2026-11-14: *"โลเคชั่นตอนนี้เราเป็น โซน + ชั้น + ล็อก ถูกไหม
      เปลี่ยนใหม่เป็น โซน + ล็อก + ชั้น ให้สลับเอาล็อกมาไว้ชั้นก่อนแทน"*
      (ก่อนหน้านี้ 12/11 เคยสั่งสลับเป็น ชั้นก่อนล็อก — รอบนี้ภูมแจ้งว่าบอกผิด)

   🪤 **รหัส 2 รูปนี้ทับกันได้ 48 จาก 104 ช่อง** — เช่น A0203
      รูปเก่า = ชั้น 2 ล็อก 3 · รูปใหม่ = ล็อก 2 ชั้น 3 ⇒ **คนละช่อง แต่สะกดเหมือนกัน**
      ⇒ ตัวอ่านแยกไม่ออก ไม่มีทางเดาถูก ⇒ **ต้องแปลงข้อมูลในฐาน + เปลี่ยนป้ายทั้งชุด**
         (ไม่ใช่ปล่อยให้ตัวอ่าน "ใจดี" เหมือนตอนเลิกใช้ -L/-R) */

const pad2 = (n) => String(n).padStart(2, "0");

/** ชั้นวางของแถวนั้นมีกี่ล็อก · ไม่มีแถวนี้ = 0 */
function baysOf(rowKey) {
  const r = ROWS.find((x) => x.key === String(rowKey || "").trim().toUpperCase());
  return r ? r.bays : 0;
}

/** แถวนี้ — คืนตัวแถวทั้งก้อน (หรือ null) */
function rowOf(rowKey) {
  return ROWS.find((x) => x.key === String(rowKey || "").trim().toUpperCase()) || null;
}

/** หน้าชั้นทั้งหมดของแถวนี้ (แถวธรรมดา 1 หน้า · แถว B ชั้นคู่ 2 หน้า) */
function facesOf(rowKey) {
  const r = rowOf(rowKey);
  return r ? r.faces.slice() : [];
}

/** หน้าชั้นที่ล็อกนี้อยู่ + ลำดับที่เท่าไหร่บนหน้านั้น (นับจาก 0) */
function faceOfBay(rowKey, bay) {
  const r = rowOf(rowKey);
  if (!r) return null;
  for (let i = 0; i < r.faces.length; i++) {
    const f = r.faces[i];
    if (bay >= f.first && bay < f.first + f.count) {
      return { face: f, index: i, idx: bay - f.first };
    }
  }
  return null;
}

/** หน้าชั้นจากรหัสหน้า เช่น "B2" */
function faceByKey(faceKey) {
  const k = String(faceKey || "").trim().toUpperCase();
  for (const r of ROWS)
    for (let i = 0; i < r.faces.length; i++)
      if (r.faces[i].key.toUpperCase() === k) return { row: r, face: r.faces[i], index: i };
  return null;
}

/** ชั้นวางของหน้านี้เริ่มที่ X เท่าไหร่ (หน้าที่ 2 ของชั้นคู่ = ถัดเข้าไปอีก 1 ความลึก) */
function faceOriginX(rowKey, faceKey) {
  const r = rowOf(rowKey);
  if (!r) throw new Error('ไม่มีแถว "' + rowKey + '"');
  const i = faceKey == null ? 0 : r.faces.findIndex((f) => f.key === String(faceKey).toUpperCase());
  if (i < 0) throw new Error('แถว ' + r.key + ' ไม่มีหน้าชั้น "' + faceKey + '"');
  return rowOriginX(r.key) + i * CELL.d;
}

/**
 * สร้างรหัสโลเคชั่น — locationCode("A", 5, 1) → "A0501" (ล็อก 05 ชั้น 01)
 * @throws ถ้าแถว/ล็อก/ชั้น อยู่นอกผังจริง (กันคีย์ช่องที่ไม่มีอยู่)
 */
function locationCode(rowKey, bay, level) {
  const row = String(rowKey || "").trim().toUpperCase();
  const bays = baysOf(row);
  if (!bays) throw new Error("ไม่มีแถว \"" + rowKey + "\" ในผังโกดัง (มีแค่ " + ROWS.map((r) => r.key).join(" · ") + ")");
  if (!Number.isInteger(bay) || bay < 1 || bay > bays)
    throw new Error("แถว " + row + " มี " + bays + " ล็อก — ล็อกที่ " + bay + " ไม่มีอยู่");
  if (!Number.isInteger(level) || level < 1 || level > LEVELS)
    throw new Error("มี " + LEVELS + " ชั้น — ชั้นที่ " + level + " ไม่มีอยู่");
  return row + pad2(bay) + pad2(level);          // 🔑 ล็อกก่อน แล้วค่อยชั้น (ภูม 14/11)
}

/**
 * แกะรหัสโลเคชั่น — parseLocation("a0501") → { row:"A", bay:5, level:1 }
 * คืน null เมื่อรหัสผิดรูปหรือชี้ช่องที่ไม่มีในผัง
 * (ห้าม throw — ช่องค้นหาเรียกตัวนี้ทุกตัวอักษรที่พิมพ์)
 */
function parseLocation(code) {
  let s = String(code || "").trim().toUpperCase().replace(/[\s-]/g, "");
  const old = LEGACY_SIDE.exec(s);
  if (old) s = old[1];                         // 🏷 ป้ายเก่า "A0101-L" → ช่อง A0101
  const m = /^([A-Z])(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const row = m[1], bay = Number(m[2]), level = Number(m[3]);
  if (bay < 1 || bay > baysOf(row)) return null;
  if (level < 1 || level > LEVELS) return null;
  return { row, bay, level, code: row + pad2(bay) + pad2(level) };
}

/**
 * รหัสช่องวาง = รหัสโลเคชั่น (เลิกแยกซ้าย/ขวาแล้ว) — slotCode("a0101") → "A0101"
 * 🏷 รับป้ายเก่า "A0101-L" ด้วย แล้วคืน "A0101"
 * 🔒 ใครยังส่งฝั่งมาเป็นอาร์กิวเมนต์ที่ 2 = โค้ดเก่าที่ลืมแก้ ⇒ ฟ้องดังๆ ไม่กลืนเงียบ
 */
function slotCode(location, legacySide) {
  if (legacySide != null && String(legacySide).trim() !== "")
    throw new Error("เลิกใช้ซ้าย/ขวาแล้ว (ภูม 14/11) — slotCode() รับรหัสช่องตัวเดียว");
  const loc = parseLocation(location);
  if (!loc) throw new Error("รหัสโลเคชั่น \"" + location + "\" ไม่ถูกต้อง");
  return loc.code;
}

/** แกะรหัสช่องวาง — รับทั้ง "A0101" และป้ายเก่า "A0101-L" · คืน null เมื่อผิดรูป */
function parseSlot(code) {
  const loc = parseLocation(code);
  if (!loc) return null;
  return { row: loc.row, bay: loc.bay, level: loc.level, code: loc.code, slot: loc.code };
}

/** ชื่อที่คนอ่านรู้เรื่อง — "A0501" → "โซนขวา ล็อก 5 ชั้น 1"
    🔑 เรียงคำตามรหัส (ล็อกก่อน ชั้นทีหลัง) ไม่งั้นคนอ่านรหัสกับอ่านคำแล้วได้คนละลำดับ */
function slotLabel(code) {
  const s = parseLocation(code);
  if (!s) return String(code || "");
  const row = ROWS.find((r) => r.key === s.row);
  return (row ? row.name : s.row) + " ล็อก " + s.bay + " ชั้น " + s.level;
}

/* ── ③ พิกัด XYZ — โครงสร้างข้อมูลสำหรับวาด 3D ──────────────────────── */
//
//  แกน:  X = ขวางโกดัง (ลึกของชั้นวาง · A → B → C)
//        Y = สูงขึ้นไป (ชั้น 1 อยู่ล่างสุด)
//        Z = ตามความยาวโกดัง (ล็อก 1 → ล็อกสุดท้าย)
//  จุด 0,0,0 = มุมพื้นของแถว A ล็อก 1
//
//  🔑 ทุกค่าที่คืนเป็น "เซนติเมตรของจริง" ไม่ใช่หน่วยจอ
//     ⇒ หน้า 3D ย่อเองทีเดียว · ถ้าวัดโกดังใหม่แล้วตัวเลขเปลี่ยน ไม่ต้องแก้หน้า

/** ความยาวพื้นที่ทั้งหมดตามแกน Z (แถวที่ยาวที่สุดกินเท่านี้) */
function fullZ() {
  /* ความยาวโกดัง = หน้าชั้นที่ยาวที่สุด (แถว B ชั้นคู่ยาวแค่ 5 ล็อก ไม่ใช่ 10) */
  let most = 0;
  for (const r of ROWS) for (const f of r.faces) most = Math.max(most, f.count);
  return most * BAY_PITCH;
}

/** ชั้นวางของแถวนี้เริ่มที่ X เท่าไหร่ (นับจากฝั่งซ้ายเมื่อยืนหันหน้าเข้าโกดัง) */
function rowOriginX(rowKey) {
  const key = String(rowKey || "").toUpperCase();
  if (!ROWS.some((r) => r.key === key)) throw new Error('ไม่มีแถว "' + key + '"');
  /* 🔑 2026-11-18 — คิดเป็น "แถบทางเดิน" ไม่ใช่ "ทีละแถว"
     ของจริงมีทางเดิน **2 เส้น** (3 แถบ) แต่มี 5 โซน ⇒ ถ้าบวกทางเดินทุกโซน
     จอจะวาดทางเดินเกินที่ไม่มีอยู่จริง และชั้นวางจะกระจายออกจากกัน
     ⇒ โซนที่อยู่แถบเดียวกัน (C/D หลังชนกัน · B ฝั่งประตู) เริ่มที่ต้นแถบเดียวกัน
       แล้วเลื่อนตาม depth ของตัวเอง */
  const bands = DOOR.rowAatFarX ? bandsOfRows().reverse() : bandsOfRows();
  let x = 0;
  for (const band of bands) {
    const hit = band.find((r) => r.key === key);
    if (hit) return x + (hit.depth || 0) * CELL.d;
    x += bandDepth(band) * CELL.d + STRUCT.aisle;
  }
  return x;
}

/** ชั้นวางแถวนี้ตั้งชิดด้านหลังโกดังไหม (แถวที่สั้นกว่าเพื่อน) */
function alignsBack(rowKey) {
  const r = ROWS.find((x) => x.key === String(rowKey || "").trim().toUpperCase());
  return !!(r && r.alignBack);
}

/**
 * ช่วง Z ที่ "หน้าชั้น" นั้นกินจริง (ไว้วาดเสา/คาน + ป้าย)
 * แถว B ชั้นคู่: ทั้ง 2 หน้ายาวเท่ากัน (5 ล็อก) และอยู่ตรงกันพอดี
 */
function faceZSpan(rowKey, faceKey) {
  const r = rowOf(rowKey);
  if (!r) throw new Error('ไม่มีแถว "' + rowKey + '"');
  const f = faceKey == null ? r.faces[0] : r.faces.find((x) => x.key === String(faceKey).toUpperCase());
  if (!f) throw new Error('แถว ' + r.key + ' ไม่มีหน้าชั้น "' + faceKey + '"');
  return spanOfLen(r, f.count * BAY_PITCH);
}

function spanOfLen(row, len) {
  /* แถวที่ตั้งชิดด้านหลัง = ดันไปสุดผนังลึก · ที่เหลือเว้นไว้ทางฝั่งประตู */
  const gap = row.alignBack ? fullZ() - len : 0;
  const start = DOOR.bayOneAtFarZ ? fullZ() - len - gap : gap;
  return { start: start, len: len, end: start + len };
}

/** ช่วง Z ของทั้งแถว (= หน้าที่ยาวที่สุด) — ของเดิมที่หน้า 3D เรียกอยู่ */
function rowZSpan(rowKey) {
  const bays = baysOf(rowKey);
  if (!bays) throw new Error("ไม่มีแถว \"" + rowKey + "\"");
  const row = rowOf(rowKey);
  const len = Math.max.apply(null, row.faces.map((f) => f.count)) * BAY_PITCH;
  /* แถวที่ตั้งชิดด้านหลัง = ดันไปสุดผนังลึก · ที่เหลือเว้นไว้ทางฝั่งประตู */
  const gap = alignsBack(rowKey) ? fullZ() - len : 0;
  const start = DOOR.bayOneAtFarZ ? fullZ() - len - gap : gap;
  return { start: start, len: len, end: start + len };
}

/**
 * ขอบของล็อกนั้นบนแกน Z — ล็อก 1 = ล็อกที่อยู่ใกล้ประตูที่สุด**ของหน้าชั้นนั้น**
 * 🔑 แถว B ชั้นคู่: ล็อก 6 เป็นล็อกแรกของหน้าขวา ⇒ อยู่ตรงกับล็อก 1 ของหน้าซ้ายพอดี
 */
function bayZ0(rowKey, bay) {
  const bays = baysOf(rowKey);
  if (!bays) throw new Error("ไม่มีแถว \"" + rowKey + "\"");
  if (!Number.isInteger(bay) || bay < 1 || bay > bays)
    throw new Error("แถว " + rowKey + " มี " + bays + " ล็อก — ล็อกที่ " + bay + " ไม่มีอยู่");
  const hit = faceOfBay(rowKey, bay);
  const span = faceZSpan(rowKey, hit.face.key);
  return DOOR.bayOneAtFarZ
    ? span.end - (hit.idx + 1) * BAY_PITCH
    : span.start + hit.idx * BAY_PITCH;
}

/**
 * พิกัดกึ่งกลางของ "ช่องวาง" + ขนาดกล่องที่จะวาด (หน่วย cm)
 * 🔴 ภูม 14/11: 1 ช่อง = **เต็มล็อก** (เลิกผ่าครึ่งซ้าย/ขวา) ⇒ กว้างเต็ม CELL.w
 * @returns {{x:number,y:number,z:number,w:number,d:number,h:number}}
 */
function slotBox(location) {
  const s = parseLocation(location);
  if (!s) throw new Error("รหัสโลเคชั่น \"" + location + "\" ไม่ถูกต้อง");
  const hit = faceOfBay(s.row, s.bay);
  const x0 = faceOriginX(s.row, hit.face.key);
  const z0 = bayZ0(s.row, s.bay);
  const y0 = (s.level - 1) * LEVEL_PITCH + STRUCT.beam; // ของวางบนคาน
  return {
    x: x0 + CELL.d / 2,
    y: y0 + CELL.h / 2,
    z: z0 + CELL.w / 2,
    w: CELL.w, d: CELL.d, h: CELL.h,
  };
}

/** ขนาดรวมของโกดังที่ผังนี้กิน (ไว้ตั้งกล้อง/วาดพื้น) */
function layoutExtent() {
  /* กว้าง = ความลึกของแต่ละ "แถบ" รวมกัน + ทางเดินระหว่างแถบ
     (แถบกลางมีชั้นคู่หลังชนกัน ⇒ ลึก 2 ช่วง · นับตามแถบ ไม่ใช่ตามจำนวนโซน
      ไม่งั้นโกดังกว้างเกินจริง 2 ทางเดิน แล้วกล้องถอยจนของเล็กจนมองไม่เห็น) */
  const bands = bandsOfRows();
  let depth = 0;
  for (const band of bands) depth += bandDepth(band);
  return {
    x: depth * CELL.d + (bands.length - 1) * STRUCT.aisle,
    y: LEVELS * LEVEL_PITCH,
    z: fullZ(),
  };
}

/**
 * 📦 โครงสร้างข้อมูล JSON ทั้งผัง — ตามข้อ 4 ของไฟล์ภูม
 *    ("ออกแบบโครงสร้างข้อมูลสำหรับเก็บพิกัด XYZ และสถานะของแต่ละโลเคชั่น")
 *
 * ใช้เป็นฐานของทั้ง 2 อย่าง: ตัววาด 3D และตัวเทียบว่าของอยู่ช่องไหน
 * สถานะ (status) เริ่มเป็น "empty" ทุกช่อง — ตัวรวมข้อมูลเป็นคนเติม
 */
function buildLayout() {
  /* 🔑 ส่งพิกัดของชั้นวาง (เสา/คาน/ป้าย) ไปกับผังเลย — หน้า 3D จะได้ไม่คิด Z เองซ้ำ
        ถ้าหน้า 3D คิดเอง วันหนึ่งที่สลับทิศ กล่องจะย้ายแต่โครงเหล็กไม่ย้าย */
  const rows = ROWS.map((r) => {
    const span = rowZSpan(r.key);
    /* 🧱 หน้าชั้นแต่ละหน้า = ชั้นวาง 1 ตัว (เสา/คาน/ป้ายของตัวเอง)
       แถวธรรมดามีหน้าเดียว · แถว B ชั้นคู่หันหลังชนกันมี 2 หน้า */
    const faces = r.faces.map((f) => {
      const fs = faceZSpan(r.key, f.key);
      const bz = [];
      for (let n = 0; n < f.count; n++) bz.push(bayZ0(r.key, f.first + n) + CELL.w / 2);
      return {
        key: f.key, name: f.name, short: f.short || f.name, from: f.from,
        first: f.first, count: f.count,
        bays: Array.from({ length: f.count }, (_, n) => f.first + n),
        originX: faceOriginX(r.key, f.key),
        zStart: fs.start, zLen: fs.len, zEnd: fs.end,
        bayCenterZ: bz,
        labelZ: DOOR.bayOneAtFarZ ? fs.end + 150 : fs.start - 150,
      };
    });
    const bayZ = [];
    for (let bay = 1; bay <= r.bays; bay++) bayZ.push(bayZ0(r.key, bay) + CELL.w / 2);
    return {
      key: r.key, name: r.name, bays: r.bays, note: r.note,
      double: r.faces.length > 1,
      faces: faces,
      originX: rowOriginX(r.key),
      zStart: span.start, zLen: span.len, zEnd: span.end,
      bayCenterZ: bayZ,
      /** ป้ายตัวอักษรแถว วางที่ฝั่งหน้าโกดัง (ฝั่งเดียวกับล็อก 1) */
      labelZ: DOOR.bayOneAtFarZ ? span.end + 150 : span.start - 150,
    };
  });
  const slots = [];
  for (const r of ROWS) {
    for (let bay = 1; bay <= r.bays; bay++) {
      for (let level = 1; level <= LEVELS; level++) {
        const location = locationCode(r.key, bay, level);
        slots.push({
          slot: location,
          location: location, row: r.key, bay: bay, level: level,
          /** หน้าชั้นที่ช่องนี้อยู่ — แถวชั้นคู่ใช้แยกว่าอยู่ฝั่งไหน (B1 / B2) */
          face: faceOfBay(r.key, bay).face.key,
          label: slotLabel(location),
          box: slotBox(location),
          status: "empty",
        });
      }
    }
  }
  const bays = ROWS.reduce((n, r) => n + r.bays, 0);
  return {
    unit: "cm",
    /** ทะเบียนโกดัง — หน้า 3D เอาไปทำปุ่มสลับโกดัง (ผังเหมือนกันทุกโกดังตอนนี้) */
    warehouses: WAREHOUSES.map((w) => Object.assign({}, w)),
    cell: Object.assign({}, CELL), struct: Object.assign({}, STRUCT),
    levels: LEVELS,
    door: Object.assign({}, DOOR),
    rows: rows, extent: layoutExtent(),
    totals: { bays: bays, cells: bays * LEVELS, slots: slots.length },
    slots: slots,
  };
}

/** รหัสโลเคชั่นทั้งหมดในผัง (เรียง A→C · ล็อกน้อย→มาก · ชั้นล่าง→บน = เรียงตามรหัส) */
function allLocations() {
  const out = [];
  for (const r of ROWS)
    for (let bay = 1; bay <= r.bays; bay++)
      for (let level = 1; level <= LEVELS; level++)
        out.push(locationCode(r.key, bay, level));
  return out;
}

/* ── ⑤ สลับ 2 หลักของรหัส (เครื่องมือสำหรับแปลงข้อมูล — ไม่ได้ใช้ตอนอ่านจอ) ────
 *
 * รหัสรุ่น 12–14/11 เป็น [แถว][ชั้น][ล็อก] · รุ่นนี้ (14/11) เป็น [แถว][ล็อก][ชั้น]
 *
 * 🔴 **ห้ามเอาไปใช้เดาตอนอ่านจอ** — ต่างจากตอนเลิกใช้ -L/-R ที่เดาได้ปลอดภัย
 *    เพราะ 48 จาก 104 รหัสอ่านได้ทั้ง 2 รูป (A0203 = ชั้น2ล็อก3 หรือ ล็อก2ชั้น3)
 *    ⇒ "เดาให้" = พาพนักงานไปผิดช่องเงียบๆ ครึ่งหนึ่งของเวลา
 *    ⇒ ทางเดียวที่ถูก = แปลงข้อมูลในฐานทีเดียว (warehouse-schema.sql ข้อ ⑦)
 *       แล้วของที่ยังผิดรูปให้ไปโผล่ในรายการเตือน ไม่ใช่ถูกเดาให้
 */

/** สลับ 2 หลักของรหัส — "A0105" ⇄ "A0501" · คืน null เมื่อรหัสผิดรูป
    (ใช้กับสคริปต์แปลงข้อมูล/ตรวจสอบเท่านั้น) */
function convertOldCode(code) {
  const s = String(code || "").trim().toUpperCase().replace(/[\s-]/g, "");
  const m = /^([A-Z])(\d{2})(\d{2})[LR]?$/.exec(s);
  if (!m) return null;
  const row = m[1], oldLevel = Number(m[2]), oldBay = Number(m[3]);
  if (!baysOf(row) || oldBay < 1 || oldBay > baysOf(row)) return null;
  if (oldLevel < 1 || oldLevel > LEVELS) return null;
  return locationCode(row, oldBay, oldLevel);
}

/* ── ④ แปลงรหัสเก่า A1 / B1 → รหัสใหม่ (ไม่แตะระบบ Pacred) ───────────── */
//
// ภูม: *"ตอนนี้ในระบบเรามันเป็นแค่ A1 , B1 ไรงี้"*
// 🔒 **ไม่เขียนกลับเข้า Pacred** — ตัวนี้ใช้แค่ "อ่านของเก่าแล้วเดาล็อกให้พนักงานยืนยัน"
//    ของเก่าบอกแค่แถว+ล็อก ไม่บอกชั้น ⇒ ชั้นพนักงานต้องคีย์เอง

/**
 * legacyGuess("A1") → { row:"A", bay:1, needs:["level"] }  (รหัสรุ่น A1/B1 ของระบบ Pacred)
 * คืน null เมื่ออ่านไม่ออก — ห้ามเดามั่ว (เดาผิด = พนักงานเดินไปผิดช่อง)
 */
function legacyGuess(old) {
  const s = String(old || "").trim().toUpperCase().replace(/[\s-]/g, "");
  const m = /^([A-Z])(\d{1,2})$/.exec(s);
  if (!m) return null;
  const row = m[1], bay = Number(m[2]);
  if (!baysOf(row) || bay < 1 || bay > baysOf(row)) return null;
  return { row: row, bay: bay, needs: ["level"] };
}

module.exports = {
  WAREHOUSES, DEFAULT_WH, isWh, normWh, whName,
  CELL, STRUCT, LEVELS, ROWS, BAY_PITCH, LEVEL_PITCH, DOOR,
  baysOf, locationCode, parseLocation, slotCode, parseSlot, slotLabel,
  rowOf, facesOf, faceOfBay, faceByKey, faceOriginX, faceZSpan,
  rowOriginX, bayZ0, rowZSpan, fullZ,
  slotBox, layoutExtent, buildLayout, allLocations, legacyGuess, convertOldCode,
};
