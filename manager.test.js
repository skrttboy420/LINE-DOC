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
    const st = { table, op: null, payload: null, opts: null, filters: {}, cols: null };
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
      select(cols) { st.cols = cols || null; return b; },   /* จำคอลัมน์ที่ขอ — ใช้ตรวจว่าไม่ลากของก้อนใหญ่มา */
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


  /* ══ 🕘 ประวัติเช็คลิสต์ + 📸 รูปหลักฐาน (ภูม 2026-11-21) ═══════════════════
   * ภูม: *"พอขึ้นวันใหม่ จะได้เป็นของใหม่ และมีประวัติให้กลับไปย้อนดูได้"*
   * + จอมีช่องแนบรูปมาตั้งแต่แรก แต่ไม่มีที่เก็บ ⇒ รีหน้าแล้วรูปหาย
   */
  await ok("ประวัติ: สรุปต่อวัน — นับเฉพาะข้อที่ติ๊กจริง (false ไม่นับ)", async () => {
    const db = mk({ rows: [
      /* 🔑 ต้องเป็น "คีย์ข้อจริง" ของเช็คลิสต์ — ตัวนับนับเฉพาะข้อที่มีอยู่ในรายการวันนี้
         (ข้อที่เลิกใช้ไปแล้วไม่ถูกนับ ⇒ เลขในลิสต์ตรงกับที่กดเข้าไปดูเสมอ) */
      { day: "2026-11-20", checks: { shelf: true, clean: true, fork: false }, pallet: "38", updated_by: "ภูม", updated_at: "t1" },
      { day: "2026-11-19", checks: {}, pallet: null, updated_by: null, updated_at: "t2" },
    ] });
    const days = await createManager(db).listChecklistDays();
    assert.equal(days.length, 2);
    assert.equal(days[0].done, 2, "ติ๊ก 2 ข้อ (fork:false ไม่นับ)");
    assert.equal(days[0].pallet, "38");
    assert.equal(days[1].done, 0);
    assert.equal(days[1].pallet, "", "ไม่มีพาเลท = ค่าว่าง ไม่ใช่ null (จอเอาไปต่อข้อความได้เลย)");
  });

  await ok("🔒 ประวัติ: ไม่ลาก checks/photos ทั้งก้อนมาในลิสต์ (รูปก้อนใหญ่)", async () => {
    const db = mk({ rows: [{ day: "2026-11-20", checks: { shelf: true }, pallet: "", updated_at: "t" }] });
    const days = await createManager(db).listChecklistDays();
    assert.deepEqual(Object.keys(days[0]).sort(),
      ["checked", "day", "done", "issues", "pallet", "total", "updated_at", "updated_by"]);
    assert.ok(!db.last.cols.includes("photos"), "คิวรีลิสต์ต้องไม่ดึง photos — ได้: " + db.last.cols);
    assert.ok(db.last.cols.includes("notes"), "ต้องดึง notes มานับ (ข้อความสั้น ไม่ใช่รูป)");
  });

  await ok("ประวัติ: เพดานจำนวนวัน 1–365 (ส่งมั่วมาก็ไม่พัง)", async () => {
    const m = createManager(mk({ rows: [] }));
    for (const v of [0, -5, "abc", null, undefined, 99999]) {
      await m.listChecklistDays(v);   // ไม่ throw = ผ่าน
    }
  });

  await ok("📸 รูปหลักฐาน: data URL เท่านั้น · ไม่ใช่รูป = ปฏิเสธ", async () => {
    const m = createManager(mk({}));
    await assert.rejects(() => m.saveChecklist("2026-11-21", {}, "", "x", ["https://evil/x.png"]), /ไฟล์รูปไม่ถูกต้อง/);
    await assert.rejects(() => m.saveChecklist("2026-11-21", {}, "", "x", "ไม่ใช่รายการ"), /ต้องเป็นรายการ/);
  });

  await ok("📸 รูปหลักฐาน: เกิน 3 รูป/วัน = ปฏิเสธ (กันแถวบวม)", async () => {
    const m = createManager(mk({}));
    const img = "data:image/jpeg;base64,AAAA";
    await m.saveChecklist("2026-11-21", {}, "", "x", [img, img, img]);   // 3 รูป = ผ่าน
    await assert.rejects(() => m.saveChecklist("2026-11-21", {}, "", "x", [img, img, img, img]), /ไม่เกิน 3/);
  });

  await ok("📸 ไม่ส่ง photos มา = ไม่แตะรูปเดิม · ส่ง null = ล้างรูป", async () => {
    const db1 = mk({});
    await createManager(db1).saveChecklist("2026-11-21", { a: true }, "", "x");
    assert.ok(!("photos" in db1.last.payload), "ไม่ส่งมา = ต้องไม่เขียนทับรูปเดิมเป็น []");
    const db2 = mk({});
    await createManager(db2).saveChecklist("2026-11-21", { a: true }, "", "x", null);
    assert.deepEqual(db2.last.payload.photos, []);
  });

  await ok("getChecklist: ไม่มีของวันนั้น = photos เป็น [] (จอวนลูปได้เลย)", async () => {
    const c = await createManager(mk({ row: null })).getChecklist("2026-11-21");
    assert.deepEqual(c.photos, []);
  });

  /* ══ 📝 หมายเหตุรายข้อ + 🔗 ลิงก์ส่งเจ้านาย (ภูม 2026-11-21) ═══════════════
   * ภูม: *"ถ้าสมมุติมันเกิดปัญหาหละ คือไม่ต้องติ๊กหรือไง … ให้ทำเป็นหมายเหตุไว้ได้ไหม"*
   *      + *"กดออกลิงค์ฟอร์มลิสที่ตรวจไปส่งพี่ป๊อปได้"*
   * (หน้าที่เจ้านายเปิด + กติกานับสถานะ อยู่ใน manager-share.test.js)
   */

  await ok("📝 หมายเหตุ: บันทึกลงฐานเป็น { คีย์ข้อ: ข้อความ }", async () => {
    const db = mk({}); const m = createManager(db);
    await m.saveChecklist("2026-11-21", { clean: true }, "", "ภูม", undefined, { shelf: "คนขับชนตัวกั้น ชั้นวางบุบ" });
    assert.deepEqual(db.last.payload.notes, { shelf: "คนขับชนตัวกั้น ชั้นวางบุบ" });
  });

  await ok("📝 หมายเหตุ: ไม่ส่งมา = ไม่แตะของเดิม · null = ล้างทั้งหมด · ว่าง = ลบข้อนั้น", async () => {
    const a = mk({}); await createManager(a).saveChecklist("2026-11-21", {}, "", "x");
    assert.ok(!("notes" in a.last.payload), "ไม่ส่งมา = ต้องไม่เขียนทับหมายเหตุเดิม");
    const b = mk({}); await createManager(b).saveChecklist("2026-11-21", {}, "", "x", undefined, null);
    assert.deepEqual(b.last.payload.notes, {});
    const c = mk({}); await createManager(c).saveChecklist("2026-11-21", {}, "", "x", undefined, { shelf: "   " });
    assert.deepEqual(c.last.payload.notes, {}, "ข้อความว่างล้วน = ไม่เก็บ");
  });

  await ok("🔒 หมายเหตุ: คีย์ที่ไม่มีในเช็คลิสต์ = ไม่ลงฐาน · ไม่ใช่ออบเจ็กต์ = ปฏิเสธ", async () => {
    const db = mk({}); const m = createManager(db);
    await m.saveChecklist("2026-11-21", {}, "", "x", undefined, { shelf: "ok", ไม่มีข้อนี้: "ขยะ" });
    assert.deepEqual(Object.keys(db.last.payload.notes), ["shelf"]);
    await assert.rejects(() => m.saveChecklist("2026-11-21", {}, "", "x", undefined, ["a"]), /หมายเหตุไม่ถูกต้อง/);
    await assert.rejects(() => m.saveChecklist("2026-11-21", {}, "", "x", undefined, "ข้อความ"), /หมายเหตุไม่ถูกต้อง/);
  });

  await ok("📝 หมายเหตุ: ยาวเกิน 300 ตัว = ตัด (ไม่ปฏิเสธทั้งวัน)", async () => {
    const db = mk({});
    await createManager(db).saveChecklist("2026-11-21", {}, "", "x", undefined, { shelf: "ก".repeat(900) });
    assert.equal(db.last.payload.notes.shelf.length, 300);
  });

  await ok("getChecklist: แถวเก่าที่ notes เป็น null = คืน {} (จอวนลูปได้เลย)", async () => {
    const c = await createManager(mk({ row: { day: "2026-11-20", checks: null, notes: null, photos: null } }))
      .getChecklist("2026-11-20");
    assert.deepEqual(c.notes, {});
    assert.deepEqual(c.checks, {});
    assert.deepEqual(c.photos, []);
  });

  await ok("ประวัติ: นับ 'ตรวจแล้ว' ด้วยกติกาเดียวกับจอ — ติ๊ก+มีหมายเหตุ ไม่นับซ้ำ", async () => {
    const db = mk({ rows: [
      { day: "2026-11-21", checks: { shelf: true, clean: true }, notes: { shelf: "บุบแต่ใช้ได้", fork: "เบรกหลวม" } },
    ] });
    const [d] = await createManager(db).listChecklistDays();
    assert.equal(d.done, 2, "ติ๊กจริง 2 ข้อ");
    assert.equal(d.issues, 1, "มีหมายเหตุแต่ยังไม่ติ๊ก = fork ข้อเดียว");
    assert.equal(d.checked, 3, "ตรวจแล้ว = 2 ติ๊ก + 1 ที่เขียนหมายเหตุ (ห้ามนับ shelf ซ้ำ)");
    assert.ok(d.total >= 10);
  });

  await ok("🔗 ลิงก์: มีอยู่แล้วใช้ใบเดิม (กดซ้ำไม่ทำให้ลิงก์ที่ส่งไปแล้วตาย)", async () => {
    const db = mk({ row: { day: "2026-11-21", share_token: "tok-เดิม-1234567890" } });
    const r = await createManager(db).ensureShareToken("2026-11-21");
    assert.equal(r.token, "tok-เดิม-1234567890");
    assert.equal(r.created, false);
    assert.notEqual(db.last.op, "upsert", "ไม่ควรเขียนฐานเมื่อมีลิงก์อยู่แล้ว");
  });

  await ok("🔗 ลิงก์: ยังไม่มี = ออกใบใหม่ยาวพอเดาไม่ได้ · ไม่แตะเวลาบันทึก", async () => {
    const db = mk({ row: null }); const r = await createManager(db).ensureShareToken("2026-11-21");
    assert.ok(r.token.length >= 20, "โทเคนสั้นเกินไป: " + r.token);
    assert.match(r.token, /^[A-Za-z0-9_-]+$/, "โทเคนต้องใส่ใน URL ได้ตรงๆ");
    assert.equal(db.last.op, "upsert");
    assert.deepEqual(Object.keys(db.last.payload).sort(), ["day", "share_token"]);
    assert.ok(!("updated_at" in db.last.payload), "ออกลิงก์ ≠ แก้เช็คลิสต์ ⇒ ห้ามขยับเวลาบันทึก");
  });

  await ok("🔗 ลิงก์: ออกใบใหม่ = โทเคนไม่ซ้ำใบเดิม (ใบเก่าตาย)", async () => {
    const m = createManager(mk({ row: { share_token: "tok-เดิม-1234567890" } }));
    const a = await m.rotateShareToken("2026-11-21");
    const b = await m.rotateShareToken("2026-11-21");
    assert.notEqual(a.token, "tok-เดิม-1234567890");
    assert.notEqual(a.token, b.token);
  });

  await ok("🔒 ลิงก์: โทเคนรูปแบบมั่ว = ไม่ถามฐานเลย (กันยิงเดาถี่ๆ)", async () => {
    const db = mk({ row: { day: "x" } }); const m = createManager(db);
    for (const bad of ["", "สั้น", "มีช่องว่าง ปะปน", "a".repeat(200), "../../etc/passwd"]) {
      assert.equal(await m.getShared(bad), null, "ควรปฏิเสธก่อนถามฐาน: " + bad);
    }
    assert.equal(db.last, null, "ไม่ควรแตะฐานเลยสักครั้ง");
  });

  await ok("🔗 ลิงก์: อ่านด้วยโทเคน = ได้เฉพาะช่องของเช็คลิสต์วันนั้น", async () => {
    const db = mk({ row: { day: "2026-11-21", checks: { shelf: true }, notes: { fork: "x" }, pallet: "42", photos: [], updated_by: "ภูม" } });
    const row = await createManager(db).getShared("abcdefghij1234567890");
    assert.equal(db.last.filters.share_token, "abcdefghij1234567890");
    assert.ok(!/stars|mgr_team|license/.test(String(db.last.cols)), "คิวรีต้องไม่ลากของตารางอื่น");
    assert.ok(!String(db.last.cols).includes("share_token"), "ไม่ควรคืนตัวโทเคนกลับไปกับข้อมูล");
    assert.equal(row.pallet, "42");
    assert.deepEqual(row.notes, { fork: "x" });
  });

  await ok("🔗 ลิงก์: ไม่มีแถวตรงโทเคน = null (หน้าโชว์ 'ลิงก์ใช้ไม่ได้แล้ว')", async () => {
    assert.equal(await createManager(mk({ row: null })).getShared("abcdefghij1234567890"), null);
  });
  console.log("\n✅ manager: " + pass + " pass, " + fail + " fail\n");
  process.exit(fail ? 1 : 0);
})();
