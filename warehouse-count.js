// ============================================================
// 📋 ตรวจนับสต็อกโกดัง — ตัวต่อฐาน (ภูม 2026-11-27)
//
// ภูม: *"ตอนนี้ภูมิต้องเดินเข้าไปนับของในโกดังอะ ว่าตรงกับในระบบไหม แต่มันก็ทำได้แค่
//        ปริ้นไฟล์แล้วเดินไปเทียบ เลยอยากทำระบบไว้ในระบบโกดัง 3D"*
//      + *"ต้องเก็บประวัติดูย้อนหลังได้ … แล้วจะได้เอาไปรายงานพี่ป๊อปที่เป็น owner"*
//
// วิธีทำงาน (ภูมเลือกเอง): **เดินยิงรัวทุกกล่อง แล้วระบบเทียบให้**
//   ① เปิดรอบนับ  → ถ่ายสำเนา "ของที่ควรอยู่บนชั้นตอนนี้" จาก Pacred เก็บไว้
//   ② เดินยิง      → ทุกครั้งที่ยิง = เห็นของ 1 กล่อง (ยิงเลขเดิมซ้ำได้ = อีกกล่อง)
//   ③ ปิดรอบ      → เทียบแล้วแช่ผลไว้ · ดูย้อนหลัง + ออกไฟล์ได้
//
// 🔒 **ไม่แก้อะไรในระบบ Pacred เลย** — ตรวจนับคือการบันทึกว่า "เห็นอะไรจริง"
//    ส่วนจะแก้ตัวเลข/ตามของ/สอบพนักงาน เป็นการตัดสินใจของคน ไม่ใช่ของโปรแกรม
// 🔑 ตัวตัดสินการเทียบอยู่ที่ ./warehouse-count-core.js (PURE · มีเทส 14 ข้อ)
// ============================================================

const { reconcileCount, shipmentOf, keyFormsOf } = require("./warehouse-count-core");
const LAYOUT = require("./warehouse-layout");

/** ยังไม่ได้ลง SQL รอบนี้ — ฐานจะฟ้องรหัสพวกนี้ */
function isMissingSchema(error) {
  const code = String((error && error.code) || "");
  return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205" ||
    /does not exist|could not find/i.test((error && error.message) || "");
}

const SCHEMA_MSG =
  "ยังไม่ได้ลงตารางตรวจนับ — เปิด Supabase ของบอท → SQL Editor → วางไฟล์ warehouse-count-schema.sql แล้ว Run";

const s = (v) => String(v == null ? "" : v).trim();

function createCount(supabase, warehouse) {
  /** ลง SQL แล้วหรือยัง */
  async function isReady() {
    const { error } = await supabase.from("wh_count_session").select("id").limit(1);
    if (!error) return true;
    if (isMissingSchema(error)) return false;
    throw new Error(error.message);
  }

  /** อ่านไล่หน้า — PostgREST ตัดที่ 1000 แถว (บทเรียน read-cap ของโปรเจกต์) */
  async function pageAll(table, build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(supabase.from(table)).range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  /** รอบที่กำลังเปิดอยู่ของโกดังนี้ (ไม่มี = null) */
  async function openSession(whIn) {
    const wh = LAYOUT.normWh(whIn);
    const { data, error } = await supabase
      .from("wh_count_session").select("*").eq("wh", wh).eq("status", "open")
      .order("started_at", { ascending: false }).limit(1);
    if (error) { if (isMissingSchema(error)) throw new Error(SCHEMA_MSG); throw new Error(error.message); }
    return (data && data[0]) || null;
  }

  /**
   * ① เปิดรอบนับ — ถ่ายสำเนาของที่ควรมีไว้
   *
   * 🔑 ถ่ายสำเนา ไม่อ่านสด: ของในระบบเดินตลอดเวลา (ยิงรับเพิ่ม · ลูกค้าจ่าย · ส่งออก)
   *    ถ้าอ่านสด ผลนับเมื่อวานจะเปลี่ยนไปเรื่อยๆ แล้วเอาไปรายงานใครไม่ได้
   * 🚪 เปิดซ้อนไม่ได้ — 2 คนยิงคนละรอบ = ผลนับไม่มีความหมายทั้งคู่
   */
  async function open(opts) {
    const o = opts || {};
    const wh = LAYOUT.normWh(o.wh);
    const by = s(o.by) || "warehouse";

    const already = await openSession(wh);
    if (already) {
      const e = new Error(
        `โกดัง ${wh} มีรอบนับเปิดค้างอยู่แล้ว (รอบ #${already.id} เปิดโดย ${already.started_by}) — ` +
        "ปิดรอบเดิมก่อน หรือเดินนับต่อในรอบนั้น",
      );
      e.code = "ALREADY_OPEN";
      e.session = already;
      throw e;
    }

    /* ของที่ควรอยู่บนชั้นที่ไทย = สถานะ 4/5/6 + มีวันถึงไทย (Pacred คัดมาให้แล้ว) */
    const live = await warehouse.jobsFromPacred([], []);
    if (!live.ok) throw new Error("อ่านข้อมูลจากเว็บ Pacred ไม่ได้ — " + (live.error || "ไม่ทราบสาเหตุ"));
    const jobs = (live.jobs || []).filter((j) => s(j && j.tracking));

    const { data: made, error: insErr } = await supabase
      .from("wh_count_session")
      .insert({ wh, started_by: by, note: s(o.note) || null })
      .select("*").single();
    if (insErr) { if (isMissingSchema(insErr)) throw new Error(SCHEMA_MSG); throw new Error(insErr.message); }

    const rows = jobs.map((j) => ({
      session_id: made.id,
      tracking: s(j.tracking),
      boxes: Math.max(1, Math.trunc(Number(j.boxes) || 1)),
      member_code: s(j.memberCode) || null,
      slot: s(j.slot || j.location) || null,
      status_th: s(j.statusTh) || null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("wh_count_expected").insert(rows.slice(i, i + 500));
      if (error) {
        /* เปิดรอบแล้วแต่ใส่รายการไม่ครบ = รอบนั้นโกหก ⇒ ลบทิ้ง ดีกว่าปล่อยครึ่งๆ */
        await supabase.from("wh_count_session").delete().eq("id", made.id);
        throw new Error("บันทึกรายการที่ควรมีไม่สำเร็จ — " + error.message);
      }
    }
    return { session: made, expectedRows: rows.length, expectedBoxes: rows.reduce((n, r) => n + r.boxes, 0) };
  }

  /**
   * ② บันทึกว่าเห็นของ — ยิง 1 ใบ (qty 1) หรือ นับด้วยตาแล้วใส่จำนวน (qty N)
   *
   * 🔴 ภูม 2026-11-27: *"ถ้านับของแล้วมีครบ ก็ใส่เลขจำนวนกล่องไปเลย จะได้ไม่ต้องมานั่งยิง
   *    ทีละกล่อง … ถ้าต้องยกกล่องทั้งหมดในโกดังด้วยมันน่าจะไม่ไหวกัน"*
   *
   * @param method 'scan' ยิงจริง · 'typed' นับแล้วพิมพ์ · 'full' กดครบตามระบบ
   *        ⇒ จดไว้เพื่อให้ดูออกว่ารอบไหน "กดครบ" รวดเดียวโดยไม่ได้นับ
   */
  const METHODS = new Set(["scan", "typed", "full"]);
  async function scan(opts) {
    const o = opts || {};
    const code = s(o.code).toUpperCase();
    if (!code) throw new Error("ไม่มีเลขที่ยิงมา");
    if (code.length > 100) throw new Error("เลขยาวเกินไป (เกิน 100 ตัวอักษร) — น่าจะยิงผิดอัน");
    const method = METHODS.has(s(o.method)) ? s(o.method) : "scan";
    const by = s(o.by) || "warehouse";

    const sess = await openSession(o.wh);
    if (!sess) throw new Error("ยังไม่ได้เปิดรอบนับ — กดปุ่ม \"เปิดรอบนับ\" ก่อน");

    /**
     * 🔴 หลายคนนับพร้อมกันได้ (ภูม 2026-11-27) ⇒ ส่วนต่างต้องคิดที่ **เซิร์ฟเวอร์** เสมอ
     *
     * `toTotal` = "กองนี้นับได้ทั้งหมด N กล่อง" (ปุ่มครบ / พิมพ์จำนวน)
     *   ถ้าให้จอคิดส่วนต่างเอง แล้วระหว่างนั้นเพื่อนอีกคนนับใบเดียวกันไปแล้ว
     *   ตัวเลขบนจอจะเก่า ⇒ บวกเกิน (นับ 19 → กลายเป็น 38)
     * `qty` = เพิ่มอีกกี่กล่อง (ยิงทีละใบ = 1) — ทางนี้ปลอดภัยอยู่แล้ว
     */
    const before = await report(sess.id);
    const rowBefore = before.result.rows.find((r) =>
      r.tracking.toUpperCase() === code || keyFormsOf(r.tracking).includes(code));
    const already = rowBefore ? rowBefore.scanned : 0;

    let qty;
    const toTotal = Math.trunc(Number(o.toTotal));
    if (Number.isFinite(toTotal) && toTotal > 0) {
      qty = toTotal - already;
      if (qty <= 0) {
        /* คนอื่น (หรือเราเอง) นับถึงจำนวนนั้นไปแล้ว — บอกตรงๆ ดีกว่าบวกซ้ำเงียบๆ */
        const e = new Error(
          "กองนี้นับไปแล้ว " + already + " กล่อง (เท่ากับหรือมากกว่า " + toTotal + " ที่ใส่มา) — " +
          "ถ้าเพื่อนนับไปแล้วก็ข้ามได้เลย · ถ้าใส่ผิดให้กดยกเลิกอันล่าสุดของตัวเอง",
        );
        e.code = "ALREADY_COUNTED";
        throw e;
      }
    } else {
      const qRaw = Math.trunc(Number(o.qty));
      qty = Number.isFinite(qRaw) && qRaw > 0 ? qRaw : 1;
    }
    if (qty > 5000) throw new Error("จำนวนกล่องเยอะผิดปกติ (" + qty + ") — พิมพ์ผิดหรือเปล่า");

    const { error } = await supabase.from("wh_count_scan").insert({
      session_id: sess.id, code, qty, method,
      slot: s(o.slot) || null, scanned_by: by,
    });
    if (error) { if (isMissingSchema(error)) throw new Error(SCHEMA_MSG); throw new Error(error.message); }

    /* ตอบกลับให้จอบอกคนนับได้ทันที: ใบนี้ควรมีกี่กล่อง นับไปแล้วกี่กล่อง
       + **แจงทั้งชิปเม้นว่าเหลือแทรคไหน** (ภูม: "ให้มันแจงด้วยว่าขาดแทรคไหนบ้าง") */
    const state = await report(sess.id);
    const row = state.result.rows.find((r) =>
      r.tracking.toUpperCase() === code ||
      keyFormsOf(r.tracking).includes(code));
    const extra = state.result.extra.find((e) => e.code === code) || null;
    /* 🤝 ใครนับใบนี้ไปแล้วบ้าง — กันเดินซ้ำทางกัน (เอาเฉพาะคนอื่น ไม่นับตัวเอง) */
    const others = state.scans
      .filter((x) => keyFormsOf(x.code).some((k) => keyFormsOf(code).includes(k)) && s(x.scanned_by) !== by)
      .map((x) => ({ by: x.scanned_by, qty: Number(x.qty) || 1, at: x.scanned_at }));
    return {
      sessionId: sess.id,
      code,
      qty,
      method,
      by,
      others,
      known: !!row,
      tracking: row ? row.tracking : null,
      memberCode: row ? row.memberCode : null,
      boxes: row ? row.boxes : null,
      scanned: row ? row.scanned : (extra ? extra.scanned : qty),
      shipment: row ? shipmentOf(state.result, code) : null,
      totals: state.result.totals,
    };
  }

  /**
   * ยกเลิกรายการล่าสุด **ของตัวเอง** — ยิงพลาดต้องแก้ได้ ไม่งั้นคนจะเลี่ยงไม่ใช้ระบบ
   *
   * 🔴 ต้องกรองด้วยชื่อคนนับ (ภูม 2026-11-27 ถามเรื่องนับหลายคนพร้อมกัน)
   *    ของเดิมลบ "รายการล่าสุดของทั้งรอบ" ⇒ คนหนึ่งกดยกเลิก ไปลบงานของเพื่อนที่เพิ่งยิง
   *    = ของหายจากผลนับโดยไม่มีใครรู้ ซึ่งแย่กว่าปัญหาที่เรากำลังแก้
   */
  async function undoLast(opts) {
    const o = opts || {};
    const by = s(o.by) || "warehouse";
    const sess = await openSession(o.wh);
    if (!sess) throw new Error("ยังไม่ได้เปิดรอบนับ");
    const { data, error } = await supabase
      .from("wh_count_scan").select("id, code, qty")
      .eq("session_id", sess.id).eq("scanned_by", by)
      .order("scanned_at", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    const last = (data || [])[0];
    if (!last) throw new Error("คุณยังไม่ได้บันทึกอะไรในรอบนี้ (ยกเลิกได้เฉพาะรายการของตัวเอง)");
    const { error: delErr } = await supabase.from("wh_count_scan").delete().eq("id", last.id);
    if (delErr) throw new Error(delErr.message);
    const state = await report(sess.id);
    return { undone: last.code, qty: Number(last.qty) || 1, totals: state.result.totals };
  }

  /** ③ ผลเทียบของรอบหนึ่ง (เปิดอยู่หรือปิดแล้วก็ดูได้) */
  async function report(sessionId) {
    const id = Number(sessionId);
    if (!Number.isFinite(id)) throw new Error("เลขรอบนับไม่ถูกต้อง");
    const { data: sessRows, error: sErr } = await supabase
      .from("wh_count_session").select("*").eq("id", id).limit(1);
    if (sErr) { if (isMissingSchema(sErr)) throw new Error(SCHEMA_MSG); throw new Error(sErr.message); }
    const session = (sessRows || [])[0];
    if (!session) throw new Error("ไม่เจอรอบนับ #" + id);

    const expected = await pageAll("wh_count_expected", (q) =>
      q.select("tracking, boxes, member_code, slot, status_th").eq("session_id", id).order("id"));
    const scans = await pageAll("wh_count_scan", (q) =>
      q.select("code, qty, method, scanned_at, scanned_by").eq("session_id", id).order("scanned_at"));

    const result = reconcileCount(
      expected.map((e) => ({
        tracking: e.tracking, boxes: e.boxes, memberCode: e.member_code,
        slot: e.slot, statusTh: e.status_th,
      })),
      scans.map((x) => ({ code: x.code, qty: x.qty, method: x.method })),
    );
    /* 🤝 ใครนับไปเท่าไหร่ — ภูมต้องตอบพี่ป๊อปได้ว่าใครทำอะไร และกันเดินซ้ำทางกัน */
    const byPerson = new Map();
    for (const x of scans) {
      const who = s(x.scanned_by) || "warehouse";
      const c = byPerson.get(who) || { by: who, boxes: 0, entries: 0, last: null };
      c.boxes += Number(x.qty) || 1;
      c.entries += 1;
      if (!c.last || String(x.scanned_at) > String(c.last)) c.last = x.scanned_at;
      byPerson.set(who, c);
    }
    const people = [...byPerson.values()].sort((a, b) => b.boxes - a.boxes);
    return { session, result, scanCount: scans.length, scans, people };
  }

  /** ④ ปิดรอบ — แช่สรุปไว้ในแถวรอบ ให้หน้าประวัติโหลดเร็วและผลไม่เปลี่ยนอีก */
  async function close(opts) {
    const o = opts || {};
    const sess = await openSession(o.wh);
    if (!sess) throw new Error("ไม่มีรอบนับที่เปิดอยู่");
    const { result } = await report(sess.id);
    const { data, error } = await supabase
      .from("wh_count_session")
      .update({
        status: "closed",
        finished_at: new Date().toISOString(),
        finished_by: s(o.by) || "warehouse",
        summary: result.totals,
      })
      .eq("id", sess.id).eq("status", "open")   // กันปิดซ้ำ/ชนกัน
      .select("*").single();
    if (error) throw new Error(error.message);
    return { session: data, totals: result.totals };
  }

  /** ⑤ ประวัติรอบนับ — ภูม: *"ต้องเก็บประวัติดูย้อนหลังได้"* */
  async function list(opts) {
    const o = opts || {};
    const limit = Math.min(100, Math.max(1, Number(o.limit) || 30));
    let q = supabase.from("wh_count_session").select("*").order("started_at", { ascending: false }).limit(limit);
    if (o.wh) q = q.eq("wh", LAYOUT.normWh(o.wh));
    const { data, error } = await q;
    if (error) { if (isMissingSchema(error)) throw new Error(SCHEMA_MSG); throw new Error(error.message); }
    return data || [];
  }

  return { isReady, open, scan, undoLast, report, close, list, openSession, SCHEMA_MSG };
}

module.exports = { createCount, isMissingSchema, SCHEMA_MSG };
