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
  { key: "arrive_cn",   group: "📦 งานคลัง",   label: "ของลูกค้าถึงโกดังจีน",       scope: "customer" },
  { key: "arrive_th",   group: "📦 งานคลัง",   label: "ของลูกค้าถึงไทยแล้ว",        scope: "customer" },
  { key: "shop_pay",    group: "🎧 ฝากสั่งซื้อ", label: "ออเดอร์เข้า รอชำระเงิน",    scope: "customer" },
  { key: "shop_ship",   group: "🎧 ฝากสั่งซื้อ", label: "ออเดอร์เข้า รอร้านจีนจัดส่ง", scope: "customer" },
  { key: "acc_yuan",    group: "🧾 บัญชี",     label: "ฝากสั่งเข้า โอนหยวน/สลิปจีน", scope: "all" },
  { key: "acc_slip",    group: "🧾 บัญชี",     label: "รอตรวจสลิป (ทุกบริการ)",     scope: "all" },
  { key: "acc_wht",     group: "🧾 บัญชี",     label: "รอตรวจใบหัก ณ ที่จ่าย",      scope: "all" },
  { key: "acc_cnt",     group: "🧾 บัญชี",     label: "ตู้ยิงรับครบแล้ว",            scope: "all" },
];
const NOTIFY_KEYS = NOTIFY_CATEGORIES.map((c) => c.key);

const money = (n) => "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * แปลง feed จากเว็บ → "ใครควรได้ข้อความอะไร"
 *
 * @param {object} feed              ผลจาก /api/bot?q=notify (feed.notify)
 * @param {Array}  staff             ทะเบียนที่ผูกไลน์ไว้ [{ line_user_id, login, name, nickname, notify, active }]
 * @param {(key:string)=>boolean} isNew  เคยบอกเรื่องนี้ไปแล้วหรือยัง (กันซ้ำ)
 * @returns {Array<{lineUserId:string, text:string, keys:string[]}>}
 */
function planNotifications(feed, staff, isNew) {
  if (!feed) return [];
  const out = [];

  /** คนที่ติ๊กหมวดนี้ไว้ + ยังทำงานอยู่ */
  const listeners = (key) =>
    (staff || []).filter((s) => s && s.active && Array.isArray(s.notify) && s.notify.includes(key));

  /** แถวนี้เป็นของคนนี้ไหม — เซลหรือ CS ของลูกค้ารายนั้น */
  const ownsRow = (person, row) => {
    const login = String((person && person.login) || "").trim();
    if (!login) return false;
    return login === String(row.salesLogin || "") || login === String(row.csLogin || "");
  };

  /* ── ① ฝากนำเข้า + ฝากสั่ง — แยกตามคนที่ดูแลลูกค้า ───────────────── */
  const CUSTOMER_SECTIONS = [
    { key: "arrive_cn", head: "📦 ถึงโกดังจีนแล้ว", rows: (feed.arrivals || {}).cnWarehouse || [], kind: "arrival" },
    { key: "arrive_th", head: "🇹🇭 ถึงไทยแล้ว",      rows: (feed.arrivals || {}).thArrived   || [], kind: "arrival" },
    { key: "shop_pay",  head: "💳 รอชำระเงิน",       rows: (feed.shop || {}).awaitingPayment  || [], kind: "order" },
    { key: "shop_ship", head: "🚚 รอร้านจีนจัดส่ง",  rows: (feed.shop || {}).awaitingShopShip || [], kind: "order" },
  ];

  for (const sec of CUSTOMER_SECTIONS) {
    for (const person of listeners(sec.key)) {
      const mine = sec.rows.filter((r) => ownsRow(person, r));
      if (mine.length === 0) continue;

      // 🔑 กันซ้ำรายแถว — คนเดียวกันต้องไม่ได้เรื่องเดิม 2 รอบ
      const fresh = mine.filter((r) =>
        isNew(`${sec.key}|${person.login}|${sec.kind === "arrival" ? r.customerCode : r.hno}`),
      );
      if (fresh.length === 0) continue;

      const lines = [sec.head, "━━━━━━━━━━━━"];
      if (sec.kind === "arrival") {
        const pieces = fresh.reduce((a, r) => a + Number(r.pieces || 0), 0);
        lines[0] = `${sec.head} — ${pieces} ชิ้น · ${fresh.length} ลูกค้า`;
        for (const r of fresh.slice(0, 20)) {
          lines.push(`• ${r.customerCode} ${r.customerName} — ${r.pieces} ชิ้น (${r.weightKg} กก.)`);
        }
        if (fresh.length > 20) lines.push(`… อีก ${fresh.length - 20} ลูกค้า`);
      } else {
        lines[0] = `${sec.head} — ${fresh.length} ใบ`;
        for (const r of fresh.slice(0, 15)) {
          lines.push(`• ${r.hno} ${r.customerCode} ${r.customerName} — ${money(r.amountThb)}`);
        }
        if (fresh.length > 15) lines.push(`… อีก ${fresh.length - 15} ใบ`);
      }

      out.push({
        lineUserId: person.line_user_id,
        text: lines.join("\n"),
        keys: fresh.map((r) => `${sec.key}|${person.login}|${sec.kind === "arrival" ? r.customerCode : r.hno}`),
      });
    }
  }

  /* ── ② งานบัญชี — ทุกคนที่ติ๊กหมวดนั้นเห็นชุดเดียวกัน ─────────────── */
  const ACC_SECTIONS = [
    { key: "acc_yuan", head: "💴 ฝากสั่ง · โอนหยวน/สลิปจีน", rows: (feed.shop || {}).yuanCost || [], order: true },
    { key: "acc_slip", head: "🧾 รอตรวจสลิป",                rows: (feed.accounting || {}).slipReview || [] },
    { key: "acc_wht",  head: "📄 รอตรวจใบหัก ณ ที่จ่าย",     rows: (feed.accounting || {}).whtReview || [] },
    { key: "acc_cnt",  head: "📦 ตู้ยิงรับครบแล้ว",           rows: (feed.accounting || {}).containersComplete || [] },
  ];

  for (const sec of ACC_SECTIONS) {
    const people = listeners(sec.key);
    if (people.length === 0 || sec.rows.length === 0) continue;
    for (const person of people) {
      const idOf = (r) => (sec.order ? r.hno : `${r.service}|${r.ref}`);
      const fresh = sec.rows.filter((r) => isNew(`${sec.key}|${person.login}|${idOf(r)}`));
      if (fresh.length === 0) continue;

      const lines = [`${sec.head} — ${fresh.length} รายการ`, "━━━━━━━━━━━━"];
      for (const r of fresh.slice(0, 15)) {
        lines.push(sec.order
          ? `• ${r.hno} ${r.customerCode} ${r.customerName} — ${money(r.amountThb)}`
          : `• [${r.service}] ${r.ref} — ${r.label}`);
      }
      if (fresh.length > 15) lines.push(`… อีก ${fresh.length - 15} รายการ`);

      out.push({
        lineUserId: person.line_user_id,
        text: lines.join("\n"),
        keys: fresh.map((r) => `${sec.key}|${person.login}|${idOf(r)}`),
      });
    }
  }

  return out;
}

module.exports = { NOTIFY_CATEGORIES, NOTIFY_KEYS, planNotifications };
