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
  const READY = { memberCode: "PR022", tracking: "T1", boxes: 3, weightKg: 420, cbm: 1.8, status: 6, paid: true, arrivedAt: "2026-11-01", boxesTotal: 1, boxesIn: 1 };
  const NOTPAID = { memberCode: "PR050", tracking: "T2", boxes: 1, status: 5, paid: false, arrivedAt: "2026-11-01" };
  const SELF = Object.assign({}, READY, { memberCode: "PR066", tracking: "T3", selfPickup: true });
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
  await ok("readyJobs: ไม่มีท่อโกดัง = บอกตรงๆ (ไม่พัง)", async () => {
    const r = await createDelivery(mk({}), null).readyJobs();
    assert.equal(r.ok, false);
    assert.equal(r.jobs.length, 0);
  });

  console.log("\n✅ delivery: " + pass + " pass, " + fail + " fail\n");
  process.exit(fail ? 1 : 0);
})();
