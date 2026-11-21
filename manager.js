// ============================================================
// 🧑‍💼 ศูนย์จัดการโกดัง — ตัวอ่าน/เขียนฐานของบอท (ภูม 2026-11-20)
//
// แอปแยกของหัวหน้าโกดัง — เก็บแค่สิ่งที่ภูมกรอกเอง (เช็คลิสต์ · ประเมินทีม · รถ · สมุดงาน)
// 🔒 ไม่แตะฐาน Pacred — ตารางของบอทล้วนๆ (ดู manager-schema.sql)
//
// 🔑 รับ supabase ของบอทมาจาก index.js (ไม่สร้าง client เอง — กฎเดียวกับ warehouse.js)
// ============================================================

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
      .select("day,checks,pallet,photos,updated_by,updated_at")
      .eq("day", d).maybeSingle();
    if (error) boom(error);
    return data || { day: d, checks: {}, pallet: "", photos: [] };
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
      .select("day,checks,pallet,updated_by,updated_at")
      .order("day", { ascending: false })
      .limit(n);
    if (error) boom(error);
    return (data || []).map((r) => {
      const c = r && r.checks && typeof r.checks === "object" ? r.checks : {};
      return {
        day: r.day,
        done: Object.keys(c).filter((k) => c[k]).length,
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

  async function saveChecklist(day, checks, pallet, who, photos) {
    const ph = normPhotos(photos);
    const row = {
      day: normDay(day),
      checks: checks && typeof checks === "object" ? checks : {},
      pallet: pallet == null ? null : clip(pallet, 20),
      ...(ph === undefined ? {} : { photos: ph }),
      updated_by: clip(who, 40) || "หัวหน้า",
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("mgr_checklist").upsert(row, { onConflict: "day" });
    if (error) boom(error);
    return { ok: true };
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
    listTeam, addTeam, updateTeam, deleteTeam,
    listNotes, addNote, deleteNote,
    listTrucks, addTruck, updateTruck, deleteTruck,
    listTasks, addTask, updateTask, deleteTask,
  };
}

module.exports = { createManager };
