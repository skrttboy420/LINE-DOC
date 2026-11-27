// ============================================================
// 📋 ตรวจนับสต็อกโกดัง — ตัวตัดสิน PURE (ไม่ต่อฐาน · เทสได้)  ภูม 2026-11-27
//
// ปัญหาจริงที่ภูมเล่า:
//   *"ของที่โกดังมีแค่ 160 กว่ากล่องจริงๆ จำนวนกล่องอะ ไม่ใช่แทรค แล้วแทรคก็ปนๆกันไป
//     เช่น 1794460795 อาจจะในโกดังแค่ 4 กล่อง · 1793516105 อาจจะเหลือ 5 กล่อง ไรงี้
//     ถึงบอกพนักงานมันส่งกันมั่วอะ"*
//
// 📏 วัดฐานจริง 27/11 (PR179): ระบบ + MOMO ตรงกันว่ามี 387 กล่อง · ยิงรับเข้าโกดังจริง 422
//    แต่ของจริงบนชั้นเหลือ ~160 ⇒ **~227 กล่องออกจากโกดังโดยไม่มีใครบันทึก**
//    ร่องรอยในระบบ: ใบมอบงานคนขับ 0 แถว · รูปตอนส่งมีแค่ 3/161 แทรค ⇒ ตามไม่ได้เลย
//
// ⇒ หน้าที่ของไฟล์นี้: เทียบ **"ของที่ควรมี" (จากระบบ)** กับ **"ของที่ยิงเจอจริง"** แล้วบอก 3 กอง
//      ✅ ครบ   — ยิงเจอครบตามจำนวนกล่อง
//      🔴 ขาด   — ระบบว่ามี แต่ยิงไม่เจอ (หรือเจอไม่ครบ) = **ของหาย**
//      🟡 เกิน  — ยิงเจอ แต่ระบบไม่คิดว่าอยู่ที่นี่ = ของมาผิดที่ / ระบบไม่รู้จัก
//
// 🔑 กติกาสำคัญ: **นับเป็น "กล่อง" ไม่ใช่ "แทรค"**
//    1 เลขแทรคมีได้หลายกล่อง (PR179: แทรคเดียว 19 กล่อง) และกล่องทุกใบในแทรคนั้น
//    แปะป้ายเลขเดียวกัน
//
// 🔴 รอบ 2 (ภูม 2026-11-27): *"ถ้านับของแล้วมีครบ ก็ใส่เลขจำนวนกล่องไปเลย จะได้ไม่ต้อง
//    มานั่งยิงทีละกล่อง … ถ้าต้องยกกล่องทั้งหมดในโกดังด้วยมันน่าจะไม่ไหวกัน"*
//    ⇒ 1 ครั้งที่บันทึก มี `qty` ได้ (ยิง 1 ใบ = qty 1 · นับด้วยตาแล้วพิมพ์ = qty N)
//    ⇒ และมี `method` ว่าตัวเลขนั้นได้มายังไง: scan (ยิงจริง) · typed (นับแล้วพิมพ์) · full (กดครบ)
//       **สำคัญกับความน่าเชื่อถือ** — ถ้ารอบไหนกด full เกือบหมด = ไม่ได้นับจริง ต้องดูออก
//
// 🔒 ไม่แตะเงิน ไม่แตะสถานะงาน — ตรวจนับคือ "บันทึกว่าเห็นอะไรจริง" เท่านั้น
//    การแก้ตัวเลขในระบบต้องให้คนตัดสินทีหลัง (ไฟล์นี้ไม่สั่งแก้อะไรทั้งสิ้น)
// ============================================================

/** ตัดช่องว่าง + ตัวพิมพ์ให้เทียบกันได้ */
function norm(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}

/**
 * เลขหลักของแทรค — ตัดหาง `-3` / `-3/40` ออก
 * (รูปเดียวกับที่ระบบ Pacred ใช้: กล่องย่อยเก็บเป็น `<เลขหลัก>-i/n`)
 */
function baseOf(tracking) {
  const t = norm(tracking);
  const m = /^(.+?)-\d+(?:\/\d+)?$/.exec(t);
  return m ? m[1] : t;
}

/**
 * ตัดตัวอักษรนำหน้า — `JYM188067486656` → `188067486656`
 *
 * 🪤 ทำไมต้องมี: ใบ MOMO พิมพ์ `JYM188067486656` แต่ระบบคีย์ `188067486656-1/2`
 *    (ของจริง PR649) ⇒ ถ้าเทียบตรงตัวอย่างเดียว กล่องที่ **มีอยู่จริง** จะถูกนับว่า "หาย"
 *    = เตือนลวง แล้วพนักงานก็เลิกเชื่อผลนับทั้งใบ
 */
function digitsCore(tracking) {
  const m = /^[A-Z]{1,4}(\d{8,})$/.exec(norm(tracking));
  return m ? m[1] : null;
}

/**
 * กุญแจทุกรูปที่ "ของชิ้นนี้" อาจถูกยิงมา — ใช้ทั้งฝั่งที่ควรมีและฝั่งที่ยิง
 * เรียงจากเฉพาะเจาะจงที่สุดไปกว้างที่สุด
 */
function keyFormsOf(tracking) {
  const t = norm(tracking);
  if (!t) return [];
  const out = [t];
  const b = baseOf(t);
  if (b && b !== t) out.push(b);
  for (const x of [t, b]) {
    const c = digitsCore(x);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** จำนวนกล่องของแถว — ไม่ส่งมา/อ่านไม่ออก = 1 (ของ 1 ชิ้นอย่างน้อย) */
function boxesOf(row) {
  const n = Math.trunc(Number(row && row.boxes));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * 🎯 ตัวตัดสินเดียวของการตรวจนับ
 *
 * @param {Array<{tracking:string, boxes?:number, memberCode?:string|null,
 *                slot?:string|null, statusTh?:string|null}>} expected
 *        ของที่ระบบบอกว่า "ควรอยู่ในโกดังตอนนี้" (ถ่ายไว้ตอนเปิดรอบนับ)
 * @param {Array<{code:string, qty?:number, method?:string}|string>} scans
 *        ทุกครั้งที่บันทึก · ไม่ใส่ qty = 1 กล่อง · ใส่ qty = นับมาแล้ว N กล่อง
 * @returns {{
 *   rows: Array<object>, missing: Array<object>, partial: Array<object>,
 *   full: Array<object>, extra: Array<{code:string, scanned:number}>,
 *   totals: object
 * }}
 */
function reconcileCount(expected, scans) {
  const exp = Array.isArray(expected) ? expected : [];
  const list = Array.isArray(scans) ? scans : [];

  /* ① ทำดัชนีจาก "ของที่ควรมี" — กุญแจทุกรูปชี้กลับไปที่แถวเดิม
        รูปที่เฉพาะเจาะจงกว่าชนะ (ยิงเลขเต็มตรงแถวไหน ต้องลงแถวนั้น ไม่ใช่แถวพี่น้อง) */
  const byKey = new Map();
  const rows = exp.map((e, i) => ({
    i,
    tracking: String((e && e.tracking) || "").trim(),
    boxes: boxesOf(e),
    scanned: 0,
    memberCode: (e && e.memberCode) || null,
    slot: (e && e.slot) || null,
    statusTh: (e && e.statusTh) || null,
  }));
  rows.forEach((r, idx) => {
    keyFormsOf(r.tracking).forEach((k, rank) => {
      const cur = byKey.get(k);
      /* กุญแจเดียวชี้ได้หลายแถว (พี่น้องเลขหลักเดียวกัน) — เก็บอันที่ "ตรงกว่า" ไว้
         เท่ากัน = เก็บแถวแรกไว้ แล้วให้ตัวจ่ายกล่องไปไล่เติมพี่น้องเอง */
      if (!cur || rank < cur.rank) byKey.set(k, { rank, idx });
    });
  });

  /* ② กองพี่น้องตามเลขหลัก — ยิงเลขหลักมา ต้องกระจายลงกล่องที่ยังขาดของพี่น้องได้ */
  const family = new Map();
  rows.forEach((r, idx) => {
    const b = baseOf(r.tracking);
    if (!family.has(b)) family.set(b, []);
    family.get(b).push(idx);
  });

  /* ③ เดินทีละการยิง */
  const extraBy = new Map();
  const methodBoxes = Object.create(null);   // ตัวเลขที่ได้มาจากวิธีไหนบ้าง
  let matchedScans = 0;
  for (const raw of list) {
    const isObj = raw && typeof raw === "object";
    const code = norm(isObj ? raw.code : raw);
    if (!code) continue;
    /* qty = จำนวนกล่องที่บันทึกครั้งนั้น (ไม่ใส่/เพี้ยน = 1 — ปลอดภัยไว้ก่อน ไม่เดาให้เยอะ) */
    const qRaw = isObj ? Math.trunc(Number(raw.qty)) : 1;
    const qty = Number.isFinite(qRaw) && qRaw > 0 ? qRaw : 1;
    const method = isObj && raw.method ? String(raw.method) : "scan";
    methodBoxes[method] = (methodBoxes[method] || 0) + qty;

    /* หาแถวปลายทางครั้งเดียว แล้วค่อยจ่ายทีละกล่อง (qty 19 = เหมือนยิง 19 ครั้ง) */
    let hit = null;
    for (const k of keyFormsOf(code)) { hit = byKey.get(k); if (hit) break; }
    if (!hit) { extraBy.set(code, (extraBy.get(code) || 0) + qty); continue; }

    matchedScans += 1;
    const order = [hit.idx, ...(family.get(baseOf(rows[hit.idx].tracking)) || [])];
    for (let left = qty; left > 0; left--) {
      /* แถวที่ตรงที่สุดก่อน — เต็มแล้วไล่หาพี่น้องที่ยังขาด
         (กล่องทุกใบในชิปเม้นมักแปะป้ายเลขหลักเหมือนกัน) */
      let put = false;
      for (const idx of order) {
        if (rows[idx].scanned < rows[idx].boxes) { rows[idx].scanned += 1; put = true; break; }
      }
      /* ทุกแถวของตระกูลนี้เต็มหมดแล้ว แต่ยังบันทึกมาอีก = เกินจากที่ระบบคิด */
      if (!put) { rows[hit.idx].over = (rows[hit.idx].over || 0) + left; break; }
    }
  }

  /* ④ แยกกอง */
  const full = rows.filter((r) => r.scanned >= r.boxes);
  const partial = rows.filter((r) => r.scanned > 0 && r.scanned < r.boxes);
  const missing = rows.filter((r) => r.scanned === 0);
  const extra = [...extraBy].map(([code, scanned]) => ({ code, scanned }))
    .sort((a, b) => b.scanned - a.scanned || a.code.localeCompare(b.code));

  const sum = (a, f) => a.reduce((n, r) => n + f(r), 0);
  const expectedBoxes = sum(rows, (r) => r.boxes);
  const foundBoxes = sum(rows, (r) => Math.min(r.scanned, r.boxes));
  const overBoxes = sum(rows, (r) => r.over || 0);

  return {
    rows,
    full,
    partial,
    missing,
    extra,
    totals: {
      expectedRows: rows.length,
      expectedBoxes,
      foundBoxes,
      /** กล่องที่ระบบว่ามี แต่ยิงไม่เจอ = **ของหาย** */
      missingBoxes: expectedBoxes - foundBoxes,
      fullRows: full.length,
      partialRows: partial.length,
      missingRows: missing.length,
      /** ยิงเกินจำนวนกล่องของแถวที่รู้จัก */
      overBoxes,
      /** ยิงมาแต่ระบบไม่รู้จักเลย */
      extraCodes: extra.length,
      extraScans: sum(extra, (e) => e.scanned),
      totalScans: list.length,
      matchedScans,
      /** 🔴 กล่องที่นับได้ แยกตามวิธี — full เยอะ = ไม่ได้นับจริง (ดูหัวไฟล์) */
      /* สะสมบนออบเจ็กต์ไร้ prototype (กันชื่อวิธีแปลกๆ เช่น __proto__) แล้วคืนเป็นออบเจ็กต์ธรรมดา */
      methodBoxes: Object.assign({}, methodBoxes),
    },
  };
}

/**
 * 📦 แจงทั้งชิปเม้นของเลขที่เพิ่งบันทึก — ภูม 2026-11-27
 *
 * ภูม: *"ถ้ายิงแล้วแทรคนั้นมันเป็นแทรคย่อย หรือมีหลายแทรค ก็ให้มันแจงด้วยว่าขาดแทรคไหนบ้าง"*
 *
 * ⇒ รู้แค่ใบที่เพิ่งยิงไม่พอ · ต้องเห็นทั้งกองว่าเหลืออะไรให้ตามอีก
 *   ไม่งั้นพนักงานเดินวนหาแบบไม่มีเป้า แล้วก็ยอมแพ้กลางทาง
 *
 * @param {ReturnType<typeof reconcileCount>} result ผลเทียบ
 * @param {string} code เลขที่เพิ่งบันทึก
 * @returns {null|{base:string, rows:Array, boxes:number, found:number, left:number,
 *                 doneRows:number, leftRows:number}}
 */
function shipmentOf(result, code) {
  const rows = (result && result.rows) || [];
  const want = keyFormsOf(code);
  const hit = rows.find((r) => {
    const forms = keyFormsOf(r.tracking);
    return want.some((w) => forms.includes(w));
  });
  if (!hit) return null;
  const base = baseOf(hit.tracking);
  const members = rows.filter((r) => baseOf(r.tracking) === base);
  if (!members.length) return null;
  const sum = (f) => members.reduce((n, r) => n + f(r), 0);
  const found = sum((r) => Math.min(r.scanned, r.boxes));
  const boxes = sum((r) => r.boxes);
  return {
    base,
    /* เรียงให้ "ที่ยังขาด" ขึ้นก่อน — คนกำลังเดินหาของ ไม่ได้มานั่งอ่านรายงาน */
    rows: members.slice().sort((a, b) => (b.boxes - b.scanned) - (a.boxes - a.scanned)),
    boxes,
    found,
    left: boxes - found,
    doneRows: members.filter((r) => r.scanned >= r.boxes).length,
    leftRows: members.filter((r) => r.scanned < r.boxes).length,
  };
}

module.exports = { reconcileCount, shipmentOf, baseOf, digitsCore, keyFormsOf, boxesOf, norm };
