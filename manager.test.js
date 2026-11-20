// ============================================================
// 🧪 manager.js — ศูนย์จัดการโกดัง (ภูม 2026-11-20)
//
// รัน:  node manager.test.js
//
// 🔑 manager.js รับ supabase มาตรงๆ (ไม่สร้าง client เอง) ⇒ สวม fake builder ในหน่วยความจำ
//    เทสเฉพาะ "กติกา" ที่โค้ดคุม: รูปแบบวัน · ดาว 0–5 · รูปใบขับขี่ต้องเป็น data URL ·
//    done = ลงเวลาเสร็จ · ตัดความยาว · ว่าง = ปฏิเสธ · ยังไม่ลง SQL = บอกให้ไปลง
// ============================================================

const assert = require("node:assert/strict");
const { createManager } = require("./manager");

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

/**
 * fake Supabase — จำ "ครั้งล่าสุด" ที่ถูกเรียก (table/op/payload/filters) ไว้ตรวจ
 * cfg: { row, rows, error, id }  — กำหนดคำตอบที่ฐานจะคืน
 */
function mk(cfg) {
  cfg = cfg || {};
  const db = { last: null };
  db.from = function (table) {
    const st = { table, op: null, payload: null, opts: null, filters: {} };
    db.last = st;
    function result(one) {
      if (cfg.error) return Promise.resolve({ data: null, error: cfg.error });
      let data;
      if (st.op === "insert" || st.op === "update") {
        data = Object.assign({ id: cfg.id || "id-1" }, st.payload || {});
      } else {
        data = one ? (cfg.row !== undefined ? cfg.row : null) : (cfg.rows || []);
      }
      return Promise.resolve({ data, error: null });
    }
    const b = {
      select() { return b; },
      eq(c, v) { st.filters[c] = v; return b; },
      order() { return b; },
      limit() { return result(false); },
      maybeSingle() { return result(true); },
      single() { return result(true); },
      insert(row) { st.op = "insert"; st.payload = row; return b; },
      update(row) { st.op = "update"; st.payload = row; return b; },
      upsert(row, o) { st.op = "upsert"; st.payload = row; st.opts = o; return Promise.resolve({ error: cfg.error || null }); },
      delete() { st.op = "delete"; return b; },
      then(res, rej) { return result(false).then(res, rej); },
    };
    return b;
  };
  return db;
}

const MISSING = { code: "42P01", message: 'relation "public.mgr_team" does not exist' };

(async () => {
  console.log("\n🧑‍💼 ศูนย์จัดการโกดัง (manager.js)\n");

  // ── isReady ───────────────────────────────────────────────
  await ok("ลง SQL แล้ว = พร้อม (isReady true)", async () => {
    const m = createManager(mk({ rows: [] }));
    assert.equal(await m.isReady(), true);
  });
  await ok("ยังไม่ลงตาราง = ไม่พร้อม (ไม่ throw มั่ว)", async () => {
    const m = createManager(mk({ error: MISSING }));
    assert.equal(await m.isReady(), false);
  });

  // ── เช็คลิสต์ (ต่อวัน) ─────────────────────────────────────
  await ok("getChecklist: ไม่มีของวันนั้น = คืนค่าว่าง (ไม่พัง)", async () => {
    const m = createManager(mk({ row: null }));
    const c = await m.getChecklist("2026-11-20");
    assert.deepEqual(c.checks, {});
    assert.equal(c.pallet, "");
  });
  await ok("🔒 วันผิดรูปแบบ = ปฏิเสธก่อนแตะฐาน", async () => {
    const m = createManager(mk({}));
    await assert.rejects(() => m.getChecklist("2026-1-1"), /รูปแบบวัน/);
    await assert.rejects(() => m.saveChecklist("เมื่อวาน", {}, "", "x"), /รูปแบบวัน/);
  });
  await ok("saveChecklist: upsert ลง day + checks + ผู้บันทึก (ไม่ใส่ = หัวหน้า)", async () => {
    const db = mk({}); const m = createManager(db);
    await m.saveChecklist("2026-11-20", { shelf: true }, "42", "");
    assert.equal(db.last.table, "mgr_checklist");
    assert.equal(db.last.op, "upsert");
    assert.equal(db.last.payload.day, "2026-11-20");
    assert.deepEqual(db.last.payload.checks, { shelf: true });
    assert.equal(db.last.payload.updated_by, "หัวหน้า");
    assert.equal(db.last.opts.onConflict, "day");
  });
  await ok("saveChecklist: checks ที่ไม่ใช่ object = กันเป็น {} (ไม่ลงขยะ)", async () => {
    const db = mk({}); const m = createManager(db);
    await m.saveChecklist("2026-11-20", "ไม่ใช่ออบเจ็กต์", null, "ภูม");
    assert.deepEqual(db.last.payload.checks, {});
    assert.equal(db.last.payload.pallet, null);
  });

  // ── ทีม + ดาว ─────────────────────────────────────────────
  await ok("addTeam: ชื่อว่าง = ปฏิเสธ", async () => {
    const m = createManager(mk({}));
    await assert.rejects(() => m.addTeam("   "), /ชื่อ/);
  });
  await ok("addTeam: เพิ่มได้ · ตัดชื่อยาวเกิน 80 · ดาวเริ่ม 0", async () => {
    const db = mk({ id: "t1" }); const m = createManager(db);
    const row = await m.addTeam("x".repeat(200));
    assert.equal(db.last.table, "mgr_team");
    assert.equal(db.last.payload.name.length, 80);
    assert.equal(db.last.payload.stars, 0);
    assert.equal(row.id, "t1");
  });
  await ok("🔒 ดาวถูกบีบให้อยู่ 0–5 เสมอ", async () => {
    const hi = mk({}); await createManager(hi).updateTeam("t1", { stars: 9 });
    assert.equal(hi.last.payload.stars, 5);
    const lo = mk({}); await createManager(lo).updateTeam("t1", { stars: -3 });
    assert.equal(lo.last.payload.stars, 0);
    const mid = mk({}); await createManager(mid).updateTeam("t1", { stars: 3 });
    assert.equal(mid.last.payload.stars, 3);
  });
  await ok("deleteTeam: ลบที่ mgr_team ตาม id (โน้ตหายตามด้วย cascade ที่ฐาน)", async () => {
    const db = mk({}); await createManager(db).deleteTeam("t1");
    assert.equal(db.last.table, "mgr_team");
    assert.equal(db.last.op, "delete");
    assert.equal(db.last.filters.id, "t1");
  });

  // ── โน้ตประเมิน ───────────────────────────────────────────
  await ok("addNote: ว่าง = ปฏิเสธ · มีข้อความ = ลง member_id + body", async () => {
    const m0 = createManager(mk({}));
    await assert.rejects(() => m0.addNote("t1", "  "), /โน้ต/);
    const db = mk({ id: "n1" }); const m = createManager(db);
    const row = await m.addNote("t1", "วันนี้ทำงานดี");
    assert.equal(db.last.table, "mgr_team_note");
    assert.equal(db.last.payload.member_id, "t1");
    assert.equal(db.last.payload.body, "วันนี้ทำงานดี");
    assert.equal(row.id, "n1");
  });
  await ok("listNotes: อ่านของคนที่เลือก (กรองด้วย member_id)", async () => {
    const db = mk({ rows: [{ id: "n1", body: "a" }] }); const m = createManager(db);
    const rows = await m.listNotes("t1");
    assert.equal(db.last.filters.member_id, "t1");
    assert.equal(rows.length, 1);
  });

  // ── รถ / ใบขับขี่ ─────────────────────────────────────────
  await ok("🔒 รูปใบขับขี่ต้องเป็น data URL เท่านั้น (กัน URL มั่ว/สคริปต์)", async () => {
    const m = createManager(mk({}));
    await assert.rejects(() => m.updateTruck("c1", { license_photo: "http://evil/x.png" }), /รูป/);
    await assert.rejects(() => m.updateTruck("c1", { license_photo: "javascript:alert(1)" }), /รูป/);
  });
  await ok("🔒 รูปใหญ่เกิน = ปฏิเสธ (ให้บีบก่อน)", async () => {
    const m = createManager(mk({}));
    const huge = "data:image/jpeg;base64," + "A".repeat(7_000_001);
    await assert.rejects(() => m.updateTruck("c1", { license_photo: huge }), /ใหญ่เกิน/);
  });
  await ok("updateTruck: data URL ถูกต้อง = ผ่าน · เอารูปออกด้วยค่าว่าง", async () => {
    const okdb = mk({}); await createManager(okdb).updateTruck("c1", { license_photo: "data:image/png;base64,AAAA" });
    assert.equal(okdb.last.payload.license_photo, "data:image/png;base64,AAAA");
    const rm = mk({}); await createManager(rm).updateTruck("c1", { license_photo: "" });
    assert.equal(rm.last.payload.license_photo, null);
  });
  await ok("addTruck: ชื่อว่าง = ปฏิเสธ · มีชื่อ = person เริ่มว่าง", async () => {
    const m0 = createManager(mk({}));
    await assert.rejects(() => m0.addTruck(""), /ชื่อรถ/);
    const db = mk({ id: "c1" }); await createManager(db).addTruck("FL-01");
    assert.equal(db.last.payload.name, "FL-01");
    assert.equal(db.last.payload.person, "");
  });

  // ── สมุดงาน ───────────────────────────────────────────────
  await ok("addTask: ว่าง = ปฏิเสธ · มีงาน = done เริ่ม false", async () => {
    const m0 = createManager(mk({}));
    await assert.rejects(() => m0.addTask("   "), /งาน/);
    const db = mk({ id: "k1" }); await createManager(db).addTask("ประชุมทีม");
    assert.equal(db.last.payload.body, "ประชุมทีม");
    assert.equal(db.last.payload.done, false);
  });
  await ok("updateTask: ทำเสร็จ = ลงเวลาเสร็จ · เลิกเสร็จ = ล้างเวลา", async () => {
    const d1 = mk({}); await createManager(d1).updateTask("k1", { done: true });
    assert.equal(d1.last.payload.done, true);
    assert.ok(d1.last.payload.done_at, "done=true ต้องมี done_at");
    const d2 = mk({}); await createManager(d2).updateTask("k1", { done: false });
    assert.equal(d2.last.payload.done, false);
    assert.equal(d2.last.payload.done_at, null);
  });

  // ── ยังไม่ลง SQL = ข้อความชวนไปลง (ไม่ใช่ error ดิบ) ────────
  await ok("ฐานฟ้องว่าไม่มีตาราง = แปลงเป็นข้อความชวนไปรัน manager-schema.sql", async () => {
    const m = createManager(mk({ error: MISSING }));
    await assert.rejects(() => m.listTeam(), /manager-schema\.sql/);
  });

  console.log("\n✅ manager: " + pass + " pass, " + fail + " fail\n");
  process.exit(fail ? 1 : 0);
})();
