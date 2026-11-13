// ============================================================
// 🪫 โหมดประหยัดโควตา — กองแจ้งเตือนไว้ แล้วส่งเป็นรอบ (ภูม 2026-11-13)
//
// ทำไมต้องมี: โควตา push ของ LINE = 300 ข้อความ/เดือน
//   ของเดิมยิงทุก 5 นาที × ผู้รับ 13 คน ⇒ หมดภายในไม่กี่ชั่วโมง แล้วเงียบทั้งเดือน
//   📏 เลขจริง: 13 คน × 3 รอบ/วัน × 30 วัน = 1,170 ข้อความ/เดือน (เกิน 300 เกือบ 4 เท่า)
//              13 คน × 1 รอบ/วัน × 30 วัน =   390 ข้อความ/เดือน (ยังเกิน)
//   ⇒ **โหมดประหยัดช่วยยืดได้ แต่ไม่พอถ้ายังอยู่แพลนฟรี** — ต้องอัปแพลนอยู่ดี
//      ตัวนี้มีไว้เพื่อ (ก) ยืดให้ใช้ได้นานที่สุด (ข) ไม่ให้เงียบแบบไม่รู้ตัว
//
// วิธีทำงาน: ของที่จะเด้ง "กองไว้ต่อคน" แล้วส่งทีเดียวตามรอบเวลา (ค่าตั้งต้น 9 · 13 · 17 น.)
//   • 1 คน = 1 ข้อความต่อรอบ ไม่ว่าจะมีกี่เรื่อง
//   • ไม่มีของค้าง = ไม่ส่ง (ไม่เปลืองโควตาเปล่า)
//   • ข้อความยาวเกินที่ LINE รับได้ = ตัดท้ายแล้วบอกว่าเหลืออีกกี่เรื่อง
//
// 🔒 ไฟล์นี้ไม่ยิง LINE ไม่แตะฐาน ไม่อ่านนาฬิกาเอง — รับเวลาเข้ามา ⇒ เทสได้เต็ม
// ============================================================

/** เวลาไทย = UTC+7 */
const TH_OFFSET_MIN = 7 * 60;
/** LINE รับข้อความละ 5,000 ตัวอักษร — เผื่อไว้ */
const MAX_CHARS = 4500;
/** รอบส่งตั้งต้น (เวลาไทย) */
const DEFAULT_HOURS = [9, 13, 17];
/** ของที่กองค้างนานเกินนี้ = ทิ้ง (โควตาหมดทั้งเดือน กองจะบวม + ของจะเก่าจนไม่มีประโยชน์)
 *  ⚠️ ต้องสั้นกว่า 24 ชม. ที่ `told` ใน index.js ลืมคีย์ ⇒ ของที่ยังค้างจริงจะถูกเสนอใหม่เป็นของสด */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** กองต่อคนไม่เกินนี้ (เผื่อเว็บมีคิวระเบิด) — เกินแล้วทิ้งของเก่าสุดก่อน */
const MAX_PER_PERSON = 60;

/** วัน-ชั่วโมงตามเวลาไทยของเวลานี้ */
function thParts(ms, offsetMin) {
  const d = new Date(ms + (offsetMin == null ? TH_OFFSET_MIN : offsetMin) * 60000);
  return {
    day: d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
         String(d.getUTCDate()).padStart(2, "0"),
    hour: d.getUTCHours(),
    min: d.getUTCMinutes(),
  };
}

/**
 * @param {{hours?: number[], tzOffsetMin?: number, maxChars?: number}} opt
 */
function createNotifySaver(opt) {
  const o = opt || {};
  const hours = (Array.isArray(o.hours) && o.hours.length ? o.hours : DEFAULT_HOURS)
    .map((h) => Number(h)).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b);
  const tz = o.tzOffsetMin == null ? TH_OFFSET_MIN : o.tzOffsetMin;
  const cap = o.maxChars || MAX_CHARS;
  const maxAge = o.maxAgeMs == null ? MAX_AGE_MS : o.maxAgeMs;
  const perPerson = o.maxPerPerson == null ? MAX_PER_PERSON : o.maxPerPerson;

  /** lineUserId → [{ text, at, keys }] */
  const bag = new Map();
  /** รอบล่าสุดที่ส่งไปแล้ว เช่น "2026-11-13@13" */
  let firedKey = null;
  /** คีย์ของที่ถูกทิ้งจากกอง — index.js มาเก็บไปคืนให้ `told` เสนอใหม่ */
  const expired = [];

  /** ทิ้งของเก่าเกิน + ของที่ล้นกอง แล้วจำคีย์ไว้คืน */
  function dropOld(nowMs) {
    if (!nowMs) return;
    for (const [to, list] of Array.from(bag)) {
      const keep = [];
      for (const it of list) {
        if (maxAge > 0 && it.at && nowMs - it.at > maxAge) {
          for (const k of it.keys || []) expired.push(k);
          continue;
        }
        keep.push(it);
      }
      while (keep.length > perPerson) {
        const gone = keep.shift();
        for (const k of gone.keys || []) expired.push(k);
      }
      if (keep.length) bag.set(to, keep);
      else bag.delete(to);
    }
  }

  /** เก็บคีย์ของที่ถูกทิ้งไปใช้ (ล้างออกจากกองนี้) — ส่งเวลามาด้วย = กวาดของเก่าก่อน */
  function takeExpired(nowMs) {
    dropOld(nowMs);
    const out = expired.slice();
    expired.length = 0;
    return out;
  }

  /**
   * เก็บของเข้ากอง (ยังไม่ส่ง)
   * @param keys คีย์กันซ้ำของเรื่องนี้ (index.js ใช้คืนให้รอบหน้าเมื่อส่งไม่ออก)
   */
  function queue(to, text, at, keys) {
    const id = String(to || "").trim();
    const body = String(text || "").trim();
    if (!id || !body) return false;
    if (!bag.has(id)) bag.set(id, []);
    bag.get(id).push({ text: body, at: at || 0, keys: Array.isArray(keys) ? keys.slice() : [] });
    dropOld(at);
    return true;
  }

  /** รอบที่ "ถึงเวลาแล้วและยังไม่ได้ส่ง" — null = ยังไม่ถึง */
  function dueKey(nowMs) {
    const p = thParts(nowMs, tz);
    /* รอบล่าสุดที่ผ่านไปแล้วของวันนี้ */
    let hit = null;
    for (const h of hours) if (p.hour >= h) hit = h;
    if (hit == null) return null;
    const key = p.day + "@" + hit;
    return key === firedKey ? null : key;
  }

  /** ถึงรอบ + มีของค้าง = ควรส่ง */
  function shouldSend(nowMs) {
    return bag.size > 0 && dueKey(nowMs) != null;
  }

  /**
   * เอาของในกองออกมาเป็นข้อความพร้อมส่ง (1 คน = 1 ข้อความ) แล้วล้างกอง
   *
   * 🔑 คีย์แยก 2 กอง เพื่อไม่ให้งานหายเงียบ (บทเรียนของเลนเด้งทันที):
   *    keys    = เรื่องที่ข้อความนี้บอกไปจริง
   *    spilled = เรื่องที่ถูกตัดท้ายเพราะข้อความยาวเกิน (ยังไม่ได้บอก ⇒ ต้องคืน)
   * @returns {{to: string, text: string, items: number, shown: number, keys: string[], spilled: string[]}[]}
   */
  function flush(nowMs) {
    dropOld(nowMs);
    const key = dueKey(nowMs);
    const p = thParts(nowMs, tz);
    const out = [];
    for (const [to, list] of bag) {
      if (!list.length) continue;
      const head = "📋 สรุปงานค้าง (รอบ " + String(p.hour).padStart(2, "0") + ":00) · " +
        list.length + " เรื่อง";
      const parts = [head];
      let used = head.length;
      let shown = 0;
      const keys = [];
      const spilled = [];
      for (const it of list) {
        const piece = "\n━━━━━━━━━━━━\n" + it.text;
        if (used + piece.length > cap) { for (const k of it.keys || []) spilled.push(k); continue; }
        parts.push(piece);
        used += piece.length;
        shown += 1;
        for (const k of it.keys || []) keys.push(k);
      }
      if (shown < list.length) {
        parts.push("\n━━━━━━━━━━━━\n… อีก " + (list.length - shown) + " เรื่อง — เปิดดูในเว็บ");
      }
      out.push({ to: to, text: parts.join(""), items: list.length, shown: shown, keys: keys, spilled: spilled });
    }
    bag.clear();
    if (key) firedKey = key;
    return out;
  }

  /** ของค้างตอนนี้ */
  function pending() {
    let items = 0;
    for (const list of bag.values()) items += list.length;
    return { people: bag.size, items: items };
  }

  /** รอบถัดไปกี่โมง (เวลาไทย) — ไว้โชว์ว่า "จะเด้งอีกทีตอน…" */
  function nextHour(nowMs) {
    const p = thParts(nowMs, tz);
    for (const h of hours) if (h > p.hour) return h;
    return hours[0];            // พ้นรอบสุดท้ายของวันแล้ว ⇒ รอบแรกของพรุ่งนี้
  }

  /** สรุปสถานะเป็นภาษาคน */
  function status(nowMs) {
    const q = pending();
    return {
      mode: "saver",
      hours: hours.slice(),
      pendingPeople: q.people,
      pendingItems: q.items,
      nextHour: nextHour(nowMs),
      text: "🪫 โหมดประหยัดโควตา — รวมส่งวันละ " + hours.length + " รอบ (" +
        hours.map((h) => String(h).padStart(2, "0") + ":00").join(" · ") + ") · " +
        (q.items ? "ค้างอยู่ " + q.items + " เรื่อง (" + q.people + " คน)" : "ไม่มีของค้าง") +
        " · รอบถัดไป " + String(nextHour(nowMs)).padStart(2, "0") + ":00",
    };
  }

  return { queue, dueKey, shouldSend, flush, pending, nextHour, status, hours, takeExpired };
}

module.exports = {
  createNotifySaver, TH_OFFSET_MIN, MAX_CHARS, DEFAULT_HOURS, MAX_AGE_MS, MAX_PER_PERSON,
};
