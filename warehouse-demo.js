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
// 🔒 ไม่เขียนอะไรลงฐานทั้งนั้น — ของที่คีย์เก็บไว้ใน**หน่วยความจำ** ปิดโปรแกรมแล้วหาย
//
// 🪤 บทเรียน (ภูม 2026-11-12): รอบแรกผมทำ place() เป็นตัวหลอก ตอบ "บันทึกแล้ว" แต่ไม่เก็บอะไร
//    ภูมลองเพิ่มแทรคที่ 2 ลงพาเลทเดิม → จอยังโชว์แทรคเดียว → นึกว่าระบบรองรับได้ช่องละแทรค
//    = เขียวหลอก (กดแล้วขึ้นสำเร็จ แต่ไม่มีผล) ⇒ ตอนนี้เก็บจริง และติดป้าย "โหมดลองดู" ให้เห็นชัด
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
  { tracking: "1792477204-2",    slot: "B0205-L", boxes: 18, member_code: "PR722", placed_by: "เบียร์", placed_at: now() },
  { tracking: "772085135477267", slot: "B0205-R", boxes: 1,  member_code: "PR857", placed_by: "เบียร์", placed_at: now() },
  { tracking: "KY4001198485063", slot: "C0305-L", boxes: 1,  member_code: "PW",    placed_by: "เบียร์", placed_at: now() },
  { tracking: "SHIPPED-ALREADY", slot: "A0410-R", boxes: 1,  member_code: "PR179", placed_by: "ออม",  placed_at: now() },
  { tracking: "NOT-IN-SYSTEM",   slot: "A0403-L", boxes: 1,  member_code: null,    placed_by: "เบียร์", placed_at: now() },
  { tracking: "CREDIT-NOT-HERE", slot: "B0110-R", boxes: 3,  member_code: "PW",    placed_by: "ออม",  placed_at: now() },

  /* 🔴 ช่องเดียว 3 แทรค จาก 2 ลูกค้า (ภูม 2026-11-12 *"อยากเห็นภาพว่าพาเลทนึงมันมีหลายแทรคกิ้ง
     หลายรหัสลูกค้า จะทำยังไง"*) — 2 ใบของ PR930 ชำระแล้ว · 1 ใบของ PR455 ยังไม่ชำระ
     ⇒ ช่องต้องขึ้น **ส้ม** (เอาตัวแรงสุด) ไม่ใช่เขียวตามเสียงส่วนมาก */
  { tracking: "SF5160011122233", slot: "A0202-L", boxes: 4, member_code: "PR930", placed_by: "เบียร์", placed_at: now() },
  { tracking: "SF5160044455566", slot: "A0202-L", boxes: 2, member_code: "PR930", placed_by: "เบียร์", placed_at: now() },
  { tracking: "JT5577788899900", slot: "A0202-L", boxes: 1, member_code: "PR455", placed_by: "ออม",   placed_at: now() },
];

const JOBS = [
  /* 🟢 ชำระแล้ว + ถึงไทยแล้ว = หยิบได้ */
  { tracking: "SF5147871049131", memberCode: "PR622", status: 6, paid: true,  arrivedAt: "2026-11-11", boxes: 2,  container: "GZE261108-1",
    receiver: "สมชาย ใจดี", tel: "0812345678", carrier: "2",
    address: "99/12 ซอยลาดพร้าว 15 จอมพล จตุจักร กรุงเทพมหานคร 10900" },
  /* 🔴 ชำระแล้ว แต่ยังไม่มีที่อยู่จัดส่ง ⇒ ต้องไม่เขียว */
  { tracking: "SF5141868962437", memberCode: "PR622", status: 6, paid: true,  arrivedAt: "2026-11-11", boxes: 1,  container: "GZE261108-1",
    needsAddress: true, carrier: null, address: null },
  /* 🟡 ยังไม่ชำระ = ห้ามหยิบ (กล่องที่พนักงานหยิบผิดจริง) */
  { tracking: "1792477204-2",    memberCode: "PR722", status: 5, paid: false, arrivedAt: "2026-11-12", boxes: 18, container: "GZS261101-2",
    receiver: "ศิริพร วงศ์ทอง", tel: "0891112222", carrier: "55",
    address: "14 หมู่ 3 บางปลา บางพลี สมุทรปราการ 10540" },
  { tracking: "772085135477267", memberCode: "PR857", status: 5, paid: false, arrivedAt: "2026-11-11", boxes: 1,  container: "GZS261101-2" },
  { tracking: "KY4001198485063", memberCode: "PW",    status: 4, paid: false, arrivedAt: "2026-11-12", boxes: 1,  container: "GZE261110-1",
    needsAddress: true, carrier: null, address: null },
  /* 🔴 ระบบบอกส่งแล้ว แต่ของยังอยู่บนชั้น = มีคนหยิบกล่องอื่นไปส่งแทน */
  { tracking: "SHIPPED-ALREADY", memberCode: "PR179", status: 7, paid: true,  arrivedAt: "2026-11-02", boxes: 1,  container: "GZS261020-1" },
  /* 🔴 งานเครดิตถูกดันเป็นสถานะ 6 ก่อนของถึงไทย ⇒ ต้องไม่เขียว */
  { tracking: "CREDIT-NOT-HERE", memberCode: "PW",    status: 6, paid: true,  arrivedAt: null,         boxes: 3,  container: null },
  /* 🔴 ชำระแล้วพร้อมส่ง แต่ยังไม่มีใครคีย์ช่อง ⇒ ขึ้นในรายการเตือน */
  /* 🏬 ลูกค้ารับเองหน้าโกดัง — ไม่ต้องมีที่อยู่ส่ง */
  { tracking: "READY-NO-SLOT-1", memberCode: "PR168",   status: 6, paid: true, arrivedAt: "2026-11-12", boxes: 1, container: "GZE261110-1",
    selfPickup: true, carrier: "PCS", receiver: "รับที่โกดัง Pacred", tel: "0224213325",
    address: "48/2 หมู่ 12 อ้อมน้อย กระทุ่มแบน สมุทรสาคร 74130" },
  { tracking: "READY-NO-SLOT-2", memberCode: "PR10634", status: 6, paid: true, arrivedAt: "2026-11-12", boxes: 4, container: "GZE261110-1" },
  /* 📦 3 แทรคที่อยู่ช่องเดียวกัน (A0202-L) — คนละลูกค้า คนละสถานะ */
  { tracking: "SF5160011122233", memberCode: "PR930", status: 6, paid: true,  arrivedAt: "2026-11-10", boxes: 4, container: "GZE261105-2",
    receiver: "อนันต์ พานทอง", tel: "0867778888", carrier: "2",
    address: "222/8 ถนนสุขุมวิท 71 พระโขนงเหนือ วัฒนา กรุงเทพมหานคร 10110" },
  { tracking: "SF5160044455566", memberCode: "PR930", status: 6, paid: true,  arrivedAt: "2026-11-10", boxes: 2, container: "GZE261105-2",
    receiver: "อนันต์ พานทอง", tel: "0867778888", carrier: "2",
    address: "222/8 ถนนสุขุมวิท 71 พระโขนงเหนือ วัฒนา กรุงเทพมหานคร 10110" },
  { tracking: "JT5577788899900", memberCode: "PR455", status: 5, paid: false, arrivedAt: "2026-11-11", boxes: 1, container: "GZS261101-2",
    receiver: "กนกวรรณ แสงจันทร์", tel: "0923334444", carrier: "55",
    address: "7/119 หมู่ 5 คลองสาม คลองหลวง ปทุมธานี 12120" },

  /* ⬛ NOT-IN-SYSTEM ไม่อยู่ในลิสต์นี้โดยตั้งใจ = "มีของวาง แต่หาแทรคในระบบไม่เจอ" */
];

/* 🏭 โหมดลองดูมี 2 โกดังเหมือนของจริง (ภูม 2026-11-13) — ของเดิมทั้งหมดอยู่โกดัง 1 */
const WH_LIST = [{ id: "WH1", name: "โกดัง 1" }, { id: "WH2", name: "โกดัง 2" }];
const WH_NAME = (id) => (WH_LIST.find((w) => w.id === id) || {}).name || id;
const normWh = (x) => (WH_LIST.some((w) => w.id === String(x || "").toUpperCase())
  ? String(x).toUpperCase() : "WH1");

/* ของในโกดัง 2 — จงใจใช้ "ช่องเดียวกับโกดัง 1" เพื่อพิสูจน์ว่าของไม่ปนกัน */
const PLACEMENTS_WH2 = [
  { tracking: "SF5160011122233", slot: "A0101-L", boxes: 4, member_code: "PR930", placed_by: "แบม", placed_at: now(), wh: "WH2" },
  { tracking: "JT5577788899900", slot: "B0103-R", boxes: 1, member_code: "PR455", placed_by: "แบม", placed_at: now(), wh: "WH2" },
  { tracking: "NOCODE-SMALL-01", slot: "C0102-L", boxes: 1, member_code: null,    placed_by: "แบม", placed_at: now(), wh: "WH2" },
];

/* 🧺 กรงเหล็กตัวอย่าง — กรงชิ้นเล็ก (ฟ้า) ที่โกดัง 1 · กรง No-Code (ม่วง) ที่โกดัง 2 */
const CAGES = [
  { id: "WH1-B0205-L", wh: "WH1", slot: "B0205-L", kind: "small",  name: "กรงชิ้นเล็ก A1",  made_by: "ภูม", made_at: now() },
  { id: "WH2-C0102-L", wh: "WH2", slot: "C0102-L", kind: "nocode", name: "กรง No-Code 01", made_by: "ภูม", made_at: now() },
];

/* 📦 ของบนชั้นในโหมดลองดู — เก็บในหน่วยความจำ (เริ่มจากชุดตัวอย่างข้างบน) */
const shelf = PLACEMENTS.map((p) => Object.assign({ wh: "WH1" }, p)).concat(PLACEMENTS_WH2);
const LOG = [];
const { parseSlot, slotLabel } = require("./warehouse-layout");

/**
 * ตัวจำลอง — หน้าตาเหมือน createWarehouse() ทุกอย่าง แต่เก็บในหน่วยความจำแทนฐาน
 * 🔑 กติกาต้องเหมือนตัวจริงเป๊ะ ไม่งั้นลองแล้วได้ผลคนละอย่างกับของจริง:
 *    - 1 แทรคอยู่ได้ช่องเดียว (คีย์ซ้ำ = ย้ายช่อง)
 *    - 1 ช่องวางได้หลายแทรค
 *    - ช่องที่ไม่มีในผัง = ไม่รับ
 */
/* 🔒 โหมดลองดูต้องเลียนแบบ "ส่งแค่ธง" ของจริงด้วย (ภูม 2026-11-13)
   ไม่งั้นลองบนเดโมแล้วเห็นที่อยู่ครบทุกใบ นึกว่าของจริงก็เป็นแบบนั้น = ลองแล้วไม่ได้ลองจริง */
const stripContact = (j) => Object.assign({}, j, { address: null, receiver: null, tel: null });
const JOBS_FLAGS = JOBS.map(stripContact);

const demo = {
  isReady: async () => true,
  listPlacements: async () => shelf.slice(),
  jobsFromPacred: async (onShelf, detail) => {
    /* detail = [] ⇒ ขอแค่ธง · ไม่ส่ง detail ⇒ ของเดิม (ได้เต็ม) */
    const set = detail === undefined ? null : new Set((detail || []).filter(Boolean));
    const jobs = set === null ? JOBS : JOBS.map((j) => (set.has(j.tracking) ? j : stripContact(j)));
    return { jobs, ok: true, at: now() };
  },
  view: async (whIn) => {
    const wh = normWh(whIn);
    const mine = shelf.filter((p) => normWh(p.wh) === wh);
    const cages = CAGES.filter((c) => c.wh === wh);
    return Object.assign(mergeView(mine, JOBS_FLAGS, cages), {
      wh: wh, whName: WH_NAME(wh),
      warehouses: WH_LIST.map((w) =>
        Object.assign({ placed: shelf.filter((p) => normWh(p.wh) === w.id).length }, w)),
      live: { ok: true, at: now(), error: null },
      placedCount: mine.length,
      demo: true,
    });
  },

  /* 🧺 กรงเหล็ก — เก็บในหน่วยความจำเหมือนของอย่างอื่นในโหมดลองดู */
  listCages: async (whIn) => CAGES.filter((c) => c.wh === normWh(whIn)),
  allCages: async () => CAGES.slice(),
  findCages: async (q) => {
    const needle = String(q || "").trim().toUpperCase();
    if (!needle) return [];
    return CAGES.filter((c) => c.name.toUpperCase().includes(needle) || c.slot === needle);
  },
  putCage: async (opts, who) => {
    const o = opts || {};
    const wh = normWh(o.wh);
    const sl = parseSlot(o.slot);
    if (!sl) throw new Error('ช่อง "' + o.slot + '" ไม่มีในผังโกดัง');
    const kind = o.kind === "nocode" ? "nocode" : "small";
    const name = String(o.name || "").trim() ||
      (kind === "nocode" ? "กรง No-Code " : "กรงชิ้นเล็ก ") + slotLabel(sl.slot);
    const id = wh + "-" + sl.slot;
    const row = { id, wh, slot: sl.slot, kind, name, made_by: String(who || "ลองดู"), made_at: now() };
    const i = CAGES.findIndex((c) => c.id === id);
    if (i >= 0) CAGES[i] = row; else CAGES.push(row);
    return { ok: true, cage: row, label: slotLabel(sl.slot) };
  },
  removeCage: async (whIn, slot) => {
    const id = normWh(whIn) + "-" + String(slot || "").toUpperCase();
    const i = CAGES.findIndex((c) => c.id === id);
    if (i >= 0) CAGES.splice(i, 1);
    return { ok: true, slot: slot };
  },

  place: async (tracking, slot, who, opts) => {
    const t = String(tracking || "").trim();
    if (!t) throw new Error("ยังไม่ได้ใส่เลขแทรค");
    const s = parseSlot(slot);
    if (!s) throw new Error('ช่อง "' + slot + '" ไม่มีในผังโกดัง');
    const o = opts || {};
    const wh = normWh(o.wh);
    const i = shelf.findIndex((p) => p.tracking === t);
    const from = i >= 0 ? shelf[i].slot : null;
    const fromWh = i >= 0 ? normWh(shelf[i].wh) : null;
    /* ⚠️ ช่องเดียวกันแต่คนละโกดัง = ย้ายจริง (รหัสช่องซ้ำกันได้) */
    if (from === s.slot && fromWh === wh) return { ok: true, unchanged: true, wh, slot: s.slot, label: slotLabel(s.slot) };

    const job = JOBS.find((j) => j.tracking === t);
    const row = {
      tracking: t, wh: wh, slot: s.slot, location: s.code, zone: s.row, bay: s.bay, lvl: s.level, side: s.side,
      member_code: (job && job.memberCode) || null,
      boxes: Math.max(1, Number(o.boxes) || 1),
      note: o.note || null,
      placed_by: String(who || "ลองดู").slice(0, 40),
      placed_at: now(),
    };
    if (i >= 0) shelf[i] = row; else shelf.push(row);
    LOG.unshift({ tracking: t, action: from ? "move" : "place", from_slot: from, to_slot: s.slot, by_who: row.placed_by, at: now() });
    return { ok: true, moved: !!from, from, fromWh, movedWarehouse: !!(from && fromWh !== wh),
      wh, slot: s.slot, label: slotLabel(s.slot) };
  },

  remove: async (tracking, who, note, kind) => {
    const t = String(tracking || "").trim();
    const i = shelf.findIndex((p) => p.tracking === t);
    if (i < 0) return { ok: true, missing: true };
    const from = shelf[i].slot;
    shelf.splice(i, 1);
    const action = kind === "load" ? "load" : "remove";
    LOG.unshift({ tracking: t, action, from_slot: from, to_slot: null, by_who: String(who || "ลองดู"), note, at: now() });
    return { ok: true, from, action };
  },

  history: async (tracking) => LOG.filter((l) => l.tracking === String(tracking || "").trim()),

  find: async (q) =>
    shelf.filter((p) =>
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
