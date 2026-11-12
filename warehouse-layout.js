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

/** 1 ช่องวางได้ 2 ฝั่ง (ซ้าย/ขวา) */
const SIDES = Object.freeze(["L", "R"]);
const SIDE_TH = Object.freeze({ L: "ซ้าย", R: "ขวา" });

/**
 * 3 แถว/โซนหลัก ตามผังจริง
 *   A = โซนซ้าย  6 ล็อก (ช่วงท้ายติดออฟฟิศโกดัง ⇒ สั้นกว่าเพื่อน)
 *   B = โซนกลาง  10 ล็อก (ยาวเต็มพื้นที่)
 *   C = โซนริมขวา 10 ล็อก (ยาวเต็มพื้นที่)
 *
 * 🔧 ถ้าของจริงต่างจากนี้ (เพิ่มล็อก · เพิ่มแถว) แก้ที่นี่ **ที่เดียว**
 *    ทั้งหน้า 3D · ช่องค้นหา · ตัวตรวจรหัส เดินตามเอง
 */
const ROWS = Object.freeze([
  Object.freeze({ key: "A", name: "โซนซ้าย",   bays: 6,  note: "ช่วงท้ายติดกับตัวออฟฟิศของโกดัง" }),
  Object.freeze({ key: "B", name: "โซนกลาง",   bays: 10, note: "ตั้งยาวเต็มพื้นที่" }),
  Object.freeze({ key: "C", name: "โซนริมขวา", bays: 10, note: "ตั้งยาวเต็มพื้นที่" }),
]);

/* 🧭 ทิศทาง — ยืนที่ "หน้าโกดัง" แล้วมองเข้าไปข้างใน
   ภูม 2026-11-12: *"ล็อกที่ 10 ควรเป็นล็อกที่ 1 นะ เพราะหน้าโกดังอยู่ฝั่งนี้
                     ไม่ใช่อีกฝั่งที่แกใส่มา"* + *"แถว C ควรเป็นแถว A"*
   ⇒ ล็อก 1 = ล็อกที่อยู่ติดประตูหน้าโกดัง · นับลึกเข้าไปเรื่อยๆ
   ⇒ แถว A = แถวซ้ายมือเมื่อยืนหันหน้าเข้าโกดัง
   🔧 ถ้าของจริงกลับด้าน สลับ 2 ค่านี้ได้เลย — ทั้งผัง · หน้า 3D · ป้าย เดินตามเอง */
const DOOR = Object.freeze({
  /** true = ล็อก 1 อยู่ปลายไกลของแกน Z (ฝั่งที่เห็นเป็น "ล็อก 10" ในจอรุ่นก่อน) */
  bayOneAtFarZ: true,
  /** true = แถว A อยู่ปลายไกลของแกน X (ฝั่งที่เห็นเป็น "แถว C" ในจอรุ่นก่อน) */
  rowAatFarX: true,
});

/** ระยะห่างจากล็อกหนึ่งไปล็อกถัดไป = กว้างช่อง + เสา 1 ต้นที่แชร์กัน */
const BAY_PITCH = CELL.w + STRUCT.post;   // 257
/** ระยะห่างจากชั้นหนึ่งไปชั้นถัดไป = สูงช่อง + คาน */
const LEVEL_PITCH = CELL.h + STRUCT.beam; // 175

/* ── ② รหัสโลเคชั่น [แถว][ชั้น][ล็อก] เช่น A0105 = แถว A ชั้น 1 ล็อก 5 ──
   ภูม 2026-11-12: *"รหัสให้ขึ้นเป็น ชั้นก่อนแล้วค่อยต่อด้วยล็อก"*
   (ของเดิมเป็น [แถว][ล็อก][ชั้น] — สลับที่กันแล้ว ⇒ รหัสเก่าต้องแปลงก่อนใช้) */

const pad2 = (n) => String(n).padStart(2, "0");

/** ชั้นวางของแถวนั้นมีกี่ล็อก · ไม่มีแถวนี้ = 0 */
function baysOf(rowKey) {
  const r = ROWS.find((x) => x.key === String(rowKey || "").trim().toUpperCase());
  return r ? r.bays : 0;
}

/**
 * สร้างรหัสโลเคชั่น — locationCode("A", 5, 1) → "A0105" (ชั้น 01 ล็อก 05)
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
  return row + pad2(level) + pad2(bay);          // 🔑 ชั้นก่อน แล้วค่อยล็อก
}

/**
 * แกะรหัสโลเคชั่น — parseLocation("a0105") → { row:"A", level:1, bay:5 }
 * คืน null เมื่อรหัสผิดรูปหรือชี้ช่องที่ไม่มีในผัง
 * (ห้าม throw — ช่องค้นหาเรียกตัวนี้ทุกตัวอักษรที่พิมพ์)
 */
function parseLocation(code) {
  const s = String(code || "").trim().toUpperCase().replace(/[\s-]/g, "");
  const m = /^([A-Z])(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const row = m[1], level = Number(m[2]), bay = Number(m[3]);
  if (bay < 1 || bay > baysOf(row)) return null;
  if (level < 1 || level > LEVELS) return null;
  return { row, bay, level, code: row + pad2(level) + pad2(bay) };
}

/** รหัสช่องวาง (รวมฝั่ง) — slotCode("A0101","l") → "A0101-L" */
function slotCode(location, side) {
  const loc = parseLocation(location);
  if (!loc) throw new Error("รหัสโลเคชั่น \"" + location + "\" ไม่ถูกต้อง");
  const sd = String(side || "").trim().toUpperCase();
  if (!SIDES.includes(sd)) throw new Error("ฝั่งต้องเป็น " + SIDES.join(" หรือ ") + " (ได้ \"" + side + "\")");
  return loc.code + "-" + sd;
}

/** แกะรหัสช่องวาง — คืน null เมื่อผิดรูป */
function parseSlot(code) {
  const s = String(code || "").trim().toUpperCase().replace(/\s/g, "");
  const m = /^([A-Z]\d{4})-([LR])$/.exec(s);
  if (!m) return null;
  const loc = parseLocation(m[1]);
  if (!loc) return null;
  return { row: loc.row, bay: loc.bay, level: loc.level, code: loc.code, side: m[2], slot: loc.code + "-" + m[2] };
}

/** ชื่อที่คนอ่านรู้เรื่อง — "A0105-L" → "โซนซ้าย ชั้น 1 ล็อก 5 (ฝั่งซ้าย)"
    🔑 เรียงคำตามรหัส (ชั้นก่อน ล็อกทีหลัง) ไม่งั้นคนอ่านรหัสกับอ่านคำแล้วได้คนละลำดับ */
function slotLabel(code) {
  const s = parseSlot(code) || parseLocation(code);
  if (!s) return String(code || "");
  const row = ROWS.find((r) => r.key === s.row);
  const base = (row ? row.name : s.row) + " ชั้น " + s.level + " ล็อก " + s.bay;
  return s.side ? base + " (ฝั่ง" + SIDE_TH[s.side] + ")" : base;
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
  return Math.max.apply(null, ROWS.map((r) => r.bays)) * BAY_PITCH;
}

/** ชั้นวางของแถวนี้เริ่มที่ X เท่าไหร่ (นับจากฝั่งซ้ายเมื่อยืนหันหน้าเข้าโกดัง) */
function rowOriginX(rowKey) {
  const i = ROWS.findIndex((r) => r.key === String(rowKey || "").toUpperCase());
  if (i < 0) throw new Error("ไม่มีแถว \"" + rowKey + "\"");
  const n = DOOR.rowAatFarX ? ROWS.length - 1 - i : i;
  return n * (CELL.d + STRUCT.aisle);
}

/** ขอบของล็อกนั้นบนแกน Z — ล็อก 1 อยู่ติดหน้าโกดัง แล้วนับลึกเข้าไป */
function bayZ0(rowKey, bay) {
  const bays = baysOf(rowKey);
  if (!bays) throw new Error("ไม่มีแถว \"" + rowKey + "\"");
  if (!Number.isInteger(bay) || bay < 1 || bay > bays)
    throw new Error("แถว " + rowKey + " มี " + bays + " ล็อก — ล็อกที่ " + bay + " ไม่มีอยู่");
  return DOOR.bayOneAtFarZ ? fullZ() - bay * BAY_PITCH : (bay - 1) * BAY_PITCH;
}

/** ช่วง Z ที่ชั้นวางของแถวนี้กินจริง (ไว้วาดเสา/คาน — จะได้ไม่ต้องคิดเองซ้ำ) */
function rowZSpan(rowKey) {
  const bays = baysOf(rowKey);
  const len = bays * BAY_PITCH;
  const start = DOOR.bayOneAtFarZ ? fullZ() - len : 0;
  return { start: start, len: len, end: start + len };
}

/**
 * พิกัดกึ่งกลางของ "ช่องวาง 1 ฝั่ง" + ขนาดกล่องที่จะวาด (หน่วย cm)
 * @returns {{x:number,y:number,z:number,w:number,d:number,h:number}}
 */
function slotBox(location, side) {
  const s = parseSlot(slotCode(location, side));
  const halfW = CELL.w / 2;                             // 1 ฝั่งกว้างครึ่งช่อง = 125
  const x0 = rowOriginX(s.row);
  const z0 = bayZ0(s.row, s.bay);
  const y0 = (s.level - 1) * LEVEL_PITCH + STRUCT.beam; // ของวางบนคาน
  const zSide = s.side === "L" ? z0 : z0 + halfW;
  return {
    x: x0 + CELL.d / 2,
    y: y0 + CELL.h / 2,
    z: zSide + halfW / 2,
    w: halfW, d: CELL.d, h: CELL.h,
  };
}

/** ขนาดรวมของโกดังที่ผังนี้กิน (ไว้ตั้งกล้อง/วาดพื้น) */
function layoutExtent() {
  return {
    x: ROWS.length * CELL.d + (ROWS.length - 1) * STRUCT.aisle,
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
    const bayZ = [];
    for (let bay = 1; bay <= r.bays; bay++) bayZ.push(bayZ0(r.key, bay) + CELL.w / 2);
    return {
      key: r.key, name: r.name, bays: r.bays, note: r.note,
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
        for (const side of SIDES) {
          slots.push({
            slot: location + "-" + side,
            location: location, row: r.key, bay: bay, level: level, side: side,
            label: slotLabel(location + "-" + side),
            box: slotBox(location, side),
            status: "empty",
          });
        }
      }
    }
  }
  const bays = ROWS.reduce((n, r) => n + r.bays, 0);
  return {
    unit: "cm",
    cell: Object.assign({}, CELL), struct: Object.assign({}, STRUCT),
    levels: LEVELS, sides: SIDES.slice(),
    door: Object.assign({}, DOOR),
    rows: rows, extent: layoutExtent(),
    totals: { bays: bays, cells: bays * LEVELS, slots: slots.length },
    slots: slots,
  };
}

/** รหัสโลเคชั่นทั้งหมดในผัง (เรียง A→C · ชั้นล่าง→บน · ล็อกน้อย→มาก) */
function allLocations() {
  const out = [];
  for (const r of ROWS)
    for (let level = 1; level <= LEVELS; level++)
      for (let bay = 1; bay <= r.bays; bay++)
        out.push(locationCode(r.key, bay, level));
  return out;
}

/* ── ⑤ แปลงรหัสรุ่นก่อน [แถว][ล็อก][ชั้น] → รุ่นใหม่ [แถว][ชั้น][ล็อก] ────
   ของที่คีย์ไว้ก่อน 12/11 เย็น เก็บเป็นรูปเก่า ⇒ ถ้าไม่แปลง จะอ่านไม่ออกแล้วหายจากจอเงียบๆ */

/** "A0501-R" (รูปเก่า = ล็อก 5 ชั้น 1) → "A0105-R" · คืน null เมื่อแปลงไม่ได้ */
function convertOldCode(code) {
  const s = String(code || "").trim().toUpperCase().replace(/\s/g, "");
  const m = /^([A-Z])(\d{2})(\d{2})(-([LR]))?$/.exec(s);
  if (!m) return null;
  const row = m[1], oldBay = Number(m[2]), oldLevel = Number(m[3]);
  if (!baysOf(row) || oldBay < 1 || oldBay > baysOf(row)) return null;
  if (oldLevel < 1 || oldLevel > LEVELS) return null;
  const loc = locationCode(row, oldBay, oldLevel);
  return m[5] ? loc + "-" + m[5] : loc;
}

/* ── ④ แปลงรหัสเก่า A1 / B1 → รหัสใหม่ (ไม่แตะระบบ Pacred) ───────────── */
//
// ภูม: *"ตอนนี้ในระบบเรามันเป็นแค่ A1 , B1 ไรงี้"*
// 🔒 **ไม่เขียนกลับเข้า Pacred** — ตัวนี้ใช้แค่ "อ่านของเก่าแล้วเดาล็อกให้พนักงานยืนยัน"
//    ของเก่าบอกแค่แถว+ล็อก ไม่บอกชั้น/ฝั่ง ⇒ ที่เหลือพนักงานต้องคีย์เอง

/**
 * legacyGuess("A1") → { row:"A", bay:1, needs:["level","side"] }
 * คืน null เมื่ออ่านไม่ออก — ห้ามเดามั่ว (เดาผิด = พนักงานเดินไปผิดช่อง)
 */
function legacyGuess(old) {
  const s = String(old || "").trim().toUpperCase().replace(/[\s-]/g, "");
  const m = /^([A-Z])(\d{1,2})$/.exec(s);
  if (!m) return null;
  const row = m[1], bay = Number(m[2]);
  if (!baysOf(row) || bay < 1 || bay > baysOf(row)) return null;
  return { row: row, bay: bay, needs: ["level", "side"] };
}

module.exports = {
  CELL, STRUCT, LEVELS, SIDES, SIDE_TH, ROWS, BAY_PITCH, LEVEL_PITCH, DOOR,
  baysOf, locationCode, parseLocation, slotCode, parseSlot, slotLabel,
  rowOriginX, bayZ0, rowZSpan, fullZ,
  slotBox, layoutExtent, buildLayout, allLocations, legacyGuess, convertOldCode,
};
