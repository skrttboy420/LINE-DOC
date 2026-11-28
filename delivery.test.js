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
const fs = require("node:fs");
const path = require("node:path");

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
      in(c, v) { st.filters[c] = v; return b; },
      not(c, op, v) { st.filters["not:" + c] = [op, v]; return b; },
      gte(c, v) { st.filters["gte:" + c] = v; return b; },
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

  // ── 📍 คนขับปักหมุดหน้าบ้านลูกค้า (ภูม 2026-11-25) ──
  //
  // ภูม: *"พวกหมุดคล่าวๆ พวกนี้มันยังไม่ตรงบ้านลูกค้าถูกไหม ถ้าคนขับไปถึงบ้านลูกค้า
  //        จริงๆแล้ว ทำปุ่มให้คนขับปักหมุดกลับมาด้วยได้ไหม"*
  //
  // 🔴 พิกัดนี้ไป **ทับที่อยู่ของลูกค้า** ในระบบ Pacred และถูกใช้นำทางรอบถัดๆ ไป
  //    ⇒ ลิงก์ใบหนึ่งต้องแตะได้เฉพาะของในเที่ยวของตัวเอง และพลาดต้องไม่เขียนอะไรเลย

  const TRIP_ROW = { id: "t-1", name: "2026-11-25-08-AD036", share_token: "tok-1" };
  const STOPS = [
    { id: "s-1", pr: "PR863", tracking: "TK1" },
    { id: "s-2", pr: "PR863", tracking: "TK2" },
    { id: "s-3", pr: "PR900", tracking: "TK9" },
  ];
  /** โกดังปลอมที่จดไว้ว่าถูกเรียกด้วยอะไรบ้าง (หรือสั่งให้ตีกลับ) */
  const whPin = (fail) => {
    const seen = [];
    return {
      seen,
      jobsFromPacred: async () => ({ ok: true, jobs: [] }),
      pinInPacred: async (o) => { seen.push(o); return fail ? { ok: false, error: fail } : { ok: true, rows: 2 }; },
    };
  };

  await ok("📍 ปักหมุดได้ — ยิงเลขแทรค + ชื่อเที่ยวเข้า Pacred แล้วอัปสำเนาบนเที่ยว", async () => {
    const db = mk({ row: TRIP_ROW, rows: STOPS });
    const wh = whPin();
    const r = await createDelivery(db, wh).driverPinStop("t-1", "tok-1", ["TK1"], 13.72, 100.56, 12);
    assert.equal(r.ok, true);
    assert.equal(wh.seen.length, 1, "ต้องยิงเข้า Pacred ครั้งเดียว");
    assert.deepEqual(wh.seen[0].trackings, ["TK1"]);
    assert.equal(wh.seen[0].via, "2026-11-25-08-AD036", "ส่งชื่อเที่ยวไปลง audit ด้วย");
    assert.equal(wh.seen[0].accuracyM, 12);
    /* สำเนาบนเที่ยวต้องขยับทั้งบ้านหลังนั้น (PR863 มี 2 แทรค) ไม่ลามไป PR900 */
    const up = db.calls.find((c) => c.table === "dp_stop" && c.op === "update");
    assert.ok(up, "ต้องอัปสำเนาบนเที่ยวให้จอเห็นทันที");
    assert.deepEqual(up.filters.id, ["s-1", "s-2"]);
  });

  await ok("🔒 โทเคนไม่ตรง = ไม่ยิงเข้า Pacred เลยสักครั้ง", async () => {
    const wh = whPin();
    const d = createDelivery(mk({ row: TRIP_ROW, rows: STOPS }), wh);
    await assert.rejects(() => d.driverPinStop("t-1", "tok-ปลอม", ["TK1"], 13.72, 100.56), /ลิงก์/);
    assert.equal(wh.seen.length, 0, "ยังไม่ผ่านด่าน ห้ามแตะระบบ Pacred");
  });

  await ok("🔒 ของที่ไม่ได้อยู่ในเที่ยวของลิงก์นี้ = ตีกลับ", async () => {
    const wh = whPin();
    const d = createDelivery(mk({ row: TRIP_ROW, rows: STOPS }), wh);
    await assert.rejects(() => d.driverPinStop("t-1", "tok-1", ["TK999"], 13.72, 100.56), /ไม่ได้อยู่ในเที่ยว/);
    assert.equal(wh.seen.length, 0);
  });

  await ok("🔒 พิกัดนอกไทย / ไม่ใช่ตัวเลข = ตีกลับก่อนแตะฐาน", async () => {
    const wh = whPin();
    const db = mk({ row: TRIP_ROW, rows: STOPS });
    const d = createDelivery(db, wh);
    await assert.rejects(() => d.driverPinStop("t-1", "tok-1", ["TK1"], 35.68, 139.69), /นอกประเทศไทย/);
    await assert.rejects(() => d.driverPinStop("t-1", "tok-1", ["TK1"], "x", 100.5), /นอกประเทศไทย/);
    assert.equal(db.calls.length, 0, "ยังไม่ต้องอ่านฐานด้วยซ้ำ");
    assert.equal(wh.seen.length, 0);
  });

  await ok("🪤 Pacred ตีกลับ = ส่งข้อความเดิมต่อ และห้ามอัปสำเนาให้ดูเหมือนสำเร็จ", async () => {
    /* เคสจริง: ขนส่งเอกชน — คนขับยืนหน้าสาขา ไม่ใช่บ้านลูกค้า */
    const db = mk({ row: TRIP_ROW, rows: STOPS });
    const wh = whPin("งานนี้ส่งผ่าน KPN — ไม่ใช่จุดที่คุณยืนอยู่ตอนนี้");
    await assert.rejects(() => createDelivery(db, wh).driverPinStop("t-1", "tok-1", ["TK1"], 13.72, 100.56), /KPN/);
    assert.ok(!db.calls.some((c) => c.table === "dp_stop" && c.op === "update"), "ปักไม่ผ่าน จอต้องไม่ขยับ");
  });

  await ok("🔒 ยาม: จอคนขับต้องไม่เก็บหมุดไว้เอง — ยิงผ่านท่อเดียว", async () => {
    const html = fs.readFileSync(path.join(__dirname, "driver.html"), "utf8");
    assert.ok(html.includes("/delivery/api/driver/pin"), "ต้องมีปุ่มปักหมุดบนลิงก์คนขับ");
    assert.ok(html.includes("pinsheet"), "ต้องมีแผ่นยืนยันก่อนเขียน (กันกดลั่นทับที่อยู่ลูกค้า)");
    assert.ok(
      html.indexOf("getCurrentPosition") < html.indexOf("/delivery/api/driver/pin"),
      "ต้องขอพิกัดมาให้ดูก่อน แล้วค่อยยิง — ห้ามกดปุ่มเดียวแล้วเขียนเลย",
    );
    const js = fs.readFileSync(path.join(__dirname, "delivery.js"), "utf8");
    assert.ok(js.includes("warehouse.pinInPacred"), "หมุดต้องไปลงที่ Pacred ไม่ใช่เก็บไว้ที่เรา");
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

  // ── 📦 งานที่ส่งผ่านขนส่งเอกชน (ภูม 2026-11-26) ──
  //
  // ภูม (ภาพจอรอบ AD034 · หมุดขึ้นเชียงใหม่/พิษณุโลก/อุบล): *"อันนี้ไกลเกิน มันไม่ใช่
  //   เหมาๆมั้ยหละ มันคืองานที่ต้องไปส่งตามขนส่งที่แจ้งมาในระบบไง พวกขนส่ง พีที พาร์ท
  //   อะไรงี้อะ ไม่งั้นถ้าดูจากในรูปคือเหมือนคนขับ ต้องขับไปต่างจังหวัดเลยนะนั่น"*
  //
  // 📏 วัด prod รอบ #6656: 46 ชิ้น ปลายทาง 4 จังหวัด แต่ระบบนับเป็น **4 จุด**
  //    = สาขาขนส่ง 4 เจ้า ⇒ ยุบตาม PR จะได้ 40 กว่าจุดกระจายทั่วประเทศ = แผนที่โกหก

  await ok("📦 ขนส่งเอกชน = ยุบเป็นจุดเดียวต่อเจ้า · ไม่มีหมุดบ้านลูกค้า", async () => {
    const CARRIER_ITEMS = [
      { pr: "PR9903", tracking: "JT1", boxes: 1, done: false, address: "สาขา KPN", lat: null, lng: null, geo: null, carrier: "KPN", stopKey: "CARRIER|KPN" },
      { pr: "PR850",  tracking: "JT2", boxes: 2, done: false, address: "สาขา KPN", lat: null, lng: null, geo: null, carrier: "KPN", stopKey: "CARRIER|KPN" },
      { pr: "PR777",  tracking: "JT3", boxes: 1, done: false, address: "สาขา ธนามัย", lat: null, lng: null, geo: null, carrier: "ธนามัย", stopKey: "CARRIER|TNM" },
      { pr: "PR863",  tracking: "TK9", boxes: 3, done: false, address: "88/1 สีลม", lat: 13.7, lng: 100.5, geo: "driver", carrier: null, stopKey: "PR863|OWN|88/1" },
    ];
    const db = mk({ rows: [], row: { id: "t-1", share_token: "tok-1" } });
    const wh = {
      jobsFromPacred: async () => ({ ok: true, jobs: [] }),
      driverRunsFromPacred: async () => ({ ok: true, runs: [], assigned: [], items: CARRIER_ITEMS }),
    };
    const r = await createDelivery(db, wh).linkForRun(6656, "2026-11-26-12-AD034");
    assert.equal(r.ok, true);
    assert.equal(r.stops, 3, "KPN 2 ชิ้น = 1 จุด · ธนามัย 1 จุด · บ้านลูกค้า 1 จุด");
    const ins = db.calls.find((c) => c.table === "dp_stop" && c.op === "insert");
    const kpn = ins.payload.find((x) => /KPN/.test(x.pr));
    assert.ok(kpn, "ต้องมีจุดของ KPN");
    assert.equal(kpn.boxes, 3, "กล่องของทุกลูกค้าในกองนั้นรวมกัน");
    assert.equal(kpn.lat, null, "🔴 กองขนส่งห้ามมีหมุดบ้านลูกค้า — ไม่งั้นแผนที่พาคนขับไปต่างจังหวัด");
    assert.equal(kpn.lng, null);
    const own = ins.payload.find((x) => x.pr === "PR863");
    assert.equal(own.lat, 13.7, "ของที่รถเราเองไปส่ง ยังมีหมุดเหมือนเดิม");
  });

  await ok("🪤 ท่อรุ่นเก่าที่ยังไม่ส่ง stopKey/carrier = ยุบตาม PR เหมือนเดิม", async () => {
    /* เว็บ Pacred ยังไม่ deploy = items ไม่มีช่องใหม่ ⇒ ต้องไม่พังและไม่เปลี่ยนพฤติกรรม */
    const db = mk({ rows: [], row: { id: "t-2", share_token: "tok-2" } });
    const wh = {
      jobsFromPacred: async () => ({ ok: true, jobs: [] }),
      driverRunsFromPacred: async () => ({ ok: true, runs: [], assigned: [], items: RUN_ITEMS }),
    };
    const r = await createDelivery(db, wh).linkForRun(6637, "2026-11-25-11-AD033");
    assert.equal(r.stops, 2, "PR863 2 แทรค = 1 จุด · PR900 อีก 1 จุด");
  });

  await ok("🔒 ยาม: จอวางแผนต้องยุบกองขนส่ง ไม่แจงรายชิ้น + ไม่นับว่าไม่มีหมุด", async () => {
    const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
    assert.ok(html.includes("📦 ส่งที่สาขา "), "ต้องมีหัวกองขนส่งบนจอ");
    const at = html.indexOf("var noPin=0, html=");
    assert.ok(at > 0, "ตัวนับหมุดต้องนับทีหลัง ไม่ใช่นับทุกชิ้น");
    const body = html.slice(at, at + 2000);
    assert.ok(/items\.filter\(function\(it\)\{return !it\.carrier\}\)/.test(body), "ของที่แจงรายชิ้นต้องเป็นของรถเราเองเท่านั้น");
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

  // ── ⏱ หมุดรถต้องหมดอายุ (ภูม 2026-11-28 · "มีหมุดค้างจากวันอื่นๆ") ──
  await ok("pingAgeMin: ไม่มีเวลา/เวลาเพี้ยน = เก่าสุดเสมอ", async () => {
    const d = createDelivery(mk({}), fakeWh());
    const now = Date.UTC(2026, 10, 28, 3, 0, 0);
    assert.equal(d.pingAgeMin(null, now), Infinity);
    assert.equal(d.pingAgeMin("ไม่ใช่วันที่", now), Infinity);
    assert.equal(d.pingAgeMin(new Date(now - 90 * 60000).toISOString(), now), 90);
    assert.equal(d.pingAgeMin(new Date(now + 60 * 60000).toISOString(), now), 0, "เวลาอนาคต = 0 ไม่ติดลบ");
  });

  await ok("🪤 listTripPositions: หมุดเมื่อวานไม่โผล่ · ของสดโผล่ + ติดธง live", async () => {
    const now = Date.now();
    const at = (min) => new Date(now - min * 60000).toISOString();
    const db = mk({ rows: [
      { id: "t1", name: "วันนี้-วิ่งอยู่", truck_id: null, last_lat: 13.7, last_lng: 100.5, last_ping_at: at(3) },
      { id: "t2", name: "วันนี้-เงียบไปชม.นึง", truck_id: null, last_lat: 13.8, last_lng: 100.6, last_ping_at: at(60) },
      { id: "t3", name: "เมื่อวาน", truck_id: null, last_lat: 13.9, last_lng: 100.7, last_ping_at: at(24 * 60) },
      { id: "t4", name: "เมื่อวานซืน", truck_id: null, last_lat: 13.6, last_lng: 100.3, last_ping_at: at(48 * 60) },
    ] });
    const out = await createDelivery(db, fakeWh()).listTripPositions();
    assert.deepEqual(out.map((p) => p.id), ["t1", "t2"], "เกิน 2 ชม. ต้องไม่คืน");
    assert.equal(out[0].live, true, "3 นาที = กำลังวิ่ง");
    assert.equal(out[1].live, false, "1 ชม. = เงียบไปแล้ว");
    assert.equal(out[1].ageMin, 60);
    const q = db.calls.filter((c) => c.table === "dp_trip")[0];
    assert.ok(q.filters["gte:last_ping_at"], "ต้องส่งด่านเวลาไปที่ฐานด้วย ไม่ใช่กรองทีหลังอย่างเดียว");
  });

  await ok("listTripPositions: ปรับหน้าต่างเวลาได้ (ไว้ดูย้อนหลังตอนสอบสวน)", async () => {
    const now = Date.now();
    const db = mk({ rows: [
      { id: "t3", name: "เมื่อวาน", truck_id: null, last_lat: 13.9, last_lng: 100.7,
        last_ping_at: new Date(now - 24 * 3600000).toISOString() },
    ] });
    const d = createDelivery(db, fakeWh());
    assert.equal((await d.listTripPositions()).length, 0);
    assert.equal((await d.listTripPositions({ freshMin: 48 * 60 })).length, 1);
  });

  console.log("\n✅ delivery: " + pass + " pass, " + fail + " fail\n");
  process.exit(fail ? 1 : 0);
})();
