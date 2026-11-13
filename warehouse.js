// ============================================================
// 🏭 โกดัง 3D — ตัวรวมข้อมูล (ภูม 2026-11-12)
//
// ปัญหาจริงที่ภูมเล่า:
//   *"พนักงานแม่งเอาของที่ลูกค้ายังไม่ชำระ ไปส่งลูกค้า แล้วไอ้กล่องที่ลูกค้าชำระแล้ว
//     ยังอยู่ที่โกดัง ส่วนในระบบก็คือถูกต้องหมด ปัญหาอยู่ที่คนทำงาน"*
//
// ⇒ หัวใจของสีบนจอ 3D จึงไม่ใช่ "ของอยู่ไหม" แต่เป็น **"หยิบได้หรือห้ามหยิบ"**
//    🟢 เขียว = ชำระแล้ว + ถึงไทยแล้ว  → หยิบส่งได้
//    🟡 เหลือง = ยังไม่ชำระ / ยังไม่ครบ → **ห้ามหยิบ** (นี่คือกล่องที่พนักงานหยิบผิด)
//    🔴 แดง = ขัดกับระบบ / ระงับ        → ต้องเช็คก่อน
//    ⬜ เทา = ช่องว่าง
//
// 🔒 ไม่แตะฐาน Pacred — ตำแหน่งเก็บในฐานของบอท · สถานะงานอ่านสดผ่าน /api/bot?q=warehouse
// ============================================================

const LAYOUT = require("./warehouse-layout");

/* ── ① ตัวตัดสินสี — PURE (เทสได้ · ไม่ต่อฐาน) ─────────────────────── */

/**
 * สถานะงานฝากนำเข้าของ Pacred (ช่องสถานะงาน · เว็บส่งมาให้ในช่อง status)
 *   1 รอเข้าโกดังจีน · 2 ถึงโกดังจีน · 3 กำลังส่งมาไทย · 4 สินค้าถึงไทย
 *   5 รอชำระเงิน · 6 เตรียมส่ง (ชำระแล้ว) · 7 ส่งแล้ว
 * 🔑 งานเครดิตถูกดันเป็น 6 ตอนอนุมัติเครดิต **ก่อน**ของถึงไทย
 *    ⇒ "ถึงไทยจริงไหม" ต้องดูวันที่ประทับ (arrivedAt) ไม่ใช่ตัวเลขสถานะ
 */
const STATUS_TH = Object.freeze({
  1: "รอเข้าโกดังจีน", 2: "ถึงโกดังจีน", 3: "กำลังส่งมาไทย", 4: "สินค้าถึงไทย",
  5: "รอชำระเงิน", 6: "เตรียมส่ง", 7: "ส่งแล้ว",
});

const PICK = Object.freeze({
  READY:   "ready",    // 🟢 หยิบส่งได้
  WAIT:    "wait",     // 🟡 ห้ามหยิบ — ยังไม่ชำระ/ยังไม่ครบ
  PROBLEM: "problem",  // 🔴 ขัดกับระบบ / ระงับ
  UNKNOWN: "unknown",  // ⬛ ของอยู่บนชั้นแต่หาในระบบไม่เจอ
  EMPTY:   "empty",    // ⬜ ช่องว่าง
});

const PICK_TH = Object.freeze({
  ready:   "ชำระแล้ว · หยิบส่งได้",
  /* 🔑 ป้ายนี้เป็น "คำสั่ง" ไม่ใช่ "เหตุผล" — เหตุผลอยู่ในช่อง why ของแต่ละกล่อง
     (เดิมเขียน "ยังไม่ชำระ · ห้ามหยิบ" แล้วเจอเคส "ชำระแล้วแต่ไม่มีที่อยู่" ⇒ ป้ายขัดกับเหตุผล) */
  wait:    "ห้ามหยิบ",
  problem: "ขัดกับระบบ · ต้องเช็ค",
  unknown: "หาในระบบไม่เจอ",
  empty:   "ว่าง",
});

const PICK_COLOR = Object.freeze({
  ready: "#16a34a", wait: "#f59e0b", problem: "#dc2626", unknown: "#4b5563", empty: "#cbd5e1",
});

/**
 * 🎯 ตัวตัดสินเดียวว่าช่องนี้ควรเป็นสีอะไร
 *
 * @param {null|undefined|{status?:number|string, paid?:boolean, arrivedAt?:string|null,
 *                         hold?:boolean, boxesIn?:number, boxesTotal?:number,
 *                         needsAddress?:boolean, selfPickup?:boolean}} job
 *        งานจากเว็บ Pacred · null/undefined = หาไม่เจอ
 * @param {boolean} hasBox มีของวางอยู่บนชั้นช่องนี้ไหม (จากฐานของบอท)
 * @returns {{pick:string, label:string, color:string, why:string}}
 */
function pickStateOf(job, hasBox) {
  if (!hasBox) return state(PICK.EMPTY, "ไม่มีของวางในช่องนี้");
  if (!job)    return state(PICK.UNKNOWN, "มีของวางอยู่ แต่หาแทรคนี้ในระบบไม่เจอ — เช็คว่าคีย์เลขถูกไหม");

  const st = Number(job.status);
  const paid = job.paid === true;
  const arrived = !!(job.arrivedAt && String(job.arrivedAt).trim());

  /* 🔴 ระงับไว้ก่อนทุกกรณี */
  if (job.hold === true) return state(PICK.PROBLEM, "งานถูกระงับไว้ — ห้ามจ่ายออกจนกว่าจะปลด");

  /* 🔴 ของอยู่บนชั้น แต่ระบบบอกว่าส่งไปแล้ว = มีคนหยิบกล่องอื่นไปส่งแทน
       (นี่คืออาการตรงๆ ของปัญหาที่ภูมเล่า — จับได้ทันทีที่เปิดจอ) */
  if (st === 7) return state(PICK.PROBLEM, "ระบบบอกว่า \"ส่งแล้ว\" แต่ของยังอยู่บนชั้น — น่าจะมีคนหยิบกล่องอื่นไปส่งแทน");

  /* 🔴 ของอยู่บนชั้นที่โกดังไทย แต่ระบบยังไม่ประทับวันถึงไทย = ข้อมูลไม่ตรงของจริง
       🔑 เช็ค "วันถึงไทย" ไม่ใช่ตัวเลขสถานะ — งานเครดิตถูกดันเป็นสถานะ 6 (ชำระแล้ว)
          ตอนอนุมัติเครดิต **ก่อน**ของถึงไทย ⇒ ถ้าดูแต่สถานะจะได้เขียว
          แล้วพนักงานออกไปหาของที่ยังอยู่จีน (วัดจริง 11-12: งานเครดิตสถานะ 6 มีจริงในฐาน) */
  if (!arrived)
    return state(PICK.PROBLEM, "ของอยู่บนชั้นแล้ว แต่ระบบยังไม่ลงวันถึงไทย (สถานะ \"" + (STATUS_TH[st] || st) + "\") — ยังไม่ได้ยิงรับเข้าโกดังไทย");

  /* 🟡 ยังไม่ชำระ = ห้ามหยิบ (ต้นเหตุหลักที่พนักงานส่งผิด) */
  if (!paid) return state(PICK.WAIT, "ลูกค้ายังไม่ชำระ (" + (STATUS_TH[st] || st) + ") — ห้ามหยิบไปส่ง");

  /* 🟡 ชำระแล้วแต่ของยังมาไม่ครบทุกกล่อง = รอให้ครบก่อน */
  const total = Number(job.boxesTotal), got = Number(job.boxesIn);
  if (Number.isFinite(total) && Number.isFinite(got) && total > 0 && got < total)
    return state(PICK.WAIT, "ชำระแล้ว แต่ของมาถึง " + got + "/" + total + " กล่อง — รอให้ครบก่อนส่ง");

  /* 🟡 ชำระแล้วแต่ยังไม่มีที่อยู่จัดส่ง = หยิบไปก็ส่งไม่ได้ (ภูม 2026-11-12)
       ภูม: *"ถ้าออเดอร์ไหนยังไม่มีที่อยู่จัดส่งจะได้รู้เลยด้วย"*
       🔑 ธงนี้มาจากตัวตัดสินเดียวกับด่านก่อนแจ้งชำระของเว็บ ⇒ จอกับระบบพูดตรงกัน
          (งานรับเองหน้าโกดังไม่เข้าเคสนี้ — ตัวตัดสินยกเว้นให้อยู่แล้ว) */
  if (job.needsAddress === true)
    return state(PICK.WAIT, "ชำระแล้ว แต่ยังไม่มีที่อยู่จัดส่ง — หยิบไปก็ส่งไม่ได้ ต้องถามที่อยู่ก่อน");

  /* 🟢 ชำระแล้ว + ถึงไทยแล้ว = หยิบได้ */
  return state(
    PICK.READY,
    (job.selfPickup === true ? "ชำระแล้ว · ลูกค้ารับเองหน้าโกดัง" : "ชำระแล้ว (" + (STATUS_TH[st] || st) + ")") +
      " — หยิบส่งได้",
  );
}

function state(pick, why) {
  return { pick: pick, label: PICK_TH[pick], color: PICK_COLOR[pick], why: why };
}

/**
 * รวมผัง + ของที่วางอยู่ + งานจากเว็บ → ชุดข้อมูลที่หน้า 3D ใช้วาดได้ตรงๆ
 * PURE — ส่งข้อมูลเข้ามา ไม่ได้ไปอ่านฐานเอง (⇒ เทสได้เต็ม)
 *
 * @param {Array} placements แถวจาก wh_placement
 * @param {Array} jobs       งานจาก /api/bot?q=warehouse
 */
function mergeView(placements, jobs, cages) {
  const layout = LAYOUT.buildLayout();

  /* 🧺 กรงเหล็ก = "ช่องนี้มีกรงวางอยู่" (ของในกรง = แถวที่วางในช่องเดียวกัน)
     ภูม 13/11: *"ของในกรงมันก็กล่องนะ แต่กล่องเล็กไง"* ⇒ ไม่มีที่เก็บของแยกอีกชุด */
  const cageBy = new Map();
  for (const c of cages || []) {
    const parsed = LAYOUT.parseSlot((c && c.slot) || "");
    if (parsed) cageBy.set(parsed.slot, c);
  }
  const jobBy = new Map();
  for (const j of jobs || []) {
    const t = String((j && j.tracking) || "").trim();
    if (t) jobBy.set(t, j);
  }

  /* ของที่วางอยู่ จัดกองตามช่อง (1 ช่องวางได้หลายแทรค) */
  const bySlot = new Map();
  const orphans = [];                       // ของที่คีย์ช่องไว้ แต่ช่องนั้นไม่มีในผัง
  for (const p of placements || []) {
    /* 🔁 แถวที่คีย์ไว้ด้วยรหัสรูปเก่า [แถว][ล็อก][ชั้น] ยังอ่านออก
       ไม่งั้นของที่คีย์ไว้ก่อน 12/11 เย็น จะ "หายจากจอเงียบๆ" (แกะรหัสไม่ออก = orphan)
       📌 ล้างให้ถาวรด้วย `node warehouse-fix-codes.mjs --apply` */
    const parsed = LAYOUT.parseSlot(p.slot) || LAYOUT.parseSlot(LAYOUT.convertOldCode(p.slot) || "");
    if (!parsed) { orphans.push(p); continue; }
    if (!bySlot.has(parsed.slot)) bySlot.set(parsed.slot, []);
    bySlot.get(parsed.slot).push(p);
  }

  const counts = { ready: 0, wait: 0, problem: 0, unknown: 0, empty: 0, cages: 0 };
  const alerts = [];

  for (const s of layout.slots) {
    const items = bySlot.get(s.slot) || [];
    s.items = items.map((p) => {
      const job = jobBy.get(String(p.tracking || "").trim()) || null;
      const st = pickStateOf(job, true);
      return {
        tracking: p.tracking,
        memberCode: (job && job.memberCode) || p.member_code || null,
        customer: (job && job.customer) || null,
        boxes: Number(p.boxes) || 1,
        statusTh: job ? (STATUS_TH[Number(job.status)] || String(job.status)) : null,
        /* 📍 ที่อยู่จัดส่ง — โกดังใช้ตอนแปะหน้ากล่อง (ภูม 2026-11-12) */
        address: (job && job.address) || null,
        receiver: (job && job.receiver) || null,
        tel: (job && job.tel) || null,
        carrier: (job && job.carrier) || null,
        selfPickup: !!(job && job.selfPickup),
        needsAddress: !!(job && job.needsAddress),
        placedAt: p.placed_at || null,
        placedBy: p.placed_by || null,
        note: p.note || null,
        pick: st.pick, pickLabel: st.label, why: st.why,
      };
    });

    /* สีของช่อง = อาการที่ "แรงที่สุด" ในช่องนั้น (แดง > เหลือง > ไม่เจอ > เขียว)
       🔑 ห้ามเอาสีเสียงส่วนมาก — ช่องที่มี 1 กล่องห้ามหยิบปนอยู่ ต้องเห็นว่าเตือน */
    const worst = worstOf(s.items.map((i) => i.pick));
    const base = items.length ? worst : PICK.EMPTY;
    const info = state(base, base === PICK.EMPTY ? PICK_TH.empty : (s.items.find((i) => i.pick === base) || {}).why || "");
    s.status = info.pick;
    s.color = info.color;
    s.statusLabel = info.label;
    s.boxes = s.items.reduce((n, i) => n + i.boxes, 0);
    counts[info.pick] = (counts[info.pick] || 0) + 1;

    /* 🧺 ช่องนี้มีกรงไหม — จำนวนในกรงนับจากของที่วางในช่องนี้ตรงๆ */
    const cage = cageBy.get(s.slot);
    s.cage = cage
      ? {
          kind: cage.kind === "nocode" ? "nocode" : "small",
          name: String(cage.name || "").trim() || "กรงเหล็ก",
          note: cage.note || null,
          items: s.items.length,
          boxes: s.boxes,
        }
      : null;
    if (s.cage) counts.cages = (counts.cages || 0) + 1;

    for (const it of s.items)
      if (it.pick === PICK.PROBLEM || it.pick === PICK.UNKNOWN)
        alerts.push({ slot: s.slot, label: s.label, tracking: it.tracking, memberCode: it.memberCode, pick: it.pick, why: it.why });
  }

  /* 🔴 งานที่ "ชำระแล้ว ถึงไทยแล้ว" แต่ไม่มีใครคีย์ว่าอยู่ช่องไหน
        = พนักงานหาไม่เจอในจอ ⇒ เสี่ยงหยิบกล่องอื่นแทน (ปัญหาเดิมของภูมเลย) */
  const placed = new Set((placements || []).map((p) => String(p.tracking || "").trim()));
  const unplaced = [];
  for (const j of jobs || []) {
    const t = String((j && j.tracking) || "").trim();
    if (!t || placed.has(t)) continue;
    const st = pickStateOf(j, true);
    if (st.pick === PICK.READY) unplaced.push({ tracking: t, memberCode: j.memberCode || null, customer: j.customer || null });
  }

  return {
    layout: layout,
    counts: counts,
    alerts: alerts,
    unplaced: unplaced,
    orphans: orphans.map((p) => ({ tracking: p.tracking, slot: p.slot })),
    pickLegend: PICK_TH, pickColor: PICK_COLOR,
  };
}

const SEVERITY = [PICK.PROBLEM, PICK.UNKNOWN, PICK.WAIT, PICK.READY];
function worstOf(picks) {
  for (const s of SEVERITY) if (picks.includes(s)) return s;
  return PICK.EMPTY;
}

/* ── ② ตัวอ่าน/ตัวเขียนฐานของบอท ─────────────────────────────────── */

/**
 * @param {object} supabase ลูกค้า Supabase **ของบอท** (ไม่ใช่ของ Pacred)
 * @param {(q:string, extra?:object)=>Promise<any>} pacredGet ท่ออ่านเว็บ Pacred
 */
function createWarehouse(supabase, pacredGet) {
  /** ยังไม่ได้ลง SQL = บอกตรงๆ ไม่ใช่พังเงียบ */
  async function isReady() {
    const { error } = await supabase.from("wh_placement").select("tracking").limit(1);
    if (!error) return true;
    if (String(error.code) === "PGRST205" || /does not exist/i.test(error.message || "")) return false;
    throw new Error(error.message);
  }

  /** ยังไม่ได้ลง SQL รอบใหม่ (ช่องโกดัง/ตารางกรง) — ฐานจะฟ้องรหัสพวกนี้ */
  function isMissingSchema(error) {
    const code = String((error && error.code) || "");
    return code === "42703" || code === "PGRST204" || code === "PGRST205" ||
      /does not exist|could not find/i.test((error && error.message) || "");
  }

  async function listPlacements() {
    const out = [];
    /* 🔑 PostgREST คืนสูงสุด 1000 แถว — ไล่เป็นช่วงจนครบ (บทเรียน read-cap ของโปรเจกต์) */
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("wh_placement").select("*").order("slot").range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    /* แถวที่ลงไว้ก่อนมีช่องโกดัง = โกดัง 1 (ของจริงที่วางอยู่ตอนนี้อยู่โกดังแรกทั้งหมด) */
    return out.map((r) => Object.assign({}, r, { wh: LAYOUT.normWh(r.wh) }));
  }

  /**
   * 🧺 กรงเหล็กที่วางอยู่ในโกดังนี้
   * ยังไม่ได้ลงตาราง = คืนรายการว่าง (จอยังเปิดได้ แค่ไม่มีกรง) ไม่ใช่พังทั้งหน้า
   */
  async function listCages(whIn) {
    const wh = LAYOUT.normWh(whIn);
    const { data, error } = await supabase.from("wh_cage").select("*").limit(1000);
    if (error) {
      if (isMissingSchema(error)) return [];
      throw new Error(error.message);
    }
    return (data || [])
      .map((c) => Object.assign({}, c, { wh: LAYOUT.normWh(c.wh) }))
      .filter((c) => c.wh === wh);
  }

  /** กรงทุกโกดัง (ไว้ค้นข้ามโกดัง) */
  async function allCages() {
    const { data, error } = await supabase.from("wh_cage").select("*").limit(1000);
    if (error) {
      if (isMissingSchema(error)) return [];
      throw new Error(error.message);
    }
    return (data || []).map((c) => Object.assign({}, c, { wh: LAYOUT.normWh(c.wh) }));
  }

  /**
   * 🧺 ใส่กรงเหล็กลงช่อง (หรือแก้ชื่อ/ชนิดกรงเดิม) — 1 ช่อง 1 กรง
   * @param kind "small" = กรงชิ้นเล็ก · "nocode" = กรงของที่ไม่มีรหัสลูกค้า
   */
  async function putCage(opts, who) {
    const o = opts || {};
    const wh = strictWh(o.wh);
    const s = LAYOUT.parseSlot(o.slot);
    if (!s) throw new Error('ช่อง "' + o.slot + '" ไม่มีในผังโกดัง');
    const kind = o.kind === "nocode" ? "nocode" : "small";
    const name = String(o.name || "").trim() ||
      (kind === "nocode" ? "กรง No-Code " : "กรงชิ้นเล็ก ") + LAYOUT.slotLabel(s.slot);
    if (name.length > 40) throw new Error("ชื่อกรงยาวเกิน 40 ตัวอักษร");

    const row = {
      id: wh + "-" + s.slot, wh: wh, slot: s.slot, kind: kind, name: name,
      note: o.note ? String(o.note).trim() : null,
      made_by: String(who || "").trim() || "unknown",
    };
    const { error } = await supabase.from("wh_cage").upsert(row, { onConflict: "id" });
    if (error) {
      if (isMissingSchema(error)) throw new Error("ยังไม่ได้ลงตารางกรงเหล็ก — เปิด Supabase › SQL Editor แล้ววาง warehouse-schema.sql อีกรอบ");
      throw new Error(error.message);
    }
    await log("-", "cage_put", null, s.slot, row.made_by, name, wh);
    return { ok: true, cage: { wh: wh, slot: s.slot, kind: kind, name: name }, label: LAYOUT.slotLabel(s.slot) };
  }

  /** 🧺 เอากรงออกจากช่อง — ของที่อยู่ในกรงไม่ถูกแตะ (ยังวางอยู่ช่องเดิม) */
  async function removeCage(whIn, slot, who) {
    const wh = strictWh(whIn);
    const s = LAYOUT.parseSlot(slot);
    if (!s) throw new Error('ช่อง "' + slot + '" ไม่มีในผังโกดัง');
    const { error } = await supabase.from("wh_cage").delete().eq("id", wh + "-" + s.slot);
    if (error && !isMissingSchema(error)) throw new Error(error.message);
    await log("-", "cage_del", s.slot, null, String(who || "").trim() || "unknown", null, wh);
    return { ok: true, slot: s.slot };
  }

  /** รหัสโกดังที่เขียนฐานได้ — ไม่รู้จัก = ปฏิเสธ (ห้ามเดาแล้วลงผิดโกดัง) */
  function strictWh(x) {
    if (x === undefined || x === null || String(x).trim() === "") return LAYOUT.DEFAULT_WH;
    if (!LAYOUT.isWh(x)) throw new Error('ไม่รู้จักโกดัง "' + x + '"');
    return String(x).trim().toUpperCase();
  }

  /**
   * งานที่โกดังต้องรู้ — อ่านสดจากเว็บ · อ่านไม่ได้ก็ยังเปิดจอได้ (แค่ไม่มีสี)
   *
   * @param {string[]} [onShelf] เลขแทรคที่เราคีย์ไว้ว่าอยู่บนชั้น
   *   🔑 ส่งไปด้วยเพื่อให้เว็บตอบสถานะของกล่องพวกนี้ **ทุกสถานะ** รวม "ส่งแล้ว"
   *      ไม่ส่ง = กล่องที่ระบบบอกว่าส่งแล้วแต่ยังอยู่บนชั้น จะขึ้นสีเทา "หาไม่เจอ"
   *      แทนที่จะเป็นสีแดง (ซึ่งคืออาการของปัญหาที่ภูมเล่าเป๊ะๆ)
   *   🔴 ไม่ให้เว็บกวาดงานที่ส่งแล้วทั้งหมดมา — วัดจริง 11-12 ได้ 6,910 แถว = 1.18 MB ต่อครั้ง
   *      (ถามเฉพาะที่เราถือ: 584 แถว · 92 KB · 215 มิลลิวินาที)
   */
  /**
   * ถามเว็บ Pacred ว่าแต่ละแทรคเป็นงานอะไร
   * @param onShelf เลขแทรคที่ให้เว็บ **ไปตามหาสถานะ** — ต้องส่งทุกใบบนชั้น
   *        ไม่งั้นใบที่หลุดจากชุด "บนชั้น" (สถานะ 7 = ส่งแล้ว แต่ของยังวางอยู่) จะหาไม่เจอ
   * @param detail เลขแทรคที่ขอ **ชื่อ/เบอร์/ที่อยู่** ด้วย — ส่ง [] = ขอแค่ธง
   *        🔒 ข้อมูลส่วนตัวลูกค้าไม่ควรไหลออกมาทั้งโกดังทุกครั้งที่เปิดจอ
   *        (owner/เดฟ 2026-11-12) · ไม่ส่ง = ของเดิม คือได้รายละเอียดทุกใบที่ถาม
   */
  async function jobsFromPacred(onShelf, detail) {
    try {
      const t = (onShelf || []).filter(Boolean).slice(0, 400).join(",");
      const q = {};
      if (t) q.t = t;
      if (detail !== undefined) q.d = (detail || []).filter(Boolean).join(",");
      const r = await pacredGet("warehouse", Object.keys(q).length ? q : undefined);
      return { jobs: (r && r.jobs) || [], ok: true, at: (r && r.at) || null };
    } catch (e) {
      return { jobs: [], ok: false, error: e.message };
    }
  }

  /** ภาพรวมทั้งโกดังสำหรับหน้า 3D — ทีละโกดัง (ภูม 13/11: มีมากกว่า 1 โกดังแล้ว) */
  async function view(whIn) {
    /* 🔑 ส่งเลขแทรคทุกใบบนชั้นไปให้เว็บ "ตามหาสถานะ" เหมือนเดิม (ห้ามตัด —
       ไม่งั้นเคส "ส่งแล้วแต่ของยังอยู่บนชั้น" หาไม่เจอ แล้วขึ้นเทาแทนที่จะเตือนแดง)
       🔒 แต่ขอ "รายละเอียดติดต่อ" = ไม่เอาเลย (d ว่าง) — ภาพรวมใช้แค่ธงก็ระบายสีได้ครบ
          ที่อยู่/ชื่อ/เบอร์ ค่อยถามรายกล่องตอนกดเปิด (/warehouse/api/job)
          owner/เดฟ 2026-11-12: *"ควรส่งแค่ธง แล้วถามรายกล่อง"* */
    const wh = LAYOUT.normWh(whIn);
    const all = await listPlacements();
    const placements = all.filter((p) => p.wh === wh);

    /* 🔢 นับของทุกโกดังไว้ให้ปุ่มสลับโกดังโชว์เลข — อ่านรอบเดียวอยู่แล้ว ไม่เปลืองเพิ่ม */
    const byWh = {};
    for (const w of LAYOUT.WAREHOUSES) byWh[w.id] = 0;
    for (const p of all) byWh[p.wh] = (byWh[p.wh] || 0) + 1;

    const live = await jobsFromPacred(placements.map((p) => p.tracking), []);
    const cages = await listCages(wh).catch(() => []);
    const merged = mergeView(placements, live.jobs, cages);
    return Object.assign(merged, {
      wh: wh,
      whName: LAYOUT.whName(wh),
      warehouses: LAYOUT.WAREHOUSES.map((w) => Object.assign({ placed: byWh[w.id] || 0 }, w)),
      live: { ok: live.ok, at: live.at, error: live.error || null },
      placedCount: placements.length,
    });
  }

  /**
   * 📥 คีย์ว่ากล่องนี้วางช่องไหน — วางใหม่ หรือ ย้าย
   * @throws เมื่อรหัสช่องไม่มีในผัง (กันคีย์ช่องที่ไม่มีอยู่จริง)
   */
  async function place(tracking, slot, who, opts) {
    const t = String(tracking || "").trim();
    if (!t) throw new Error("ยังไม่ได้ใส่เลขแทรค");
    const s = LAYOUT.parseSlot(slot);
    if (!s) throw new Error("ช่อง \"" + slot + "\" ไม่มีในผังโกดัง");
    const by = String(who || "").trim() || "unknown";
    const o = opts || {};
    const wh = strictWh(o.wh);

    const { data: before } = await supabase.from("wh_placement").select("*").eq("tracking", t).maybeSingle();
    const fromSlot = before ? before.slot : null;
    const fromWh = before ? LAYOUT.normWh(before.wh) : null;
    /* ⚠️ ช่องเดียวกันแต่คนละโกดัง = ย้ายจริง (รหัสช่องซ้ำกันได้ระหว่างโกดัง) */
    if (fromSlot === s.slot && fromWh === wh && !o.force) {
      return { ok: true, unchanged: true, wh: wh, slot: s.slot, label: LAYOUT.slotLabel(s.slot) };
    }

    const row = {
      tracking: t, wh: wh, slot: s.slot, location: s.code, zone: s.row, bay: s.bay, lvl: s.level, side: s.side,
      member_code: o.memberCode ? String(o.memberCode).trim() : null,
      boxes: Math.max(1, Number(o.boxes) || 1),
      note: o.note ? String(o.note).trim() : null,
      placed_by: by, placed_at: new Date().toISOString(),
    };
    let { error } = await supabase.from("wh_placement").upsert(row, { onConflict: "tracking" });
    if (error && isMissingSchema(error)) {
      /* 🔁 ยังไม่ได้ลง SQL รอบใหม่ — โกดัง 1 ยังคีย์ได้ตามเดิม แต่โกดัง 2 ต้องบอกตรงๆ
         (ถ้าเขียนทับเงียบๆ ของโกดัง 2 จะไปโผล่โกดัง 1 แล้วพนักงานเดินหาผิดตึก) */
      if (wh !== LAYOUT.DEFAULT_WH) {
        throw new Error("ยังใช้ " + LAYOUT.whName(wh) + " ไม่ได้ — ต้องเปิด Supabase › SQL Editor วาง warehouse-schema.sql อีกรอบก่อน");
      }
      const plain = Object.assign({}, row); delete plain.wh;
      ({ error } = await supabase.from("wh_placement").upsert(plain, { onConflict: "tracking" }));
    }
    if (error) throw new Error(error.message);

    const movedWh = !!(fromSlot && fromWh !== wh);
    await log(t, fromSlot ? "move" : "place", fromSlot, s.slot, by,
      movedWh ? ["ย้ายจาก " + LAYOUT.whName(fromWh), o.note].filter(Boolean).join(" · ") : o.note, wh);
    return {
      ok: true, moved: !!fromSlot, from: fromSlot, fromWh: fromWh, movedWarehouse: movedWh,
      wh: wh, slot: s.slot, label: LAYOUT.slotLabel(s.slot),
    };
  }

  /**
   * 📤 เอาของออกจากชั้น
   * @param {"load"|"remove"} [kind] "load" = เอาขึ้นรถ (จ่ายออกให้ลูกค้า) · "remove" = เอาออกเฉยๆ
   *   🔑 ภูม 2026-11-12: *"ทำให้มีปุ่ม ย้ายของไปพาเรทอื่น กับ ปุ่ม เอาของขึ้นรถ"*
   *      แยกชนิดไว้เพื่อให้ประวัติบอกได้ว่ากล่องนี้ "ขึ้นรถไปแล้ว" หรือ "แค่ยกลงมา"
   *      — คือหัวใจของการไล่ว่าใครเอาของผิดไปส่ง
   */
  async function remove(tracking, who, note, kind) {
    const t = String(tracking || "").trim();
    if (!t) throw new Error("ยังไม่ได้ใส่เลขแทรค");
    const { data: before } = await supabase.from("wh_placement").select("*").eq("tracking", t).maybeSingle();
    if (!before) return { ok: true, missing: true };
    const { error } = await supabase.from("wh_placement").delete().eq("tracking", t);
    if (error) throw new Error(error.message);
    const action = kind === "load" ? "load" : "remove";
    const wh = LAYOUT.normWh(before.wh);
    await log(t, action, before.slot, null, String(who || "").trim() || "unknown", note, wh);
    return { ok: true, from: before.slot, wh: wh, action };
  }

  /** ประวัติการย้ายของแทรคนี้ */
  async function history(tracking, limit) {
    const { data, error } = await supabase
      .from("wh_move_log").select("*")
      .eq("tracking", String(tracking || "").trim())
      .order("at", { ascending: false }).limit(Math.min(Number(limit) || 20, 100));
    if (error) throw new Error(error.message);
    return data || [];
  }

  /** 🔎 ค้นหา — เลขแทรค · รหัสลูกค้า · รหัสช่อง */
  async function find(term) {
    const q = String(term || "").trim();
    if (!q) return [];
    const loc = LAYOUT.parseSlot(q) || LAYOUT.parseLocation(q);
    if (loc) {
      const { data, error } = await supabase.from("wh_placement").select("*")
        .eq(loc.side ? "slot" : "location", loc.side ? loc.slot : loc.code);
      if (error) throw new Error(error.message);
      return data || [];
    }
    const esc = q.replace(/[%,]/g, "");
    const { data, error } = await supabase.from("wh_placement").select("*")
      .or("tracking.ilike.%" + esc + "%,member_code.ilike.%" + esc + "%").limit(50);
    if (error) throw new Error(error.message);
    return (data || []).map((r) => Object.assign({}, r, { wh: LAYOUT.normWh(r.wh) }));
  }

  /** 🧺 ค้นกรงเหล็กจากชื่อ (ข้ามโกดัง) — ภูม: *"รองรับการค้นหาทั้งชื่อกรง"* */
  async function findCages(term) {
    const q = String(term || "").trim().toLowerCase();
    if (!q) return [];
    const cages = await allCages().catch(() => []);
    return cages.filter((c) =>
      String(c.name || "").toLowerCase().includes(q) ||
      String(c.slot || "").toLowerCase() === q);
  }

  async function log(tracking, action, fromSlot, toSlot, by, note, wh) {
    /* บันทึกประวัติพลาด ไม่ควรทำให้การคีย์ตำแหน่งล้ม — แต่ต้องเห็นใน log ของ Render */
    const row = {
      tracking: tracking, action: action, from_slot: fromSlot, to_slot: toSlot,
      by_who: by, note: note ? String(note).trim() : null,
      wh: LAYOUT.normWh(wh),
    };
    let { error } = await supabase.from("wh_move_log").insert(row);
    if (error && isMissingSchema(error)) {
      /* ยังไม่ได้ลง SQL รอบใหม่ = ประวัติยังไม่มีช่องโกดัง ⇒ เขียนแบบเดิม ไม่ให้ประวัติหาย */
      const plain = Object.assign({}, row); delete plain.wh;
      if (plain.note == null && row.wh !== LAYOUT.DEFAULT_WH) plain.note = LAYOUT.whName(row.wh);
      ({ error } = await supabase.from("wh_move_log").insert(plain));
    }
    if (!error) return;
    /* 🔁 ฐานที่ลง SQL ไว้ก่อน 2026-11-12 ยังไม่รู้จักชนิด 'load' (ด่าน check ปฏิเสธ 23514)
       ⇒ ลงเป็น 'remove' แล้วเขียนเหตุไว้ในหมายเหตุแทน — ประวัติไม่หาย
       (ลง warehouse-schema.sql ซ้ำอีกรอบแล้วจะเก็บเป็น 'load' ได้ตรงๆ) */
    /* 🔁 ฐานที่ยังไม่รู้จักชนิดใหม่ (ด่าน check ปฏิเสธ 23514) = ลงเป็นชนิดเดิม + เขียนเหตุไว้ */
    const OLD_SHAPE = { load: "remove", cage_put: "place", cage_del: "remove" };
    const WHY_TH = { load: "ขึ้นรถ", cage_put: "ใส่กรงเหล็ก", cage_del: "เอากรงออก" };
    if (String(error.code) === "23514" && OLD_SHAPE[action]) {
      const alt = Object.assign({}, row, {
        action: OLD_SHAPE[action],
        note: [WHY_TH[action], row.note].filter(Boolean).join(" · "),
      });
      const retry = await supabase.from("wh_move_log").insert(alt);
      if (!retry.error) return;
      if (isMissingSchema(retry.error)) {
        const plain = Object.assign({}, alt); delete plain.wh;
        const retry2 = await supabase.from("wh_move_log").insert(plain);
        if (!retry2.error) return;
      }
    }
    console.error("[wh_move_log] เขียนประวัติไม่สำเร็จ", { action, tracking, code: error.code, message: error.message });
  }

  return {
    isReady, listPlacements, jobsFromPacred, view, place, remove, history, find,
    listCages, allCages, putCage, removeCage, findCages,
  };
}

module.exports = {
  PICK, PICK_TH, PICK_COLOR, STATUS_TH,
  pickStateOf, mergeView, worstOf, createWarehouse,
};
