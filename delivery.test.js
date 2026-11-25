// ============================================================
// 🧪 delivery.js — Delivery Planner (ภูม 2026-11-22)
//
// รัน:  node delivery.test.js
//
// 🔑 รับ supabase + warehouse มาตรงๆ ⇒ สวม fake · เทสกติกาที่โค้ดคุม:
//    สูตรแนะนำรถตาม pacred · จุดโกดังต้องอยู่ในไทย · default โกดัง · setStops ล้าง+ลงใหม่ ·
//    readyJobs กรอง "พร้อมส่ง" (PICK.READY) + ตัดงานรับเองหน้าโกดัง
// ============================================================

const assert = require("node:assert/strict");
const { createDelivery } = require("./delivery");

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

/** fake Supabase — จำครั้งล่าสุด + รองรับ insert array (setStops) */
function mk(cfg) {
  cfg = cfg || {};
  const db = { last: null, calls: [] };
  db.from = function (table) {
    const st = { table, op: null, payload: null, opts: null, filters: {} };
    db.last = st; db.calls.push(st);
    function result(one) {
      if (cfg.error) return Promise.resolve({ data: null, error: cfg.error });
      let data;
      if (st.op === "insert" && !Array.isArray(st.payload)) data = Object.assign({ id: cfg.id || "id-1" }, st.payload);
      else if (st.op === "update") data = Object.assign({ id: cfg.id || "id-1" }, st.payload);
      else data = one ? (cfg.row !== undefined ? cfg.row : null) : (cfg.rows || []);
      return Promise.resolve({ data, error: null });
    }
    const b = {
      select() { return b; }, eq(c, v) { st.filters[c] = v; return b; },
      order() { return b; }, limit() { return result(false); },
      maybeSingle() { return result(true); }, single() { return result(true); },
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
const fakeWh = (jobs) => ({ jobsFromPacred: async () => ({ ok: true, jobs: jobs || [] }) });
const MISSING = { code: "42P01", message: 'relation "public.dp_setting" does not exist' };

(async () => {
  console.log("\n🚚 Delivery Planner (delivery.js)\n");

  // ── สูตรแนะนำรถ (ตรงกับ pacred vehicle-recommendation) ──
  await ok("recommendVehicle: ตามพิกัดน้ำหนัก+ปริมาตร (mirror pacred)", async () => {
    const d = createDelivery(mk({}), fakeWh());
    assert.equal(d.recommendVehicle(1000, 4), "รถกระบะ");
    assert.equal(d.recommendVehicle(1800, 6), "รถกระบะ");
    assert.equal(d.recommendVehicle(2000, 6), "6 ล้อเล็ก");
    assert.equal(d.recommendVehicle(3500, 12), "6 ล้อเล็ก");
    assert.equal(d.recommendVehicle(5000, 30), "6 ล้อใหญ่");
    assert.equal(d.recommendVehicle(9000, 40), "มากกว่ารถที่กำหนด");
    // เกินแกนใดแกนหนึ่งก็ขยับชั้น (ปริมาตรเกินทั้งที่น้ำหนักน้อย)
    assert.equal(d.recommendVehicle(500, 10), "6 ล้อเล็ก");
  });

  // ── isReady ──
  await ok("ยังไม่ลงตาราง = ไม่พร้อม", async () => {
    assert.equal(await createDelivery(mk({ error: MISSING }), fakeWh()).isReady(), false);
    assert.equal(await createDelivery(mk({ rows: [] }), fakeWh()).isReady(), true);
  });

  // ── จุดโกดัง ──
  await ok("getOrigin: ไม่เคยตั้ง = ได้ค่า default (ติด PCS)", async () => {
    const o = await createDelivery(mk({ row: null }), fakeWh()).getOrigin();
    assert.ok(o && Math.abs(o.lat - 13.7109246) < 1e-6 && Math.abs(o.lng - 100.3241082) < 1e-6);
  });
  await ok("getOrigin: ตั้งแล้ว = ได้ค่าที่เก็บ", async () => {
    const o = await createDelivery(mk({ row: { value: { lat: 13.5, lng: 100.5, label: "x" } } }), fakeWh()).getOrigin();
    assert.equal(o.lat, 13.5); assert.equal(o.label, "x");
  });
  await ok("🔒 setOrigin: นอกประเทศไทย = ปฏิเสธ", async () => {
    const d = createDelivery(mk({}), fakeWh());
    await assert.rejects(() => d.setOrigin(0, 0, "x"), /ในไทย/);
    await assert.rejects(() => d.setOrigin(48.8, 2.3, "ปารีส"), /ในไทย/);
  });
  await ok("setOrigin: ในไทย = upsert ค่า warehouse_origin", async () => {
    const db = mk({ row: { value: { lat: 13.7, lng: 100.3, label: "โกดัง PACRED" } } });
    await createDelivery(db, fakeWh()).setOrigin(13.7, 100.3, "โกดัง PACRED");
    // call แรกเป็น upsert ลง dp_setting
    const up = db.calls.find((c) => c.op === "upsert");
    assert.equal(up.table, "dp_setting");
    assert.equal(up.payload.key, "warehouse_origin");
    assert.equal(up.payload.value.lat, 13.7);
  });

  // ── เที่ยว + จุดส่ง ──
  await ok("createTrip: ชื่อ default + วันที่ผิดรูป = null", async () => {
    const db = mk({ id: "tp1" });
    const t = await createDelivery(db, fakeWh()).createTrip({ plan_date: "เมื่อวาน" });
    assert.equal(db.last.payload.name, "เที่ยวใหม่");
    assert.equal(db.last.payload.plan_date, null);
    assert.deepEqual(t.stops, []);
  });
  await ok("updateTrip: status บีบเหลือ draft/planned", async () => {
    const a = mk({}); await createDelivery(a, fakeWh()).updateTrip("tp1", { status: "planned" });
    assert.equal(a.last.payload.status, "planned");
    const b = mk({}); await createDelivery(b, fakeWh()).updateTrip("tp1", { status: "มั่ว" });
    assert.equal(b.last.payload.status, "draft");
  });
  await ok("setStops: ลบจุดเดิมก่อน แล้วลงชุดใหม่พร้อม seq", async () => {
    const db = mk({ rows: [] });
    await createDelivery(db, fakeWh()).setStops("tp1", [
      { pr: "PR022", lat: 13.5, lng: 100.6, boxes: 3 },
      { pr: "PR050", lat: 13.7, lng: 100.4, boxes: 1 },
    ]);
    const del = db.calls.find((c) => c.table === "dp_stop" && c.op === "delete");
    const ins = db.calls.find((c) => c.table === "dp_stop" && c.op === "insert");
    assert.ok(del, "ต้องลบของเดิมก่อน");
    assert.equal(ins.payload.length, 2);
    assert.equal(ins.payload[0].seq, 0);
    assert.equal(ins.payload[1].seq, 1);
    assert.equal(ins.payload[0].trip_id, "tp1");
    assert.equal(ins.payload[0].pr, "PR022");
  });

  // ── งานพร้อมส่ง ──
  const READY = { memberCode: "PR022", tracking: "T1", boxes: 3, weightKg: 420, cbm: 1.8, status: 6, paid: true, carrier: "PRF", arrivedAt: "2026-11-01", boxesTotal: 1, boxesIn: 1 };
  const NOTPAID = { memberCode: "PR050", tracking: "T2", boxes: 1, status: 5, paid: false, arrivedAt: "2026-11-01" };
  const SELF = Object.assign({}, READY, { memberCode: "PR066", tracking: "T3", selfPickup: true, carrier: "PCS" });
  /* 🚚 ภูม 2026-11-24 — รถเราวิ่งเฉพาะเหมาๆ (PRF/PCSF) + Pacred Express (PRE/PCSE)
     ของเดิมกรองออกแค่ selfPickup ⇒ Flash / Lalamove / J&T หลุดเข้ามากินที่ในรถ */
  const EXPRESS = Object.assign({}, READY, { memberCode: "PR077", tracking: "T4", carrier: "PRE" });
  const FLASH   = Object.assign({}, READY, { memberCode: "PR088", tracking: "T5", carrier: "2" });
  const JT      = Object.assign({}, READY, { memberCode: "PR099", tracking: "T6", carrier: "24" });
  const NOCODE  = Object.assign({}, READY, { memberCode: "PR111", tracking: "T7", carrier: null });

  await ok("readyJobs: เอาเฉพาะ 'พร้อมส่ง' (จ่าย+ถึงไทย) · ตัดรับเองหน้าโกดัง", async () => {
    const d = createDelivery(mk({}), fakeWh([READY, NOTPAID, SELF]));
    const r = await d.readyJobs();
    assert.equal(r.ok, true);
    assert.equal(r.jobs.length, 1, "ควรเหลือแต่ PR022");
    assert.equal(r.jobs[0].pr, "PR022");
    assert.equal(r.jobs[0].tracking, "T1");
    assert.equal(r.jobs[0].boxes, 3);
    assert.equal(r.jobs[0].weightKg, 420, "ส่งน้ำหนักจาก pacred ผ่าน");
    assert.equal(r.jobs[0].cbm, 1.8, "ส่งปริมาตรจาก pacred ผ่าน");
  });

  await ok("🚚 readyJobs: เหมาๆ + Pacred Express เข้า · Flash/J&T ไม่เข้า", async () => {
    const d = createDelivery(mk({}), fakeWh([READY, EXPRESS, FLASH, JT]));
    const r = await d.readyJobs();
    assert.deepEqual(r.jobs.map((j) => j.pr).sort(), ["PR022", "PR077"], "ต้องเหลือแค่รถเราวิ่ง");
    assert.equal(r.skipped.other, 2, "Flash + J&T = 2 งานที่เจ้าอื่นไปส่ง");
  });

  await ok("🪤 readyJobs: งานไม่มีรหัสขนส่ง ไม่เงียบ — รายงานเลขแทรคกลับมา", async () => {
    /* ตัดทิ้งเฉยๆ = งานที่จ่ายเงินแล้วหายจากหน้าวางแผนโดยไม่มีใครรู้ */
    const d = createDelivery(mk({}), fakeWh([READY, NOCODE]));
    const r = await d.readyJobs();
    assert.deepEqual(r.jobs.map((j) => j.pr), ["PR022"]);
    assert.deepEqual(r.skipped.unknown, ["T7"], "ต้องบอกเลขแทรคที่ตัดสินไม่ได้");
    assert.equal(r.skipped.other, 0, "ไม่มีรหัส ≠ เจ้าอื่นส่ง");
  });
  /* 📋 ภูม 2026-11-25 — งานที่มอบให้คนขับไปแล้ว ห้ามเอามาวางแผนซ้ำ
     (ไม่งั้นรถ 2 คันวิ่งไปส่งกล่องเดียวกัน) */
  const whWithRuns = (jobs, runs) => Object.assign(fakeWh(jobs), {
    driverRunsFromPacred: async () => runs,
  });

  await ok("📋 readyJobs: งานที่คนขับรับไปแล้ว ไม่เอามาวางแผนซ้ำ", async () => {
    const d = createDelivery(mk({}), whWithRuns([READY, EXPRESS], { ok: true, runs: [], assigned: ["T1"] }));
    const r = await d.readyJobs();
    assert.deepEqual(r.jobs.map((j) => j.tracking), ["T4"], "T1 อยู่กับคนขับแล้ว ต้องหายไป");
    assert.equal(r.skipped.assigned, 1);
    assert.equal(r.skipped.assignedUnknown, false);
  });

  await ok("🪤 readyJobs: อ่านรอบมอบไม่ได้ = ไม่กันสักอัน แต่ต้องทัก", async () => {
    /* เดาว่า "ไม่มีงานมอบ" แล้วเงียบ = วางแผนทับของที่ออกไปแล้วโดยไม่มีใครรู้ */
    const d = createDelivery(mk({}), whWithRuns([READY], { ok: false, runs: [], assigned: null, error: "เน็ตหลุด" }));
    const r = await d.readyJobs();
    assert.deepEqual(r.jobs.map((j) => j.tracking), ["T1"], "อ่านไม่ได้ก็ยังวางแผนต่อได้ (พฤติกรรมเดิม)");
    assert.equal(r.skipped.assigned, 0);
    assert.equal(r.skipped.assignedUnknown, true, "ต้องติดธงให้จอทัก");
  });

  await ok("ท่อโกดังรุ่นเก่าที่ยังไม่มีตัวอ่านรอบมอบ = ใช้งานได้เหมือนเดิม", async () => {
    const d = createDelivery(mk({}), fakeWh([READY]));
    const r = await d.readyJobs();
    assert.deepEqual(r.jobs.map((j) => j.tracking), ["T1"]);
    assert.equal(r.skipped.assignedUnknown, true);
  });

  // ── 🔗 ลิงก์ให้คนขับ ของรอบที่มอบในระบบ Pacred ไปแล้ว (ภูม 2026-11-25) ──
  //
  // ภูม: *"เพิ่มปุ่มส่งลิงค์ให้คนขับด้วยสิ งานที่มอบหมายในระบบไปแล้ว ไม่ใช่จะมีปุ่มให้แค่ที่
  //        บันทึกแพลนในระบบวางแผนจัดส่งเอง … ถ้ามันยังดูใช้งานไม่ได้จริง ต้องแก้ไขด้วยนะ"*

  const RUN_ITEMS = [
    { pr: "PR863", tracking: "TK1", boxes: 2, done: false, address: "บ้าน ก", lat: 13.7, lng: 100.5, geo: "driver" },
    { pr: "PR863", tracking: "TK2", boxes: 1, done: true,  address: "บ้าน ก", lat: 13.7, lng: 100.5, geo: "driver" },
    { pr: "PR900", tracking: "TK3", boxes: 4, done: false, address: null, lat: null, lng: null, geo: null },
  ];
  const whRun = (items) => ({
    jobsFromPacred: async () => ({ ok: true, jobs: [] }),
    driverRunsFromPacred: async () => ({ ok: true, runs: [], assigned: [], items: items }),
  });

  await ok("🔗 รอบที่มอบแล้ว ขอลิงก์คนขับได้ — ยุบเป็นจุดต่อ PR", async () => {
    const db = mk({ rows: [], row: { id: "id-1", share_token: "tok-1" } });
    const r = await createDelivery(db, whRun(RUN_ITEMS)).linkForRun(6637, "2026-11-25-11-AD033");
    assert.equal(r.ok, true);
    assert.equal(r.stops, 2, "PR863 มี 2 แทรค = 1 จุด · รวม PR900 เป็น 2 จุด");
    assert.equal(r.token, "tok-1");
    const ins = db.calls.find((c) => c.table === "dp_stop" && c.op === "insert");
    assert.equal(ins.payload.length, 2);
    assert.equal(ins.payload[0].pr, "PR863");
  });

  await ok("🪤 กดซ้ำต้องได้ลิงก์เดิม ไม่ใช่สร้างเที่ยวใหม่ทุกครั้ง", async () => {
    /* ลิงก์ที่ส่งให้คนขับไปแล้วต้องไม่ตาย · และต้องไม่มีเที่ยวซ้ำกองในระบบ */
    const db = mk({ rows: [{ id: "t-9" }], row: { id: "t-9", share_token: "tok-เดิม" } });
    const r = await createDelivery(db, whRun(RUN_ITEMS)).linkForRun(6637, "2026-11-25-11-AD033");
    assert.equal(r.tripId, "t-9");
    assert.equal(r.token, "tok-เดิม");
    assert.ok(!db.calls.some((c) => c.table === "dp_trip" && c.op === "insert"), "ห้ามสร้างเที่ยวใหม่");
  });

  await ok("🪤 รอบว่าง / ไม่รู้ว่ารอบไหน = บอกตรงๆ ไม่สร้างเที่ยวเปล่า", async () => {
    const db = mk({ rows: [], row: null });
    const d = createDelivery(db, whRun([]));
    await assert.rejects(() => d.linkForRun(6637, "2026-11-25-11-AD033"), /ยังไม่มีของ/);
    await assert.rejects(() => d.linkForRun(0, ""), /ไม่รู้ว่าเป็นรอบไหน/);
    assert.ok(!db.calls.some((c) => c.table === "dp_trip" && c.op === "insert"), "ห้ามสร้างเที่ยวเปล่าทิ้งไว้");
  });

  await ok("🪤 อ่านรอบไม่ได้ = ไม่แตะฐานเลย", async () => {
    const db = mk({ rows: [], row: null });
    const wh = { jobsFromPacred: async () => ({ ok: true, jobs: [] }),
      driverRunsFromPacred: async () => ({ ok: false, runs: [], error: "เน็ตหลุด" }) };
    await assert.rejects(() => createDelivery(db, wh).linkForRun(1, "รอบ"), /เน็ตหลุด/);
    assert.equal(db.calls.length, 0);
  });

  await ok("readyJobs: ไม่มีท่อโกดัง = บอกตรงๆ (ไม่พัง)", async () => {
    const r = await createDelivery(mk({}), null).readyJobs();
    assert.equal(r.ok, false);
    assert.equal(r.jobs.length, 0);
  });

  console.log("\n✅ delivery: " + pass + " pass, " + fail + " fail\n");
  process.exit(fail ? 1 : 0);
})();
