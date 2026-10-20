// ============================================================
// 👥 ทะเบียนพนักงาน + ด่านสิทธิ์ของบอท — ภูม 2026-10-20
//
// ภูม: *"ถ้าต้องการให้คนอื่นในบริษัทมาใช้งานด้วย แต่การแจ้งเตือนมันจะแจ้งเตือนต่างกัน"*
//      *"ถ้าสถานะในหน้า /admin/humanresource/staff เป็น 'ลาออก · ล็อก' เราก็ไม่ต้องไปแจ้งเตือนแล้ว
//        แล้วถ้าคนที่ออกไปแล้วมาพิมพ์อะไรในบอทก็ให้ขึ้นไม่มีสิทธิ์ใช้งานบอทไปเลย"*
//
// เส้นที่เลือก (ไม่แตะเว็บ Pacred เลย):
//   ① ภูมเปิดหน้าจัดการ → เลือกคน → ออกรหัสเชิญ (เช่น BAM-7421)
//   ② ส่งรหัสให้เขาทางไลน์
//   ③ เขาแอดบอท แล้วพิมพ์รหัส → ผูกเสร็จ
//   ④ บอทรู้ว่าเขาเป็นใคร แผนกไหน ได้รับหมวดไหน
//
// 🔒 ตาราง bot_staff/bot_invite ปิด RLS ไว้ ⇒ **SUPABASE_KEY ต้องเป็น service_role**
//    (ดูเหตุผลใน staff-schema.sql) · ถ้ายังเป็น anon จะเจอ error 42501 แล้วบอทบอกตรงๆ
// ============================================================

/** หมวดแจ้งเตือนที่ระบบ Pacred มีอยู่จริงวันนี้ (วัดจาก notifications 8,452 ใบ · 20/10) */
const CATEGORIES = [
  { key: "hs_pending",   label: "งานรอตอบพิกัด",     hint: "ออเดอร์ที่ยังไม่มีพิกัด — เดิมเด้งหาภูมคนเดียว" },
  { key: "forwarder",    label: "งานฝากนำเข้า",      hint: "หมวดที่เยอะสุดในระบบ (6,126 ใบ)" },
  { key: "order",        label: "งานฝากสั่งซื้อ",     hint: "734 ใบ" },
  { key: "yuan_payment", label: "ฝากโอนหยวน",        hint: "59 ใบ" },
  { key: "wallet",       label: "กระเป๋าเงิน",        hint: "1 ใบ" },
  { key: "sales",        label: "งานขาย",            hint: "14 ใบ" },
  { key: "system",       label: "ระบบ",              hint: "144 ใบ" },
  { key: "observability", label: "สุขภาพระบบ",       hint: "1,375 ใบ — ปกติเอาไว้ให้ ITDT" },
  { key: "uploads",      label: "การอัพข้อมูลเข้าระบบ", hint: "MOMO / อี้อู / TTW" },
  { key: "momo_pending", label: "แทรค MOMO ค้าง",     hint: "ซิงค์มาแล้วแต่ยังไม่กดนำเข้า" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/**
 * 💡 ชุดเริ่มต้นตามแผนก — "เดาให้ก่อน แล้วภูมติ๊กทับได้"
 *
 * 🔑 ตั้งใจให้เป็นแค่ค่าเริ่มต้น ไม่ใช่กติกาตายตัว เพราะแผนกเดียวกันหน้าที่ต่างกันได้
 *    (ภูม: *"บัญชียังมีฝั่งรับกับฝั่งจ่ายซึ่งมันจะแจ้งเตือนต่างกัน"* — ผังตำแหน่งมีแค่
 *     Accounting Supervisor · Admin Accounting ⇒ แยกรับ/จ่ายจากตำแหน่งไม่ได้ ต้องติ๊กเอง)
 */
const DEFAULT_BY_DEPARTMENT = {
  ITDT:                 ["hs_pending", "uploads", "momo_pending", "system", "observability"],
  Accounting:           ["yuan_payment", "wallet", "forwarder"],
  Operations:           ["order", "forwarder", "sales"],
  Logistics:            ["forwarder"],
  "Freight Import":     ["forwarder"],
  "Freight Export":     ["forwarder"],
  "Customs Specialist": ["hs_pending", "order"],
  Marketing:            ["sales"],
  HR:                   [],
  Partner:              [],
  Pacred:               [],
};

/** หมวดที่ "ห้ามแจกมั่ว" — เห็นต้นทุน/กำไร/เงินของบริษัท ⇒ ต้องภูมติ๊กเอง ไม่แจกตามแผนก */
const SENSITIVE = new Set(["wallet", "yuan_payment", "observability", "system"]);

function defaultNotifyFor(department) {
  const base = DEFAULT_BY_DEPARTMENT[String(department || "").trim()] || [];
  return base.filter((k) => !SENSITIVE.has(k));
}

// ── ตัวช่วยเล็กๆ ────────────────────────────────────────────────────
const nowIso = () => new Date().toISOString();

/** อ่านไม่ได้เพราะคีย์ยังเป็น anon = บอกตรงๆ (ไม่ใช่ "ไม่มีพนักงาน") */
function explainDbError(err) {
  if (!err) return null;
  if (err.code === "42501" || /permission denied/i.test(err.message || "")) {
    return "ตารางทะเบียนพนักงานเข้าไม่ได้ — ต้องเปลี่ยน SUPABASE_KEY ของบอทเป็น service_role key";
  }
  if (err.code === "PGRST205") {
    return "ยังไม่มีตารางทะเบียนพนักงาน — เอา staff-schema.sql ไปรันใน Supabase ของบอทก่อน";
  }
  return err.message || "อ่านฐานของบอทไม่สำเร็จ";
}

/**
 * สร้างคลาส `StaffRegistry` — ผูกกับ supabase client ของบอท + ตัวถามเว็บ Pacred
 * @param {object} supabase  client ของบอท (ตัวเดียวกับที่ index.js สร้าง)
 * @param {(q: string, params?: object) => Promise<any>} pacredGet  ตัวถามเว็บ Pacred
 */
function createStaffRegistry(supabase, pacredGet) {
  // ── ผูกไลน์ ────────────────────────────────────────────────────────
  /** ไลน์ไอดีนี้คือใคร · null = ยังไม่ผูก */
  async function whoIs(lineUserId) {
    if (!lineUserId) return null;
    const { data, error } = await supabase
      .from("bot_staff").select("*").eq("line_user_id", lineUserId).maybeSingle();
    if (error) { console.error("[staff.whoIs]", explainDbError(error)); return null; }
    return data || null;
  }

  /**
   * 🚪 ด่านสิทธิ์ — เรียกก่อนทุกอย่างใน handleEvent
   * @returns {{ok: boolean, reason: string|null, staff: object|null}}
   */
  async function gate(lineUserId) {
    const staff = await whoIs(lineUserId);
    if (!staff) return { ok: false, reason: "not_linked", staff: null };
    if (!staff.active) return { ok: false, reason: "resigned", staff };
    return { ok: true, reason: null, staff };
  }

  // ── รหัสเชิญ ───────────────────────────────────────────────────────
  /** รูปรหัส: 2–6 ตัวอักษร - 4 ตัวเลข (เช่น BAM-7421) */
  const INVITE_RE = /^([A-Z]{2,6})-(\d{4})$/;

  function makeCode(login) {
    // เอาท้ายชื่อล็อกอินมาเป็นหัวรหัส ให้ภูมดูออกว่าของใคร (admin_bam → BAM)
    const tail = String(login || "").replace(/^admin[_-]?/i, "").replace(/[^A-Za-z]/g, "").toUpperCase();
    const head = (tail.slice(0, 4) || "PR").padEnd(2, "X");
    return `${head}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  }

  /** ออกรหัสเชิญให้พนักงาน 1 คน (ใช้ครั้งเดียว · หมดอายุตาม hours) */
  async function issueInvite(login, name, hours = 24) {
    const code = makeCode(login);
    const expires = new Date(Date.now() + hours * 3600_000).toISOString();
    const { error } = await supabase.from("bot_invite").insert({
      code, login, name: name || null, expires_at: expires,
    });
    if (error) throw new Error(explainDbError(error));
    return { code, expiresAt: expires };
  }

  /**
   * พิมพ์รหัสเชิญในไลน์ → ผูกบัญชี
   * @returns {{ok: boolean, message: string, staff?: object}}
   */
  async function redeemInvite(lineUserId, rawCode) {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!INVITE_RE.test(code)) return { ok: false, message: "รูปรหัสไม่ถูก — ต้องเป็นแบบ BAM-7421" };

    const { data: inv, error } = await supabase
      .from("bot_invite").select("*").eq("code", code).maybeSingle();
    if (error) return { ok: false, message: explainDbError(error) };
    if (!inv) return { ok: false, message: "ไม่พบรหัสนี้ — ขอรหัสใหม่จากผู้ดูแลบอท" };
    if (inv.used_at) return { ok: false, message: "รหัสนี้ถูกใช้ไปแล้ว — ขอรหัสใหม่" };
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { ok: false, message: "รหัสนี้หมดอายุแล้ว — ขอรหัสใหม่" };
    }

    // 🔎 ถามเว็บ Pacred ว่าคนนี้ยังทำงานอยู่ไหม + แผนก/ตำแหน่งอะไร (ของสดเสมอ)
    let person = null;
    try {
      const r = await pacredGet("staff", { all: 1 });
      person = (r?.staff?.rows || []).find((s) => s.login === inv.login) || null;
    } catch (e) {
      return { ok: false, message: "ถามเว็บ Pacred ไม่สำเร็จ ลองใหม่อีกครั้ง (" + (e.message || "") + ")" };
    }
    if (!person) return { ok: false, message: "ไม่พบพนักงานคนนี้ในระบบ Pacred แล้ว — แจ้งผู้ดูแลบอท" };
    if (!person.active) return { ok: false, message: "บัญชีพนักงานคนนี้ปิดอยู่ (ลาออก/ล็อก) — ใช้บอทไม่ได้" };

    // 🔒 1 คน = 1 ไลน์ · ผูกใหม่ = ทับของเดิม (เปลี่ยนเครื่อง/เปลี่ยนไลน์ได้)
    const { error: delErr } = await supabase.from("bot_staff").delete().eq("login", inv.login);
    if (delErr) return { ok: false, message: explainDbError(delErr) };

    const row = {
      line_user_id: lineUserId,
      login: person.login,
      code: person.code,
      name: person.name,
      nickname: person.nickname,
      department: person.department,
      position: person.position,
      roles: person.roles || [],
      active: true,
      notify: defaultNotifyFor(person.department),   // เดาให้ก่อน · ภูมติ๊กทับได้
      synced_at: nowIso(),
    };
    const { error: insErr } = await supabase.from("bot_staff").upsert(row, { onConflict: "line_user_id" });
    if (insErr) return { ok: false, message: explainDbError(insErr) };

    await supabase.from("bot_invite")
      .update({ used_at: nowIso(), used_by: lineUserId }).eq("code", code);

    return { ok: true, message: "ผูกบัญชีเรียบร้อย", staff: row };
  }

  // ── ซิงค์กับเว็บ ───────────────────────────────────────────────────
  /**
   * 🔄 กวาดทะเบียนให้ตรงกับเว็บ — ชื่อ/แผนก/ตำแหน่ง/สิทธิ์ + **ใครลาออกไปแล้ว**
   *
   * ภูม: *"ถ้าคนที่ออกไปแล้วมาพิมพ์อะไรในบอทก็ให้ขึ้นไม่มีสิทธิ์ใช้งานบอทไปเลย"*
   * ⇒ ตัวนี้ปิดธง `active` ให้ · ด่าน `gate()` เป็นคนบล็อกตอนเขาพิมพ์
   *
   * 🔒 อ่านเว็บไม่สำเร็จ = **ไม่แตะทะเบียนเลย** (เน็ตล่มครั้งเดียวแล้วตัดสิทธิ์ทั้งบริษัท = หายนะ)
   */
  async function syncFromPacred() {
    let rows = [];
    try {
      const r = await pacredGet("staff", { all: 1 });
      rows = r?.staff?.rows || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, message: "เว็บ Pacred ตอบทะเบียนว่าง — ไม่แตะอะไร (กันตัดสิทธิ์ทั้งบริษัท)" };
      }
    } catch (e) {
      return { ok: false, message: "ถามเว็บ Pacred ไม่สำเร็จ — ไม่แตะอะไร (" + (e.message || "") + ")" };
    }

    const byLogin = new Map(rows.map((s) => [s.login, s]));
    const { data: linked, error } = await supabase.from("bot_staff").select("*");
    if (error) return { ok: false, message: explainDbError(error) };

    let updated = 0, deactivated = 0, gone = 0;
    for (const cur of linked || []) {
      const web = byLogin.get(cur.login);
      if (!web) {
        // ไม่มีในทะเบียนเว็บแล้ว = ปิดไว้ก่อน (ไม่ลบ — ประวัติไม่ควรหาย)
        if (cur.active) {
          await supabase.from("bot_staff").update({ active: false, synced_at: nowIso() }).eq("line_user_id", cur.line_user_id);
          gone += 1;
        }
        continue;
      }
      const patch = {
        name: web.name, nickname: web.nickname, code: web.code,
        department: web.department, position: web.position,
        roles: web.roles || [], active: web.active, synced_at: nowIso(),
      };
      // 🔑 จำค่า "ก่อนเขียน" ไว้ก่อน — อย่าอ่าน cur หลัง update
      //    (ตัวนับ deactivated เคยได้ 0 เพราะอ่าน cur.active ที่ถูกทับไปแล้ว · เทสจับได้)
      const wasActive = cur.active === true;
      const changed =
        wasActive !== (web.active === true) || cur.name !== web.name ||
        cur.department !== web.department || cur.position !== web.position;
      if (!changed) continue;
      await supabase.from("bot_staff").update(patch).eq("line_user_id", cur.line_user_id);
      updated += 1;
      if (wasActive && !web.active) deactivated += 1;
    }
    return { ok: true, total: (linked || []).length, updated, deactivated, gone };
  }

  // ── ใครควรได้แจ้งเตือนหมวดนี้ ──────────────────────────────────────
  /** @returns {Promise<Array<{lineUserId: string, name: string}>>} */
  async function recipientsFor(category) {
    const { data, error } = await supabase
      .from("bot_staff").select("line_user_id,name,notify").eq("active", true);
    if (error) { console.error("[staff.recipientsFor]", explainDbError(error)); return []; }
    return (data || [])
      .filter((s) => Array.isArray(s.notify) && s.notify.includes(category))
      .map((s) => ({ lineUserId: s.line_user_id, name: s.name }));
  }

  /** ทะเบียนทั้งหมด (สำหรับหน้าจัดการ) */
  async function listLinked() {
    const { data, error } = await supabase
      .from("bot_staff").select("*").order("active", { ascending: false }).order("name");
    if (error) throw new Error(explainDbError(error));
    return data || [];
  }

  /** ติ๊กหมวดแจ้งเตือนให้คนหนึ่ง */
  async function setNotify(lineUserId, categories) {
    const clean = (categories || []).filter((c) => CATEGORY_KEYS.includes(c));
    const { error } = await supabase
      .from("bot_staff").update({ notify: clean }).eq("line_user_id", lineUserId);
    if (error) throw new Error(explainDbError(error));
    return clean;
  }

  /** ถอดคนออกจากบอท (เช่น ผูกผิดคน) */
  async function unlink(lineUserId) {
    const { error } = await supabase.from("bot_staff").delete().eq("line_user_id", lineUserId);
    if (error) throw new Error(explainDbError(error));
  }

  /** รายชื่อพนักงานจากเว็บ (สำหรับหน้าจัดการตอนออกรหัสเชิญ) */
  async function staffFromPacred(includeInactive = false) {
    const r = await pacredGet("staff", includeInactive ? { all: 1 } : {});
    return r?.staff || { rows: [], total: 0, activeCount: 0, inactiveCount: 0 };
  }

  /** รหัสเชิญที่ยังไม่ถูกใช้ + ยังไม่หมดอายุ */
  async function pendingInvites() {
    const { data, error } = await supabase
      .from("bot_invite").select("*").is("used_at", null)
      .gt("expires_at", nowIso()).order("created_at", { ascending: false });
    if (error) throw new Error(explainDbError(error));
    return data || [];
  }

  return {
    CATEGORIES, CATEGORY_KEYS, SENSITIVE, defaultNotifyFor,
    whoIs, gate, issueInvite, redeemInvite, INVITE_RE,
    syncFromPacred, recipientsFor, listLinked, setNotify, unlink,
    staffFromPacred, pendingInvites, explainDbError,
  };
}

module.exports = { createStaffRegistry, CATEGORIES, CATEGORY_KEYS };
