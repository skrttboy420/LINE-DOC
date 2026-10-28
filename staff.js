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

/**
 * หมวดแจ้งเตือน — ไล่ใหม่ทั้งชุด 2026-10-21 (ภูมสั่ง)
 *
 * 🔴 ชุดเดิมตั้งชื่อตาม "พื้นที่งาน" (งานฝากนำเข้า · ระบบ · สุขภาพระบบ)
 *    ภูม: *"ภูมิอ่านหมวดแจ้งเตือนแล้ว บางหมวดก็งงว่ามันคือแจ้งเตือนอะไร"*
 *    + วัดแล้วมี **แค่ 2 หมวดที่ยิงจริง** (hs_pending · system) อีก 8 เป็นสวิตช์เปล่า
 *    ⇒ ตั้งชื่อใหม่ตาม **"ใครได้ + ตอนไหน"** และเหลือเฉพาะหมวดที่ต่อท่อแล้วจริง
 *
 * `group` = หัวข้อบนหน้าจัดการสิทธิ์ (จัดกลุ่มให้อ่านง่าย)
 * `scope` = "customer" เห็นเฉพาะลูกค้าที่ตัวเองดูแล · "all" เห็นทั้งหมด
 */
const CATEGORIES = [
  // 🧑‍💼 เซล/CS — แยกตามทะเบียนลูกค้า (adminIDSale / adminIDCS)
  { key: "arrive_cn", group: "📦 งานคลัง", scope: "customer",
    label: "ของลูกค้าถึงโกดังจีน",   hint: "ฝากนำเข้าเข้าสถานะ 'ถึงโกดังจีนแล้ว' — รวมเป็นรอบทุก 5 นาที" },
  { key: "arrive_th", group: "📦 งานคลัง", scope: "customer",
    label: "ของลูกค้าถึงไทยแล้ว",    hint: "ฝากนำเข้าเข้าสถานะ 'ถึงไทยแล้ว' — ตรวจข้อมูลแล้วเรียกเก็บเงินได้" },

  // 🎧 CS — ฝากสั่งซื้อ
  { key: "shop_pay",  group: "🎧 ฝากสั่งซื้อ", scope: "customer",
    label: "ออเดอร์เข้า รอชำระเงิน",   hint: "ตอบพิกัดเสร็จแล้ว — CS ไปเก็บเงิน + แนบสลิป" },
  { key: "shop_ship", group: "🎧 ฝากสั่งซื้อ", scope: "customer",
    label: "บัญชีโอนหยวนแล้ว · รอร้านจีนจัดส่ง",
    hint: "บัญชีลงต้นทุน + แนบสลิปโอนหยวนครบ → งานเด้งจาก 'โอนหยวน/สลิปจีน' มาเอง — CS แจ้งลูกค้าได้เลย" },

  // 🧾 บัญชี — เห็นทั้งหมด (งานบัญชีไม่ได้แบ่งตามลูกค้า)
  { key: "acc_yuan", group: "🧾 บัญชี", scope: "all",
    label: "ฝากสั่งเข้า โอนหยวน/สลิปจีน", hint: "บัญชีลงต้นทุน + แนบสลิปโอนหยวน" },
  { key: "acc_slip", group: "🧾 บัญชี", scope: "all",
    label: "รอตรวจสลิป (ทุกบริการ)",     hint: "ฝากโอน · ฝากสั่ง · ฝากนำเข้า · มัดจำ Booking" },
  { key: "acc_wht",  group: "🧾 บัญชี", scope: "all",
    label: "รอตรวจใบหัก ณ ที่จ่าย",      hint: "ลูกค้าแนบใบ 50 ทวิ มาแล้ว — ตรวจรับเพื่อปลดล็อกใบเสร็จ" },
  { key: "acc_cnt",  group: "🧾 บัญชี", scope: "all",
    label: "ตู้ยิงรับครบแล้ว",            hint: "โกดังยิงรับครบทุกกล่อง — ตรวจตู้ได้ · ตัดตู้ที่ลงจ่ายค่าตู้แล้วออก" },

  // 📦 โกดัง (ภูม 2026-10-27) — ตู้เดียวกับ acc_cnt แต่ไม่ตัดตู้ที่จ่ายค่าตู้แล้ว
  { key: "wh_cnt",   group: "📦 งานคลัง", scope: "all",
    label: "ตู้ยิงเข้าโกดังครบ",          hint: "ยิงรับครบทุกกล่องในตู้แล้ว — ปิดงานตู้นั้นได้" },

  // 🧰 งานทีมระบบ (ITDT)
  { key: "hs_pending",  group: "🧰 ทีมระบบ", scope: "all",
    label: "ออเดอร์รอตอบพิกัด",  hint: "ออเดอร์ที่ยังไม่มีพิกัด — คิวเดียวกับปุ่ม รอตอบพิกัด" },
  { key: "track_stuck", group: "🧰 ทีมระบบ", scope: "all",
    label: "แทรครออัพเข้าระบบ",   hint: "MOMO sync มาแล้วแต่ยังไม่ได้นำเข้า — บอกเหตุผลรายแทรค (รอน้ำหนัก/รอขนาด)" },
  /* 🔴 ภูม 2026-10-28 — *"แทรคกิ้งมันตกหล่นไปได้ยังไง … แทรค -4 และ -5 หายไป"*
     คนละเรื่องกับ track_stuck: อันนั้น "ยังไม่ได้นำเข้า (เห็นในคิว)" · อันนี้ "ธงบอกว่าเข้าแล้ว
     แต่ของไม่ครบ" ⇒ **ไม่โผล่ในคิวเลย** = ของหายเงียบ + เก็บเงินขาด */
  { key: "lots_missing", group: "🧰 ทีมระบบ", scope: "all",
    label: "ของขาดจากที่ MOMO แจ้ง",
    hint: "ธงบอกว่าเข้าระบบแล้ว แต่ Σ กล่อง/น้ำหนัก ในระบบไม่ครบตามที่ MOMO ประกาศ — เก็บเงินขาด ต้องไปเติมแถวเอง" },
  { key: "pw_sheet",    group: "🧰 ทีมระบบ", scope: "all",
    label: "แทรคเข้าชีต PW ไม่ได้",
    hint: "ส่งเข้าชีตพาร์ทเนอร์ไม่สำเร็จ + เหตุผลจริง (ไม่มีรหัสลูกค้าปลายทาง · ช่องทางที่ชีตไม่มี ฯลฯ)" },
  { key: "system",      group: "🧰 ทีมระบบ", scope: "all",
    label: "ระบบมีปัญหา",        hint: "ท่อดันหาบอทพัง ฯลฯ — ยังไม่มีตัวนับในปุ่ม งานค้าง" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/**
 * 💡 ชุดเริ่มต้น — "เดาให้ก่อน แล้วภูมติ๊กทับได้"
 *
 * 🔄 **2026-10-27 เปลี่ยนจาก "ตามแผนก" → "ตามตำแหน่งในผัง"** (ภูมเคาะ)
 *
 * ทำไม: แผนกเดียวกันหน้าที่คนละเรื่องกันเลย — 📏 วัดผังจริง prod 27/10 (ทำงานอยู่ 32 คน):
 *   · **Operations 9 คน = 4 ตำแหน่ง** → Customer Service (พลอย) · Pricing (มาร์ค · เว็บ) ·
 *     Purchasing (มะนาว) · Sales (ใบเฟิร์น · แบม · บุษ · เมย์)
 *     ⇒ ของเดิมแจก `shop_pay · shop_ship · arrive_th` ให้ **ทั้ง 9 คนเท่ากัน**:
 *       มาร์ค/เว็บ (ตั้งราคา) ได้คิวเก็บเงินของ CS · มะนาว (จัดซื้อ) ได้ของถึงไทยของเซล
 *   · **Logistics 7 คน = Driver 4 + Warehouse 3** ⇒ คนขับได้ "ของถึงโกดังจีน" ทั้งที่ไม่เกี่ยวเลย
 *
 * 🔑 ยังเป็นแค่ค่าเริ่มต้นเหมือนเดิม ไม่ใช่กติกาตายตัว — ภูมติ๊กทับได้ทุกคน
 *    (ภูม: *"บัญชียังมีฝั่งรับกับฝั่งจ่ายซึ่งมันจะแจ้งเตือนต่างกัน"* — ผังมีแค่ Admin Accounting
 *     ตำแหน่งเดียว ⇒ แยกรับ/จ่ายจากตำแหน่งไม่ได้ ต้องติ๊กเอง · เหมือนเดิมทุกประการ)
 *
 * 🪜 ถ้าตำแหน่งไม่อยู่ในตาราง (ตำแหน่งใหม่ · ยังไม่ผูกตำแหน่ง) → **ถอยไปใช้ของแผนก**
 *    (ตารางล่าง) ⇒ คนใหม่ไม่เคยได้ศูนย์หมวดเงียบๆ
 */
const DEFAULT_BY_POSITION = {
  // ── 🎧 Operations — 4 ตำแหน่ง คนละงานกัน ────────────────────────────
  "Customer Service":    ["shop_ship", "arrive_th"],          // แจ้งลูกค้า: ร้านจีนส่งแล้ว · ของถึงไทย
  Sales:                 ["arrive_cn", "arrive_th"],          // ของลูกค้าตัวเองเดินถึงไหน (scope=customer อยู่แล้ว)
  Purchasing:            ["shop_pay"],                        // ออเดอร์ตอบพิกัดแล้ว รอเก็บเงิน → สั่งซื้อ
  Pricing:               [],                                  // งานเรท/Booking ยังไม่มีหมวด — ติ๊กเองถ้าต้องการ

  // ── 🚚 Logistics — คนขับ vs โกดัง คนละเรื่อง ────────────────────────
  Warehouse:             ["arrive_th", "wh_cnt"],             // ของเข้าโกดังไทย + ตู้ที่ยิงรับครบ (คิวของโกดังเอง)
  Driver:                [],                                  // งานส่งในประเทศยังไม่มีหมวดในบอท

  // ── 🧾 บัญชี ────────────────────────────────────────────────────────
  "Admin Accounting":    ["acc_yuan", "acc_slip", "acc_wht", "acc_cnt"],
  "Accounting Supervisor": ["acc_yuan", "acc_slip", "acc_wht", "acc_cnt"],

  // ── 🧰 ทีมระบบ (ITDT) ───────────────────────────────────────────────
  "Front End":           ["hs_pending", "track_stuck", "lots_missing", "pw_sheet"],
  "Back End":            ["hs_pending", "track_stuck", "lots_missing", "pw_sheet"],
  "Full Stack":          ["hs_pending", "track_stuck", "lots_missing", "pw_sheet"],
  "Project Manager":     ["hs_pending", "track_stuck", "lots_missing", "pw_sheet"],

  // ── 🛃 พิธีการ / เอกสาร ─────────────────────────────────────────────
  Supervisor:            ["hs_pending"],                      // Customs Specialist — คิวรอตอบพิกัด
  "Doc Shipping Import": ["arrive_cn", "arrive_th"],          // ตามของเพื่อเตรียมเอกสาร

  // ── ที่เหลือ: ไม่เดาให้ (ติ๊กเองตามที่อยากได้) ───────────────────────
  CEO:                   [],
  "Data Analyst":        [],
  "Graphic/Editing":     [],
  PCS:                   [],
};

/** ถอยไปใช้ของแผนก เมื่อตำแหน่งยังไม่อยู่ในตารางข้างบน (คนใหม่ · ตำแหน่งใหม่) */
const DEFAULT_BY_DEPARTMENT = {
  /* 🔄 2026-10-22 ภูม: *"ของภูมิ ก็แสดงทั้ง งานรอตอบพิกัด · งานอัพแทรคเข้าระบบ"*
     เดิมแจก "system" ซึ่ง**ไม่มีตัวนับงานค้าง** ⇒ กดปุ่มแล้วขึ้น "หมวดที่ติ๊กไว้ยังไม่มีตัวนับ" */
  ITDT:                 ["hs_pending", "track_stuck", "lots_missing", "pw_sheet"],
  Accounting:           ["acc_yuan", "acc_slip", "acc_wht", "acc_cnt"],
  Operations:           [],                     // 4 ตำแหน่งคนละงาน — เดาจากแผนกไม่ได้ (ดูตารางตำแหน่ง)
  Logistics:            [],                     // คนขับ vs โกดัง คนละเรื่อง
  "Freight Import":     ["arrive_cn", "arrive_th"],
  "Freight Export":     [],
  "Customs Specialist": ["hs_pending"],
  Marketing:            [],
  HR:                   [],
  Partner:              [],
  Pacred:               [],
};

/**
 * หมวดที่ "ห้ามแจกอัตโนมัติ" — ต้องภูมติ๊กเอง
 *
 * 🔄 2026-10-21 เหลือตัวเดียว: ชุดเดิมกันหมวดเงินไว้ทั้งก้อน เพราะค่าเริ่มต้นสมัยนั้นหยาบ
 *    (แจก "forwarder" ให้หลายแผนก) · ตอนนี้ค่าเริ่มต้นแยกตามแผนกชัดแล้ว —
 *    หมวด acc_* ให้เฉพาะแผนก Accounting ซึ่งเป็นงานของเขาเอง (ภูม: *"บัญชีจะงานเยอะมาก
 *    บางทีพนักงานทำงานตกหล่นไปเยอะเลย"*) ⇒ กันไว้ = บัญชีไม่ได้อะไรเลย ผิดเจตนา
 *    คงไว้แค่ `system` (เสียงรบกวนของ ITDT · คนอื่นได้ไปก็ไม่รู้จะทำอะไร)
 */
const SENSITIVE = new Set(["system"]);

/**
 * หมวดเริ่มต้นของคนคนนี้ — **ตำแหน่งก่อน แล้วค่อยถอยไปแผนก** (ภูม 2026-10-27)
 * @param {string|null} department แผนกในผัง
 * @param {string|null} [position] ตำแหน่งในผัง — ตัวตัดสินหลัก
 */
function defaultNotifyFor(department, position) {
  const pos = String(position || "").trim();
  const dep = String(department || "").trim();
  // ตำแหน่งที่ตั้งใจให้ว่าง ([]) ต้องชนะ ไม่ใช่ตกไปใช้ของแผนก ⇒ เช็คว่า "มีคีย์ไหม" ไม่ใช่ "ว่างไหม"
  const base = Object.prototype.hasOwnProperty.call(DEFAULT_BY_POSITION, pos)
    ? DEFAULT_BY_POSITION[pos]
    : DEFAULT_BY_DEPARTMENT[dep] || [];
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
      notify: defaultNotifyFor(person.department, person.position),   // เดาจากตำแหน่งก่อน · ภูมติ๊กทับได้
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
