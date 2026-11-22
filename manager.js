// ============================================================
// 🧑‍💼 ศูนย์จัดการโกดัง — ตัวอ่าน/เขียนฐานของบอท (ภูม 2026-11-20)
//
// แอปแยกของหัวหน้าโกดัง — เก็บแค่สิ่งที่ภูมกรอกเอง (เช็คลิสต์ · ประเมินทีม · รถ · สมุดงาน)
// 🔒 ไม่แตะฐาน Pacred — ตารางของบอทล้วนๆ (ดู manager-schema.sql)
//
// 🔑 รับ supabase ของบอทมาจาก index.js (ไม่สร้าง client เอง — กฎเดียวกับ warehouse.js)
// ============================================================

const crypto = require("node:crypto");
/* 🔑 เช็คลิสต์มาจากที่เดียว — CHECK_KEYS กันคีย์แปลกปลอมเข้าฐาน · summarize = กติกานับที่จอใช้ตัวเดียวกัน */
const { CHECK_KEYS, summarize } = require("./manager-checklist");

/**
 * @param {object} supabase ลูกค้า Supabase **ของบอท** (service_role · ไม่ใช่ของ Pacred)
 */
function createManager(supabase) {
  /** ยังไม่ได้ลง SQL = บอกตรงๆ (ไม่ใช่พังเงียบ) — เทียบแบบเดียวกับ warehouse.isReady */
  async function isReady() {
    const { error } = await supabase.from("mgr_team").select("id").limit(1);
    if (!error) return true;
    if (isMissingSchema(error)) return false;
    throw new Error(error.message);
  }

  function isMissingSchema(error) {
    const code = String((error && error.code) || "");
    return (
      code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205" ||
      /does not exist|could not find|relation .* does not exist/i.test((error && error.message) || "")
    );
  }

  const SCHEMA_MSG =
    "ยังไม่ได้ลงตารางของศูนย์จัดการโกดัง — เปิด Supabase ของบอท → SQL Editor → วางไฟล์ manager-schema.sql แล้ว Run";

  /** throw ข้อความที่คนอ่านรู้เรื่อง (ยังไม่ลง SQL = บอกให้ไปลง · อย่างอื่น = ข้อความจริง) */
  function boom(error) {
    throw new Error(isMissingSchema(error) ? SCHEMA_MSG : error.message);
  }

  const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

  /* ── เช็คลิสต์ความปลอดภัย (ต่อวัน) ─────────────────────────────── */

  /** YYYY-MM-DD เท่านั้น — กันคีย์วันแปลกๆ เข้าฐาน */
  function normDay(day) {
    const d = clip(day, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("รูปแบบวันไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
    return d;
  }

  async function getChecklist(day) {
    const d = normDay(day);
    const { data, error } = await supabase
      .from("mgr_checklist")
      .select("day,checks,notes,pallet,photos,share_token,updated_by,updated_at")
      .eq("day", d).maybeSingle();
    if (error) boom(error);
    if (!data) return { day: d, checks: {}, notes: {}, pallet: "", photos: [], share_token: null };
    /* notes เป็น null ได้ในแถวเก่าที่ลงก่อนเพิ่มคอลัมน์ ⇒ ยืนให้เป็น {} เสมอ (จอวนลูปได้เลย) */
    return Object.assign({}, data, {
      checks: data.checks && typeof data.checks === "object" ? data.checks : {},
      notes: data.notes && typeof data.notes === "object" ? data.notes : {},
      photos: Array.isArray(data.photos) ? data.photos : [],
    });
  }

  /**
   * ประวัติเช็คลิสต์ย้อนหลัง (ภูม 2026-11-21 — *"มีประวัติให้กลับไปย้อนดูได้"*)
   *
   * คืน **สรุปต่อวัน** ไม่เอา checks/photos ทั้งก้อนมาในลิสต์ (รูป data URL ก้อนใหญ่ —
   * ดึง 60 วันพร้อมรูปคือหลายสิบ MB) ⇒ กดวันไหนค่อยเรียก getChecklist ของวันนั้น.
   */
  async function listChecklistDays(limit) {
    const n = Math.max(1, Math.min(Math.round(Number(limit) || 60), 365));
    const { data, error } = await supabase
      .from("mgr_checklist")
      .select("day,checks,notes,pallet,updated_by,updated_at")
      .order("day", { ascending: false })
      .limit(n);
    if (error) boom(error);
    return (data || []).map((r) => {
      const c = r && r.checks && typeof r.checks === "object" ? r.checks : {};
      const n = r && r.notes && typeof r.notes === "object" ? r.notes : {};
      /* 🔑 นับด้วยกติกาตัวเดียวกับที่จอใช้ (manager-checklist.summarize) ⇒ เลขในลิสต์
       *    ตรงกับเลขที่กดเข้าไปดูเสมอ · issue = มีหมายเหตุแต่ยังไม่ติ๊ก (ไม่นับซ้ำกับ done) */
      const sm = summarize(c, n);
      return {
        day: r.day,
        done: sm.ok,
        issues: sm.issue,
        checked: sm.checked,
        total: sm.total,
        pallet: r.pallet || "",
        updated_by: r.updated_by || "",
        updated_at: r.updated_at || null,
      };
    });
  }

  /** เพดานรูปหลักฐานต่อวัน — กันแถวบวม (ดู manager-schema.sql) */
  const MAX_PHOTOS = 3;
  const MAX_PHOTO_LEN = 1_500_000;

  /** รูปหลักฐาน: data URL เท่านั้น · เกินเพดาน = ปฏิเสธพร้อมบอกเหตุ (ไม่ตัดเงียบ) */
  function normPhotos(photos) {
    if (photos === undefined) return undefined;
    if (photos === null) return [];
    if (!Array.isArray(photos)) throw new Error("รูปหลักฐานต้องเป็นรายการ");
    if (photos.length > MAX_PHOTOS) throw new Error("แนบรูปได้ไม่เกิน " + MAX_PHOTOS + " รูปต่อวัน");
    return photos.map((p) => {
      const s = String(p == null ? "" : p);
      if (!/^data:image[/]/.test(s)) throw new Error("ไฟล์รูปไม่ถูกต้อง");
      if (s.length > MAX_PHOTO_LEN) throw new Error("รูปใหญ่เกินไป (บีบรูปก่อนอัป)");
      return s;
    });
  }

  /** ความยาวหมายเหตุต่อข้อ — พอเขียนว่าเกิดอะไรขึ้น ไม่ใช่เรียงความ */
  const MAX_NOTE_LEN = 300;

  /**
   * หมายเหตุรายข้อ (ภูม 2026-11-21 — *"วันนี้มีคนขับรถชนตัวกั้นชั้นวางบุบ … ตรงช่องติ๊กชั้นวาง
   * มันควรมีให้ใส่หมายเหตุด้วย"*) · รูปร่าง { shelf: "คนขับชนตัวกั้น ชั้นวางบุบ" }
   *
   * กติกา: ไม่ส่งมา = ไม่แตะของเดิม · null = ล้างทั้งหมด · ข้อความว่าง = ลบหมายเหตุข้อนั้น
   * 🔑 คีย์ที่ไม่มีในเช็คลิสต์ = ทิ้งเงียบ (ตั้งใจ) — เกิดได้จากแท็บเก่าที่ค้างอยู่หลังเลิกใช้ข้อนั้น
   *    ⇒ ข้อที่ไม่มีอยู่แล้ว ไม่ควรทำให้บันทึกทั้งวันล้ม
   */
  function normNotes(notes) {
    if (notes === undefined) return undefined;
    if (notes === null) return {};
    if (typeof notes !== "object" || Array.isArray(notes)) throw new Error("หมายเหตุไม่ถูกต้อง");
    const out = {};
    for (const k of Object.keys(notes)) {
      if (!CHECK_KEYS.includes(k)) continue;
      const v = clip(notes[k], MAX_NOTE_LEN);
      if (v) out[k] = v;
    }
    return out;
  }

  async function saveChecklist(day, checks, pallet, who, photos, notes) {
    const ph = normPhotos(photos);
    const nt = normNotes(notes);
    const row = {
      day: normDay(day),
      checks: checks && typeof checks === "object" ? checks : {},
      pallet: pallet == null ? null : clip(pallet, 20),
      ...(ph === undefined ? {} : { photos: ph }),
      ...(nt === undefined ? {} : { notes: nt }),
      updated_by: clip(who, 40) || "หัวหน้า",
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("mgr_checklist").upsert(row, { onConflict: "day" });
    if (error) boom(error);
    return { ok: true };
  }

  /* ── 🔗 ลิงก์ส่งเจ้านาย (ภูม 2026-11-21) ─────────────────────────
   *
   * ภูม: *"กดออกลิงค์ฟอร์มลิสที่ตรวจไปส่งพี่ป๊อปได้ พี่ป๊อปสามารถกดดูรูปที่แนบเป็นหลักฐานได้ด้วย"*
   *
   * 🔒 **ห้ามใช้คีย์หัวหน้า (MANAGER_KEY) เป็นทางเข้าของเจ้านาย** — คีย์นั้นเปิดได้ทั้งแอป
   *    รวม **คะแนนประเมินพนักงาน** ⇒ ลิงก์ที่ส่งต่อกันต้องเป็นโทเคนคนละใบ
   *    ที่เปิดได้ **แค่เช็คลิสต์วันนั้นวันเดียว อ่านอย่างเดียว** (ดู manager-share.js)
   * 🔑 1 วัน = 1 โทเคน · กด "ออกลิงก์ใหม่" = เปลี่ยนโทเคน ⇒ **ลิงก์เดิมใช้ไม่ได้ทันที** (= ปุ่มปิดลิงก์)
   * 🔑 ลิงก์โชว์ของสดของวันนั้น (ติ๊กเพิ่มทีหลัง เจ้านายกดดูก็เห็นของใหม่) — ไม่ได้ถ่ายสำเนาไว้
   */

  /** 18 ไบต์สุ่ม = 24 ตัวอักษร เดาไม่ได้ (base64url ⇒ ไม่มีอักขระที่ต้อง encode ใน URL) */
  function newToken() {
    return crypto.randomBytes(18).toString("base64url");
  }

  /** เขียนโทเคนของวันนั้น — ตั้งใจ **ไม่แตะ updated_at/updated_by** (ออกลิงก์ ≠ แก้เช็คลิสต์) */
  async function writeShareToken(day, token) {
    const { error } = await supabase
      .from("mgr_checklist").upsert({ day, share_token: token }, { onConflict: "day" });
    if (error) boom(error);
    return token;
  }

  /** มีลิงก์อยู่แล้ว = ใช้ใบเดิม (กดซ้ำไม่ทำให้ลิงก์ที่ส่งไปแล้วตาย) */
  async function ensureShareToken(day) {
    const d = normDay(day);
    const cur = await getChecklist(d);
    if (cur.share_token) return { day: d, token: cur.share_token, created: false };
    return { day: d, token: await writeShareToken(d, newToken()), created: true };
  }

  /** ออกใบใหม่ = ใบเก่าใช้ไม่ได้ทันที */
  async function rotateShareToken(day) {
    const d = normDay(day);
    return { day: d, token: await writeShareToken(d, newToken()), created: true };
  }

  /**
   * อ่านด้วยโทเคน — ทางเข้าของหน้าที่เจ้านายเปิด (ไม่ต้องมีคีย์)
   * คืน null = ไม่มีลิงก์นี้ (ถูกออกใบใหม่ทับ หรือพิมพ์ผิด) ⇒ หน้าโชว์ "ลิงก์นี้ใช้ไม่ได้แล้ว"
   * 🔒 คืนแค่ช่องของเช็คลิสต์วันนั้น — ไม่มีทีม/รถ/สมุดงาน และไม่คืนตัวโทเคนกลับไป
   */
  async function getShared(token) {
    /* 🪤 ห้าม clip ก่อนตรวจ — ตัดให้สั้นลงแล้วค่อยตรวจ = ของยาวมั่วๆ ผ่านด่านไปถามฐานได้
     *    ความยาวที่รับได้อยู่ในตัวรูปแบบแล้ว (16–64 ตัว) ⇒ ไม่เข้ารูป = ไม่ถามฐานเลย */
    const t = String(token == null ? "" : token).trim();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return null;
    const { data, error } = await supabase
      .from("mgr_checklist")
      .select("day,checks,notes,pallet,photos,updated_by,updated_at")
      .eq("share_token", t).maybeSingle();
    if (error) boom(error);
    if (!data) return null;
    return Object.assign({}, data, {
      checks: data.checks && typeof data.checks === "object" ? data.checks : {},
      notes: data.notes && typeof data.notes === "object" ? data.notes : {},
      photos: Array.isArray(data.photos) ? data.photos : [],
    });
  }

  /* ── ทีมที่ประเมิน ─────────────────────────────────────────────── */

  async function listTeam() {
    const { data, error } = await supabase
      .from("mgr_team").select("*").order("created_at", { ascending: true }).limit(500);
    if (error) boom(error);
    return data || [];
  }

  async function addTeam(name) {
    const nm = clip(name, 80);
    if (!nm) throw new Error("ยังไม่ได้ใส่ชื่อ");
    const { data, error } = await supabase
      .from("mgr_team").insert({ name: nm, stars: 0 }).select().single();
    if (error) boom(error);
    return data;
  }

  async function updateTeam(id, patch) {
    const p = {};
    if (patch && patch.name !== undefined) p.name = clip(patch.name, 80);
    if (patch && patch.stars !== undefined) {
      const s = Math.max(0, Math.min(5, Math.round(Number(patch.stars) || 0)));
      p.stars = s;
    }
    if (!Object.keys(p).length) return { ok: true };
    const { data, error } = await supabase
      .from("mgr_team").update(p).eq("id", clip(id, 40)).select().single();
    if (error) boom(error);
    return data;
  }

  async function deleteTeam(id) {
    const { error } = await supabase.from("mgr_team").delete().eq("id", clip(id, 40));
    if (error) boom(error); // โน้ตหายตามเอง (on delete cascade)
    return { ok: true };
  }

  async function listNotes(memberId) {
    const { data, error } = await supabase
      .from("mgr_team_note").select("*")
      .eq("member_id", clip(memberId, 40))
      .order("created_at", { ascending: false }).limit(300);
    if (error) boom(error);
    return data || [];
  }

  async function addNote(memberId, body) {
    const b = clip(body, 500);
    if (!b) throw new Error("ยังไม่ได้พิมพ์โน้ต");
    const { data, error } = await supabase
      .from("mgr_team_note").insert({ member_id: clip(memberId, 40), body: b }).select().single();
    if (error) boom(error);
    return data;
  }

  async function deleteNote(id) {
    const { error } = await supabase.from("mgr_team_note").delete().eq("id", clip(id, 40));
    if (error) boom(error);
    return { ok: true };
  }

  /* ── ทะเบียนรถ / ใบขับขี่ ───────────────────────────────────────── */

  async function listTrucks() {
    const { data, error } = await supabase
      .from("mgr_truck").select("*").order("created_at", { ascending: true }).limit(200);
    if (error) boom(error);
    return data || [];
  }

  async function addTruck(name) {
    const nm = clip(name, 60);
    if (!nm) throw new Error("ยังไม่ได้ใส่ชื่อรถ");
    const { data, error } = await supabase
      .from("mgr_truck").insert({ name: nm, person: "" }).select().single();
    if (error) boom(error);
    return data;
  }

  async function updateTruck(id, patch) {
    const p = {};
    if (patch && patch.name !== undefined) p.name = clip(patch.name, 60);
    if (patch && patch.person !== undefined) p.person = clip(patch.person, 80);
    if (patch && patch.license_photo !== undefined) {
      /* รูปใบขับขี่ = data URL ที่เว็บบีบมาแล้ว · null = เอารูปออก */
      const v = patch.license_photo;
      if (v === null || v === "") p.license_photo = null;
      else {
        const s = String(v);
        if (!/^data:image\//.test(s)) throw new Error("ไฟล์รูปไม่ถูกต้อง");
        if (s.length > 7_000_000) throw new Error("รูปใหญ่เกินไป (บีบรูปก่อนอัป)");
        p.license_photo = s;
      }
    }
    if (!Object.keys(p).length) return { ok: true };
    const { data, error } = await supabase
      .from("mgr_truck").update(p).eq("id", clip(id, 40)).select().single();
    if (error) boom(error);
    return data;
  }

  async function deleteTruck(id) {
    const { error } = await supabase.from("mgr_truck").delete().eq("id", clip(id, 40));
    if (error) boom(error);
    return { ok: true };
  }

  /* ── สมุดงานหัวหน้า ─────────────────────────────────────────────── */

  async function listTasks() {
    const { data, error } = await supabase
      .from("mgr_task").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) boom(error);
    return data || [];
  }

  async function addTask(body) {
    const b = clip(body, 300);
    if (!b) throw new Error("ยังไม่ได้พิมพ์งาน");
    const { data, error } = await supabase
      .from("mgr_task").insert({ body: b, done: false }).select().single();
    if (error) boom(error);
    return data;
  }

  async function updateTask(id, patch) {
    const p = {};
    if (patch && patch.body !== undefined) p.body = clip(patch.body, 300);
    if (patch && patch.done !== undefined) {
      p.done = !!patch.done;
      p.done_at = p.done ? new Date().toISOString() : null;
    }
    if (!Object.keys(p).length) return { ok: true };
    const { data, error } = await supabase
      .from("mgr_task").update(p).eq("id", clip(id, 40)).select().single();
    if (error) boom(error);
    return data;
  }

  async function deleteTask(id) {
    const { error } = await supabase.from("mgr_task").delete().eq("id", clip(id, 40));
    if (error) boom(error);
    return { ok: true };
  }

  return {
    isReady,
    getChecklist, saveChecklist, listChecklistDays,
    ensureShareToken, rotateShareToken, getShared,
    listTeam, addTeam, updateTeam, deleteTeam,
    listNotes, addNote, deleteNote,
    listTrucks, addTruck, updateTruck, deleteTruck,
    listTasks, addTask, updateTask, deleteTask,
  };
}

module.exports = { createManager };
