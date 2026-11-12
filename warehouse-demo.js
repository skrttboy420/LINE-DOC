// ============================================================
// 🔬 จอโกดัง 3D — โหมดลองดู (ภูม 2026-11-12)
//
// เปิดดูหน้าตาได้เลย **โดยไม่ต้องมีฐาน ไม่ต้องต่อเว็บ Pacred**
// ใช้ข้อมูลตัวอย่างที่ครอบทุกสีที่จอต้องวาดได้
//
//   node warehouse-demo.js
//   → http://localhost:4599/warehouse?key=demo          (จอ 3D)
//   → http://localhost:4599/warehouse/assign?key=demo   (หน้าคีย์ตำแหน่ง)
//
// 🔒 ไม่เขียนอะไรลงฐานทั้งนั้น — กด "บันทึก" ในโหมดนี้ก็แค่ตอบ ok กลับมาเฉยๆ
// 🔑 index.js **ไม่ได้ require ไฟล์นี้** ⇒ บอทตัวจริงไม่มีทางเผลอเปิดโหมดลองดู
//
// อยากดูของจริง: ลง warehouse-schema.sql + ตั้ง WAREHOUSE_KEY แล้วเปิดที่บอทจริง
// (ดู SETUP-WAREHOUSE.md)
// ============================================================

process.env.WAREHOUSE_KEY = process.env.WAREHOUSE_KEY || "demo";

const express = require("express");
const { mergeView } = require("./warehouse");
const { mountWarehouse } = require("./warehouse-page");

const PORT = Number(process.env.PORT || 4599);
const now = () => new Date().toISOString();

/* ── ของตัวอย่างบนชั้น — จงใจให้ครบทุกสี ────────────────────────── */
const PLACEMENTS = [
  { tracking: "SF5147871049131", slot: "A0101-L", boxes: 2,  member_code: "PR622", placed_by: "ออม",  placed_at: now() },
  { tracking: "SF5141868962437", slot: "A0101-R", boxes: 1,  member_code: "PR622", placed_by: "ออม",  placed_at: now() },
  { tracking: "1792477204-2",    slot: "B0502-L", boxes: 18, member_code: "PR722", placed_by: "เบียร์", placed_at: now() },
  { tracking: "772085135477267", slot: "B0502-R", boxes: 1,  member_code: "PR857", placed_by: "เบียร์", placed_at: now() },
  { tracking: "KY4001198485063", slot: "C0803-L", boxes: 1,  member_code: "PW",    placed_by: "เบียร์", placed_at: now() },
  { tracking: "SHIPPED-ALREADY", slot: "C1004-R", boxes: 1,  member_code: "PR179", placed_by: "ออม",  placed_at: now() },
  { tracking: "NOT-IN-SYSTEM",   slot: "A0304-L", boxes: 1,  member_code: null,    placed_by: "เบียร์", placed_at: now() },
  { tracking: "CREDIT-NOT-HERE", slot: "B1001-R", boxes: 3,  member_code: "PW",    placed_by: "ออม",  placed_at: now() },
];

const JOBS = [
  /* 🟢 ชำระแล้ว + ถึงไทยแล้ว = หยิบได้ */
  { tracking: "SF5147871049131", memberCode: "PR622", status: 6, paid: true,  arrivedAt: "2026-11-11", boxes: 2,  container: "GZE261108-1" },
  { tracking: "SF5141868962437", memberCode: "PR622", status: 6, paid: true,  arrivedAt: "2026-11-11", boxes: 1,  container: "GZE261108-1" },
  /* 🟡 ยังไม่ชำระ = ห้ามหยิบ (กล่องที่พนักงานหยิบผิดจริง) */
  { tracking: "1792477204-2",    memberCode: "PR722", status: 5, paid: false, arrivedAt: "2026-11-12", boxes: 18, container: "GZS261101-2" },
  { tracking: "772085135477267", memberCode: "PR857", status: 5, paid: false, arrivedAt: "2026-11-11", boxes: 1,  container: "GZS261101-2" },
  { tracking: "KY4001198485063", memberCode: "PW",    status: 4, paid: false, arrivedAt: "2026-11-12", boxes: 1,  container: "GZE261110-1" },
  /* 🔴 ระบบบอกส่งแล้ว แต่ของยังอยู่บนชั้น = มีคนหยิบกล่องอื่นไปส่งแทน */
  { tracking: "SHIPPED-ALREADY", memberCode: "PR179", status: 7, paid: true,  arrivedAt: "2026-11-02", boxes: 1,  container: "GZS261020-1" },
  /* 🔴 งานเครดิตถูกดันเป็นสถานะ 6 ก่อนของถึงไทย ⇒ ต้องไม่เขียว */
  { tracking: "CREDIT-NOT-HERE", memberCode: "PW",    status: 6, paid: true,  arrivedAt: null,         boxes: 3,  container: null },
  /* 🔴 ชำระแล้วพร้อมส่ง แต่ยังไม่มีใครคีย์ช่อง ⇒ ขึ้นในรายการเตือน */
  { tracking: "READY-NO-SLOT-1", memberCode: "PR168",   status: 6, paid: true, arrivedAt: "2026-11-12", boxes: 1, container: "GZE261110-1" },
  { tracking: "READY-NO-SLOT-2", memberCode: "PR10634", status: 6, paid: true, arrivedAt: "2026-11-12", boxes: 4, container: "GZE261110-1" },
  /* ⬛ NOT-IN-SYSTEM ไม่อยู่ในลิสต์นี้โดยตั้งใจ = "มีของวาง แต่หาแทรคในระบบไม่เจอ" */
];

/** ตัวปลอม — หน้าตาเหมือน createWarehouse() ทุกอย่าง แต่ไม่แตะฐาน */
const demo = {
  isReady: async () => true,
  listPlacements: async () => PLACEMENTS,
  jobsFromPacred: async () => ({ jobs: JOBS, ok: true, at: now() }),
  view: async () =>
    Object.assign(mergeView(PLACEMENTS, JOBS), {
      live: { ok: true, at: now(), error: null },
      placedCount: PLACEMENTS.length,
    }),
  place: async (tracking, slot) => ({ ok: true, slot, label: slot, demo: true }),
  remove: async () => ({ ok: true, demo: true }),
  history: async () => [],
  find: async (q) =>
    PLACEMENTS.filter((p) =>
      (p.tracking + " " + (p.member_code || "") + " " + p.slot)
        .toUpperCase()
        .includes(String(q || "").toUpperCase()),
    ),
};

const app = express();
mountWarehouse(app, demo);
app.listen(PORT, () => {
  console.log("");
  console.log("🔬 โหมดลองดู (ข้อมูลตัวอย่าง · ไม่แตะฐาน)");
  console.log("   จอ 3D        → http://localhost:" + PORT + "/warehouse?key=demo");
  console.log("   คีย์ตำแหน่ง   → http://localhost:" + PORT + "/warehouse/assign?key=demo");
  console.log("   ปิด: Ctrl+C");
  console.log("");
});
