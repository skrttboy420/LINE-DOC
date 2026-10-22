// ============================================================
// 🔔 ตัวแจกแจ้งเตือนตามหมวด — ภูม 2026-10-21
//
// ภูม: *"เซลอยากได้แจ้งเตือนลูกค้าที่เข้ามาใหม่ของเขา แยกของแต่ละคนเลย …
//        CS ก็ต้องเด้งแต่ออเดอร์ที่ CS คนนั้นดูแลนะ …
//        ส่วนบัญชีงานเยอะมาก บางทีพนักงานทำงานตกหล่นไปเยอะเลย"*
//
// ── 🔑 กติกาใหญ่ 3 ข้อ ───────────────────────────────────────────────
//   ① **1 รอบ = 1 ข้อความต่อคน** — ไม่ใช่ 1 ชิ้น 1 ข้อความ
//      📏 prod 21/10: เด้งต่อชิ้น เซลแบมได้ 72 · เมย์ 80 ข้อความ/วัน = ปิดแจ้งเตือนแน่นอน
//         รวมเป็นรอบแล้วเหลือ ~6–8 ข้อความ/วัน ที่อ่านแล้วรู้เรื่อง
//   ② **ไม่มีของใหม่ = ไม่ส่งอะไรเลย** (ภูม: *"ถ้ายังไม่มีก็ไม่ต้องเด้งมา"*)
//   ③ **คนละคนเห็นคนละชุด** — เซลเห็นลูกค้าของตัวเอง · CS เห็นลูกค้าที่ตัวเองดูแล
//      บัญชีเห็นทั้งหมด (งานบัญชีไม่ได้แบ่งตามลูกค้า)
//
// 🔒 กันแจ้งซ้ำ: จำว่า "เคยบอกเรื่องนี้ไปแล้ว" ไว้ในหน่วยความจำ (เหมือน toldAt ของงานพิกัด)
//    ⚠️ บอทรีสตาร์ท = ความจำหาย ⇒ หมวดที่เป็น "คิวค้าง" อาจซ้ำ 1 รอบ
//       (ยอมได้ เพราะคิวพวกนั้นเล็ก 4–18 ใบ · หมวดที่เยอะใช้ช่วงเวลาแทน ไม่ซ้ำอยู่แล้ว)
// ============================================================

/**
 * หมวดแจ้งเตือนของบอท — ตั้งชื่อตาม "ใครได้ + ตอนไหน" (ภูมสั่งเลิกใช้ชื่อตามพื้นที่งาน
 * เพราะอ่านแล้วไม่รู้ว่าจะเด้งอะไร)
 *
 * `scope` — ใครเห็นอะไร:
 *   "customer" = เห็นเฉพาะลูกค้าที่ตัวเองดูแล (เซลหรือ CS แล้วแต่ทะเบียน)
 *   "all"      = เห็นทั้งหมด (งานบัญชี)
 */
const NOTIFY_CATEGORIES = [
  { key: "arrive_cn",   group: "📦 งานคลัง",   label: "ของลูกค้าถึงโกดังจีน",       scope: "customer", unit: "ราย" },
  { key: "arrive_th",   group: "📦 งานคลัง",   label: "ของลูกค้าถึงไทยแล้ว",        scope: "customer", unit: "ราย" },
  { key: "shop_pay",    group: "🎧 ฝากสั่งซื้อ", label: "ออเดอร์เข้า รอชำระเงิน",    scope: "customer", unit: "ใบ" },
  { key: "shop_ship",   group: "🎧 ฝากสั่งซื้อ", label: "ออเดอร์เข้า รอร้านจีนจัดส่ง", scope: "customer", unit: "ใบ" },
  { key: "acc_yuan",    group: "🧾 บัญชี",     label: "ฝากสั่งเข้า โอนหยวน/สลิปจีน", scope: "all",      unit: "ใบ" },
  { key: "acc_slip",    group: "🧾 บัญชี",     label: "รอตรวจสลิป (ทุกบริการ)",     scope: "all",      unit: "รายการ" },
  { key: "acc_wht",     group: "🧾 บัญชี",     label: "รอตรวจใบหัก ณ ที่จ่าย",      scope: "all",      unit: "รายการ" },
  { key: "acc_cnt",     group: "🧾 บัญชี",     label: "ตู้ยิงรับครบแล้ว",            scope: "all",      unit: "ตู้" },
  /* 🧰 งานทีมระบบ (ภูม 2026-10-22) — *"ของภูมิ ก็แสดงทั้ง งานรอตอบพิกัด ว่ามีค้างอยู่ไหม ·
     งานอัพแทรคเข้าระบบ มีแทรคค้างอยู่กี่แทรค (พร้อมบอกเหตุผลด้วย เช่น ข้อมูลไม่ครบ)"* */
  { key: "hs_pending",  group: "🧰 ทีมระบบ",   label: "ออเดอร์รอตอบพิกัด",           scope: "all",      unit: "ใบ" },
  { key: "track_stuck", group: "🧰 ทีมระบบ",   label: "แทรครออัพเข้าระบบ",           scope: "all",      unit: "แทรค" },
];
const NOTIFY_KEYS = NOTIFY_CATEGORIES.map((c) => c.key);

const { renderNotification } = require("./notify-template");

/** จำนวนรายการสูงสุดต่อข้อความ — ไลน์ตัดที่ 5,000 ตัว ยาวกว่านี้หายท้ายแบบเงียบๆ */
const MAX_ROWS_PER_MESSAGE = 20;

/**
 * หมวดงานทีมระบบ — ทุกคนที่ติ๊กเห็นชุดเดียวกัน (ไม่แบ่งตามลูกค้า)
 *
 * 🔑 `total` = จำนวนจริงทั้งคิวจากเว็บ · `rows` = ตัวอย่างไม่กี่รายการ
 *    ⇒ ตัวนับต้องอ่าน `total` ไม่ใช่ `rows.length` (คิวแทรคค้างยาวเป็นพันแถวได้)
 */
function itdtSections(feed) {
  const it = (feed && feed.itdt) || {};
  return [
    { key: "hs_pending",  rows: it.hsPending   || [], total: it.hsPendingTotal },
    { key: "track_stuck", rows: it.tracksStuck || [], total: it.tracksStuckTotal },
  ];
}

/**
 * แปลง feed จากเว็บ → "ใครควรได้ข้อความอะไร"
 *
 * @param {object} feed              ผลจาก /api/bot?q=notify (feed.notify)
 * @param {Array}  staff             ทะเบียนที่ผูกไลน์ไว้ [{ line_user_id, login, name, nickname, notify, active }]
 * @param {(key:string)=>boolean} isNew  เคยบอกเรื่องนี้ไปแล้วหรือยัง (กันซ้ำ)
 * @param {Record<string,{head:string,line:string}>} [templates]
 *        ข้อความที่ภูมแก้ไว้ (ไม่ส่ง/อ่านไม่ได้ = ใช้ตัวสำรองในโค้ด · ดู notify-template.js)
 * @returns {Array<{lineUserId:string, text:string, keys:string[]}>}
 */
/** แถวนี้เป็นของคนนี้ไหม — เซลหรือ CS ของลูกค้ารายนั้น */
function ownsRow(person, row) {
  const login = String((person && person.login) || "").trim();
  if (!login) return false;
  return login === String(row.salesLogin || "") || login === String(row.csLogin || "");
}

/** หมวดที่แยกตามคนดูแลลูกค้า (เซล/CS) + ที่มาของแถวใน feed */
function customerSections(feed) {
  return [
    { key: "arrive_cn", rows: (feed.arrivals || {}).cnWarehouse || [], kind: "arrival" },
    { key: "arrive_th", rows: (feed.arrivals || {}).thArrived   || [], kind: "arrival" },
    { key: "shop_pay",  rows: (feed.shop || {}).awaitingPayment  || [], kind: "order" },
    { key: "shop_ship", rows: (feed.shop || {}).awaitingShopShip || [], kind: "order" },
  ];
}

/** หมวดงานบัญชี — ทุกคนที่ติ๊กเห็นชุดเดียวกัน (ไม่แบ่งตามลูกค้า) */
function accSections(feed) {
  return [
    { key: "acc_yuan", rows: (feed.shop || {}).yuanCost || [], order: true },
    { key: "acc_slip", rows: (feed.accounting || {}).slipReview || [] },
    { key: "acc_wht",  rows: (feed.accounting || {}).whtReview || [] },
    { key: "acc_cnt",  rows: (feed.accounting || {}).containersComplete || [] },
  ];
}

/**
 * 📋 "งานค้างของฉัน" — ปุ่มเช็คงานค้าง (ภูม 2026-10-22)
 *
 * ภูม: *"อยากให้ทำปุ่มไว้ให้พนักงานแต่ละแผนกเช็คได้ด้วยว่ามีงานไหนค้างอยู่อีกไหม"*
 *      เทียบกับปุ่ม "รอตอบพิกัด" ที่กดแล้วบอกได้ว่า *"ไม่มีงานรอตอบพิกัด — เคลียร์หมดแล้ว"*
 *
 * 🔑 ต่างจากรอบแจ้งเตือนอัตโนมัติ (planNotifications) 2 อย่าง:
 *    ① **คืนทุกหมวดที่เขาติ๊ก รวมหมวดที่ว่าง** (count 0) — คนกดต้องรู้ว่า "เคลียร์แล้ว"
 *       ไม่ใช่หมวดหายไปเฉยๆ แล้วเดาเอาเองว่าไม่มีงานหรือบอทพัง
 *    ② ไม่สน "ของใหม่" — กดเมื่อไหร่ก็เห็นของที่ค้างอยู่ทั้งหมด
 *
 * 🔒 ใช้ตารางแถว + ตัวเช็คเจ้าของ **ตัวเดียวกับรอบแจ้งเตือน** ⇒ เลขตรงกันเสมอ
 *
 * @returns {Array<{key:string, group:string, label:string, unit:string, count:number, rows:Array}>}
 */
function summarizeBacklog(feed, person) {
  if (!feed || !person) return [];
  const picked = Array.isArray(person.notify) ? person.notify : [];
  const out = [];
  for (const cat of NOTIFY_CATEGORIES) {
    if (!picked.includes(cat.key)) continue;
    const sec = customerSections(feed).find((x) => x.key === cat.key)
             || accSections(feed).find((x) => x.key === cat.key)
             || itdtSections(feed).find((x) => x.key === cat.key);
    if (!sec) continue;
    const rows = cat.scope === "customer" ? sec.rows.filter((r) => ownsRow(person, r)) : sec.rows;
    /* 🔑 หมวดที่เว็บส่ง `total` มาด้วย (งานทีมระบบ) = คิวจริงยาวกว่าตัวอย่างที่ส่งมา
          ⇒ นับจาก total · หมวดที่กรองรายคนอยู่แล้วใช้ rows.length ตามเดิม */
    const count = cat.scope !== "customer" && typeof sec.total === "number" ? sec.total : rows.length;
    out.push({ key: cat.key, group: cat.group, label: cat.label, unit: cat.unit || "รายการ", count, rows });
  }
  return out;
}

function planNotifications(feed, staff, isNew, templates) {
  const tplOf = (key) => (templates && templates[key]) || null;
  if (!feed) return [];
  const out = [];

  /** คนที่ติ๊กหมวดนี้ไว้ + ยังทำงานอยู่ */
  const listeners = (key) =>
    (staff || []).filter((s) => s && s.active && Array.isArray(s.notify) && s.notify.includes(key));

  /* ── ① ฝากนำเข้า + ฝากสั่ง — แยกตามคนที่ดูแลลูกค้า ───────────────── */
  const CUSTOMER_SECTIONS = customerSections(feed);

  for (const sec of CUSTOMER_SECTIONS) {
    for (const person of listeners(sec.key)) {
      const mine = sec.rows.filter((r) => ownsRow(person, r));
      if (mine.length === 0) continue;

      // 🔑 กันซ้ำรายแถว — คนเดียวกันต้องไม่ได้เรื่องเดิม 2 รอบ
      const fresh = mine.filter((r) =>
        isNew(`${sec.key}|${person.login}|${sec.kind === "arrival" ? r.customerCode : r.hno}`),
      );
      if (fresh.length === 0) continue;

      /* 🔑 หัวข้อ/บรรทัด มาจากข้อความที่แก้ได้ (notify-template.js)
            ⚠️ **ตัวนับในหัวข้อคิดจาก `shown` ไม่ใช่ `fresh`** — ไม่งั้นหัวบอก 30 แต่ลิสต์มี 20
               แล้วคนนับไม่ตรง (บรรทัดท้ายบอกส่วนที่ตัดแยกอยู่แล้ว) */
      const shown = fresh.slice(0, MAX_ROWS_PER_MESSAGE);
      out.push({
        lineUserId: person.line_user_id,
        text: renderNotification(sec.key, shown, tplOf(sec.key), fresh.length - shown.length),
        keys: fresh.map((r) => `${sec.key}|${person.login}|${sec.kind === "arrival" ? r.customerCode : r.hno}`),
      });
    }
  }

  /* ── ② งานบัญชี + งานทีมระบบ — ทุกคนที่ติ๊กหมวดนั้นเห็นชุดเดียวกัน ── */
  const ACC_SECTIONS = accSections(feed).concat(itdtSections(feed));

  for (const sec of ACC_SECTIONS) {
    const people = listeners(sec.key);
    if (people.length === 0 || sec.rows.length === 0) continue;
    for (const person of people) {
      const idOf = (r) => (sec.order ? r.hno : `${r.service}|${r.ref}`);
      const fresh = sec.rows.filter((r) => isNew(`${sec.key}|${person.login}|${idOf(r)}`));
      if (fresh.length === 0) continue;

      const shown = fresh.slice(0, MAX_ROWS_PER_MESSAGE);
      out.push({
        lineUserId: person.line_user_id,
        text: renderNotification(sec.key, shown, tplOf(sec.key), fresh.length - shown.length),
        keys: fresh.map((r) => `${sec.key}|${person.login}|${idOf(r)}`),
      });
    }
  }

  return out;
}

module.exports = { NOTIFY_CATEGORIES, NOTIFY_KEYS, planNotifications, summarizeBacklog };
