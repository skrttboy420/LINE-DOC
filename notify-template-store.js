// ============================================================
// 💾 ที่เก็บข้อความแจ้งเตือนที่แก้ไว้ — ภูม 2026-10-21
//
// 🔑 กติกาข้อ ① ของ notify-template.js: **ข้อความในโค้ดเป็นตัวสำรองเสมอ**
//    ⇒ ที่นี่ fail-SOFT ทุกทาง: อ่านไม่ได้ / ยังไม่ได้สร้างตาราง / ฐานล่ม
//       = คืน {} แล้วให้ตัวประกอบใช้ข้อความตั้งต้น · **ห้ามโยน** (ไม่งั้นแจ้งเตือนเงียบทั้งรอบ)
//
// ⏱ แคช 60 วินาที — ตัวแจ้งเตือนยิงทุก 5 นาที · หน้าจัดการกดดูบ่อยกว่านั้น
//    แก้แล้วล้างแคชทันที (ภูมกดเซฟแล้วกดดูตัวอย่างต้องเห็นของใหม่)
// ============================================================

const { validateTemplate } = require("./notify-template");

const TABLE = "bot_notify_template";
const TTL_MS = 60 * 1000;

let cache = null;
let cacheAt = 0;
/** จำว่าตารางยังไม่มี — จะได้ไม่ยิงถามซ้ำทุกนาที (รีสตาร์ท/แก้แล้วค่อยลองใหม่) */
let tableMissing = false;

function createTemplateStore(supabase) {
  /** อ่านข้อความทั้งหมด — คืน {} เสมอเมื่อมีปัญหา (ตัวสำรองในโค้ดจะทำงานแทน) */
  async function loadAll() {
    const now = Date.now();
    if (cache && now - cacheAt < TTL_MS) return cache;
    if (tableMissing) return {};

    const { data, error } = await supabase.from(TABLE).select("key, head, line");
    if (error) {
      // 42P01 = ยังไม่ได้รัน notify-schema.sql ⇒ ไม่ใช่ความผิดพลาด แค่ยังไม่เปิดใช้
      if (String(error.code) === "42P01") {
        tableMissing = true;
        console.log("[notify-template] ยังไม่ได้สร้างตาราง — ใช้ข้อความตั้งต้น (รัน notify-schema.sql เพื่อเปิดการแก้ข้อความ)");
      } else {
        console.error("[notify-template] อ่านไม่ได้ ใช้ข้อความตั้งต้นแทน:", error.message);
      }
      return {};
    }

    const out = {};
    for (const r of data || []) {
      if (r && r.key) out[r.key] = { head: r.head, line: r.line };
    }
    cache = out;
    cacheAt = now;
    return out;
  }

  /** ตารางพร้อมใช้ไหม — หน้าจัดการเอาไปบอกภูมว่าต้องรัน SQL ก่อน */
  async function isReady() {
    await loadAll();
    return !tableMissing;
  }

  /**
   * เซฟข้อความของหมวดหนึ่ง — **ผ่านด่านก่อนเสมอ**
   * @returns {{ok:true}|{ok:false,message:string}}
   */
  async function save(key, head, line, by) {
    const v = validateTemplate(key, head, line);
    if (!v.ok) return v;

    const { error } = await supabase.from(TABLE).upsert(
      { key, head: String(head).trim(), line: String(line).trim(), updated_at: new Date().toISOString(), updated_by: by || null },
      { onConflict: "key" },
    );
    if (error) {
      if (String(error.code) === "42P01") {
        return { ok: false, message: "ยังไม่ได้สร้างตาราง — รัน notify-schema.sql ที่ Supabase ของบอทก่อน" };
      }
      return { ok: false, message: "บันทึกไม่สำเร็จ: " + error.message };
    }
    cache = null; // 🔑 กดเซฟแล้วต้องเห็นของใหม่ทันที
    tableMissing = false;
    return { ok: true };
  }

  /** คืนค่าเดิม = ลบแถวทิ้ง (ตัวประกอบจะกลับไปใช้ข้อความตั้งต้นเอง) */
  async function reset(key) {
    const { error } = await supabase.from(TABLE).delete().eq("key", key);
    if (error && String(error.code) !== "42P01") {
      return { ok: false, message: "คืนค่าเดิมไม่สำเร็จ: " + error.message };
    }
    cache = null;
    return { ok: true };
  }

  return { loadAll, isReady, save, reset };
}

module.exports = { createTemplateStore };
