// ============================================================
// 🧪 trip-plan.js — จัดรถอัตโนมัติ (ภูม 2026-11-23)
//
// รัน:  node trip-plan.test.js
//
// 🔑 เทสกติกาที่ "เงินกับงานจริง" พึ่งอยู่:
//    ① **ไม่มีงานหาย** — ทุกจุดที่ใส่เข้าไป ต้องโผล่ใน trips หรือ noPin อย่างละ 1 ครั้งเท่านั้น
//    ② แบ่งตามทิศจริง (กองคนละฝั่งโกดัง ต้องไม่ปนเที่ยวเดียวกัน)
//    ③ เต็มพิกัดแล้วขึ้นเที่ยวใหม่ (จำนวนจุด · กก. · คิว)
//    ④ จุดเดียวใหญ่เกินพิกัด = ขึ้นเที่ยวแล้ว **ติดธง** ไม่ใช่หายหรือวนไม่จบ
//    ⑤ จุดไม่มีหมุด ไม่เข้าการจัดกลุ่ม (จัดโซนให้ไม่ได้)
//    ⑥ สูตรแนะนำรถมีที่เดียว — ห้ามมีสำเนาใน delivery.js / delivery.html
// ============================================================

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const EOL = String.fromCharCode(10);
const P = require("./trip-plan");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

/* โกดัง PACRED จริง (ค่าตั้งต้นของหน้าวางแผน) */
const WH = { lat: 13.7109246, lng: 100.3241082 };

/** จุดส่ง 1 จุด — dLat/dLng = ห่างจากโกดังกี่องศา */
function stop(pr, dLat, dLng, extra) {
  return Object.assign(
    { pr: pr, lat: dLat === null ? 0 : WH.lat + dLat, lng: dLng === null ? 0 : WH.lng + dLng,
      geo: "tambon", items: [{ tracking: "TK" + pr, boxes: 1, weightKg: 10, cbm: 0.1 }] },
    extra || {},
  );
}

console.log("\n🚚 trip-plan — จัดรถอัตโนมัติ");

// ── ① ไม่มีงานหาย (ข้อที่ห้ามพลาดที่สุด) ───────────────────────────
ok("🔑 ทุกจุดที่ใส่เข้าไป โผล่ครบ 1 ครั้ง — ไม่หาย ไม่ซ้ำ", () => {
  const stops = [];
  for (let i = 0; i < 37; i++) {
    /* กระจายรอบโกดังทุกทิศ + บางจุดไม่มีหมุด */
    const a = (i / 37) * 2 * Math.PI;
    stops.push(i % 7 === 0
      ? stop("PR" + i, null, null)
      : stop("PR" + i, Math.cos(a) * 0.08, Math.sin(a) * 0.08));
  }
  const r = P.planTrips(stops, { origin: WH, maxStops: 5 });
  const seen = r.trips.reduce((a, t) => a.concat(t.stops.map((s) => s.pr)), []).concat(r.noPin.map((s) => s.pr));
  assert.equal(seen.length, 37, "จำนวนจุดที่ออกมาต้องเท่าที่ใส่เข้าไป");
  assert.equal(new Set(seen).size, 37, "ห้ามมีจุดไหนโผล่ 2 เที่ยว");
  stops.forEach((s) => assert.ok(seen.includes(s.pr), s.pr + " หายไป"));
});

ok("จุดที่ไม่มีแทรคเลย = ไม่ใช่จุดส่ง (ข้าม)", () => {
  const r = P.planTrips([stop("A", 0.01, 0.01), { pr: "ว่าง", lat: WH.lat, lng: WH.lng, items: [] }], { origin: WH });
  const seen = r.trips.reduce((a, t) => a.concat(t.stops.map((s) => s.pr)), []);
  assert.deepEqual(seen, ["A"]);
});

// ── ② แบ่งตามทิศจริง ────────────────────────────────────────────
ok("กองตะวันออก กับ กองตะวันตก ไม่ปนเที่ยวเดียวกัน", () => {
  const east = [stop("E1", 0.01, 0.1), stop("E2", 0.02, 0.11), stop("E3", -0.01, 0.1)];
  const west = [stop("W1", 0.01, -0.1), stop("W2", 0.02, -0.11), stop("W3", -0.01, -0.1)];
  /* สลับเข้าไปให้ลำดับที่กดเพิ่มไม่ช่วยอะไรเลย */
  const r = P.planTrips([east[0], west[0], east[1], west[1], east[2], west[2]], { origin: WH, maxStops: 3 });
  assert.equal(r.trips.length, 2, "ต้องได้ 2 เที่ยว");
  r.trips.forEach((t) => {
    const letters = new Set(t.stops.map((s) => s.pr[0]));
    assert.equal(letters.size, 1, "เที่ยวนี้ปนทิศ: " + t.stops.map((s) => s.pr).join(","));
  });
});

ok("🪤 กองที่คร่อมทิศเหนือ ต้องไม่ถูกผ่าเป็น 2 เที่ยว (เริ่มกวาดที่ช่องว่างกว้างสุด)", () => {
  /* มุม ~0 กับ ~2π = ทิศเดียวกัน · เริ่มกวาดที่เหนือเป๊ะแล้วกองนี้จะขาดกลาง */
  const north = [stop("N1", 0.1, 0.004), stop("N2", 0.1, -0.004), stop("N3", 0.11, 0.001)];
  const south = [stop("S1", -0.1, 0.004), stop("S2", -0.1, -0.004), stop("S3", -0.11, 0.001)];
  const r = P.planTrips(north.concat(south), { origin: WH, maxStops: 3 });
  assert.equal(r.trips.length, 2);
  r.trips.forEach((t) => assert.equal(new Set(t.stops.map((s) => s.pr[0])).size, 1,
    "เที่ยวนี้ปนเหนือ-ใต้: " + t.stops.map((s) => s.pr).join(",")));
});

// ── ③ เต็มพิกัดแล้วขึ้นเที่ยวใหม่ ──────────────────────────────────
ok("เต็มจำนวนจุด → เที่ยวใหม่", () => {
  const stops = [];
  for (let i = 0; i < 10; i++) stops.push(stop("P" + i, 0.01 * i, 0.05));
  const r = P.planTrips(stops, { origin: WH, maxStops: 4 });
  assert.deepEqual(r.trips.map((t) => t.stopCount), [4, 4, 2]);
});

ok("เต็มน้ำหนัก → เที่ยวใหม่ (ไม่ต้องรอให้ครบจำนวนจุด)", () => {
  const stops = [];
  for (let i = 0; i < 6; i++) {
    const s = stop("P" + i, 0.01 * i, 0.05);
    s.items = [{ tracking: "T" + i, boxes: 2, weightKg: 400, cbm: 0.5 }];
    stops.push(s);
  }
  const r = P.planTrips(stops, { origin: WH, maxStops: 99, maxKg: 1000, maxCbm: 999 });
  assert.deepEqual(r.trips.map((t) => t.stopCount), [2, 2, 2], "400×2 = 800 ใส่ที่ 3 ไม่ได้ (1,200)");
  r.trips.forEach((t) => assert.ok(t.kg <= 1000, "เที่ยวเกินพิกัดน้ำหนัก"));
});

ok("เต็มปริมาตร → เที่ยวใหม่", () => {
  const stops = [];
  for (let i = 0; i < 5; i++) {
    const s = stop("P" + i, 0.01 * i, 0.05);
    s.items = [{ tracking: "T" + i, boxes: 1, weightKg: 1, cbm: 4 }];
    stops.push(s);
  }
  const r = P.planTrips(stops, { origin: WH, maxStops: 99, maxKg: 99999, maxCbm: 10 });
  assert.deepEqual(r.trips.map((t) => t.stopCount), [2, 2, 1]);
});

ok("ไม่ส่งพิกัดมา = ใช้ค่าตั้งต้น (12 จุด · รถใหญ่สุด)", () => {
  const r = P.planTrips([stop("A", 0.01, 0.01)], { origin: WH });
  assert.equal(r.caps.maxStops, 12);
  assert.equal(r.caps.maxKg, 5000);
  assert.equal(r.caps.maxCbm, 30);
});

ok("พิกัด 0 / ติดลบ / ขยะ = ใช้ค่าตั้งต้น ไม่ใช่แบ่งทีละจุด", () => {
  [0, -5, "", null, "abc", NaN].forEach((bad) => {
    const r = P.planTrips([stop("A", 0.01, 0.01)], { origin: WH, maxStops: bad, maxKg: bad, maxCbm: bad });
    assert.equal(r.caps.maxStops, 12, "maxStops=" + bad);
    assert.equal(r.caps.maxKg, 5000);
  });
});

// ── ④ จุดเดียวใหญ่เกินพิกัด ────────────────────────────────────────
ok("🪤 จุดเดียวหนักเกินพิกัด = ขึ้นเที่ยวแล้วติดธง (ไม่หาย ไม่วนไม่จบ)", () => {
  const big = stop("ใหญ่", 0.01, 0.05);
  big.items = [{ tracking: "BIG", boxes: 50, weightKg: 9000, cbm: 80 }];
  const r = P.planTrips([big, stop("เล็ก", 0.02, 0.05)], { origin: WH, maxKg: 1000, maxCbm: 6 });
  const seen = r.trips.reduce((a, t) => a.concat(t.stops.map((s) => s.pr)), []);
  assert.deepEqual(seen.sort(), ["เล็ก", "ใหญ่"], "ของใหญ่ต้องยังอยู่");
  const t = r.trips.filter((x) => x.stops.some((s) => s.pr === "ใหญ่"))[0];
  assert.equal(t.stopCount, 1, "ของใหญ่ต้องได้เที่ยวของตัวเอง");
  assert.equal(t.over.kg, true, "ต้องติดธงว่าเกินพิกัดน้ำหนัก");
  assert.equal(t.over.cbm, true);
  assert.equal(t.vehicle, "มากกว่ารถที่กำหนด");
});

// ── ⑤ จุดไม่มีหมุด ────────────────────────────────────────────────
ok("จุดไม่มีหมุด (รวม 0,0) ไปกองรอจัดมือ ไม่เข้าเที่ยว", () => {
  const r = P.planTrips([stop("มี", 0.01, 0.05), stop("ไม่มี", null, null), { pr: "ว่าง2", items: [{ tracking: "X", boxes: 1 }] }], { origin: WH });
  assert.deepEqual(r.trips[0].stops.map((s) => s.pr), ["มี"]);
  assert.deepEqual(r.noPin.map((s) => s.pr).sort(), ["ว่าง2", "ไม่มี"]);
});

ok("ยังไม่ตั้งจุดโกดัง = จัดให้ไม่ได้ ทุกจุดกองรอจัดมือ (ไม่เดา)", () => {
  const stops = [stop("A", 0.01, 0.05), stop("B", 0.02, 0.05)];
  [null, undefined, { lat: 0, lng: 0 }].forEach((bad) => {
    const r = P.planTrips(stops, { origin: bad });
    assert.equal(r.trips.length, 0);
    assert.equal(r.noPin.length, 2);
  });
});

// ── ⑥ สูตรแนะนำรถ: ที่เดียวของระบบ ────────────────────────────────
ok("สูตรแนะนำรถตรงกับ pacred ทุกขอบ", () => {
  assert.equal(P.recommendVehicle(0, 0), "รถกระบะ");
  assert.equal(P.recommendVehicle(1800, 6), "รถกระบะ");
  assert.equal(P.recommendVehicle(1801, 6), "6 ล้อเล็ก");
  assert.equal(P.recommendVehicle(1800, 6.1), "6 ล้อเล็ก");
  assert.equal(P.recommendVehicle(3500, 12), "6 ล้อเล็ก");
  assert.equal(P.recommendVehicle(3501, 12), "6 ล้อใหญ่");
  assert.equal(P.recommendVehicle(5000, 30), "6 ล้อใหญ่");
  assert.equal(P.recommendVehicle(5001, 30), "มากกว่ารถที่กำหนด");
  assert.equal(P.recommendVehicle(100, 31), "มากกว่ารถที่กำหนด");
});

ok("🧪 ยาม: ห้ามมีสำเนาสูตรแนะนำรถใน delivery.js / delivery.html", () => {
  ["delivery.js", "delivery.html"].forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.ok(!/1800[\s\S]{0,80}6 ล้อเล็ก/.test(src),
      f + ": เขียนบันไดพิกัดรถซ้ำ — ต้องเรียก trip-plan.recommendVehicle ตัวเดียว");
  });
});

// ── เลขที่จอโชว์ ──────────────────────────────────────────────────
ok("บวกกล่อง/กก./คิว/แทรค ถูกทุกช่อง", () => {
  const a = stop("A", 0.01, 0.05);
  a.items = [{ tracking: "T1", boxes: 3, weightKg: 12.5, cbm: 0.25 }, { tracking: "T2", boxes: 2, weightKg: 7.5, cbm: 0.125 }];
  const b = stop("B", 0.02, 0.05);
  b.items = [{ tracking: "T3", boxes: 1, weightKg: 5, cbm: 0.5 }];
  const t = P.planTrips([a, b], { origin: WH }).trips[0];
  assert.equal(t.stopCount, 2);
  assert.equal(t.trackings, 3);
  assert.equal(t.boxes, 6);
  assert.equal(t.kg, 25);
  assert.equal(t.cbm, 0.875);
  assert.ok(t.km > 0, "ต้องคิดระยะทางได้");
  assert.equal(t.vehicle, "รถกระบะ");
});

ok("กล่องที่ไม่ได้กรอกจำนวน = นับ 1 (ไม่ใช่ 0)", () => {
  const a = stop("A", 0.01, 0.05);
  a.items = [{ tracking: "T1" }, { tracking: "T2", boxes: 0 }];
  assert.equal(P.planTrips([a], { origin: WH }).trips[0].boxes, 2);
});

ok("นับจุดที่ยังไม่มีหมุดในเที่ยว = 0 (เพราะไม่เคยถูกจัดเข้าเที่ยว)", () => {
  const r = P.planTrips([stop("A", 0.01, 0.05), stop("B", null, null)], { origin: WH });
  assert.equal(r.trips[0].noPin, 0);
});

// ── เรียงลำดับในเที่ยว ────────────────────────────────────────────
ok("ในเที่ยวเรียงใกล้สุดก่อน", () => {
  const far = stop("ไกล", 0.09, 0.0);
  const near = stop("ใกล้", 0.01, 0.0);
  const mid = stop("กลาง", 0.04, 0.0);
  assert.deepEqual(P.orderByNearest([far, mid, near], WH).map((s) => s.pr), ["ใกล้", "กลาง", "ไกล"]);
});

ok("จุดไม่มีหมุดต่อท้าย ตามลำดับที่กดเพิ่ม (วัดระยะไม่ได้ ≠ ระยะ 0)", () => {
  const out = P.orderByNearest([stop("x1", null, null), stop("ไกล", 0.09, 0), stop("x2", null, null), stop("ใกล้", 0.01, 0)], WH);
  assert.deepEqual(out.map((s) => s.pr), ["ใกล้", "ไกล", "x1", "x2"]);
});

ok("ระยะทางนับรอบวง (กลับโกดังด้วย) — ไกลกว่าไปทางเดียวเสมอ", () => {
  const one = [stop("A", 0.09, 0)];
  const km = P.routeKm(one, WH);
  assert.ok(Math.abs(km - 2 * P.haversineKm(WH, one[0])) < 1e-6, "ไป-กลับ = 2 เท่า");
});

// ── ทิศ / ชื่อโซน ─────────────────────────────────────────────────
ok("มุมจากโกดัง: เหนือ=0 · ตะวันออก=90° · ใต้=180° · ตะวันตก=270°", () => {
  const deg = (p) => Math.round((P.bearingFrom(WH, p) * 180) / Math.PI);
  assert.equal(deg({ lat: WH.lat + 0.1, lng: WH.lng }), 0);
  assert.equal(deg({ lat: WH.lat, lng: WH.lng + 0.1 }), 90);
  assert.equal(deg({ lat: WH.lat - 0.1, lng: WH.lng }), 180);
  assert.equal(deg({ lat: WH.lat, lng: WH.lng - 0.1 }), 270);
});

ok("ทิศเป็นคำไทย", () => {
  assert.equal(P.compassOf(0), "เหนือ");
  assert.equal(P.compassOf(Math.PI / 2), "ตะวันออก");
  assert.equal(P.compassOf(Math.PI), "ใต้");
  assert.equal(P.compassOf((3 * Math.PI) / 2), "ตะวันตก");
  assert.equal(P.compassOf(2 * Math.PI), "เหนือ", "ครบวงต้องกลับมาเหนือ ไม่ใช่พัง");
});

ok("ชื่อโซน: จังหวัดเดียว อำเภอเดียว = บอกทั้งคู่", () => {
  const s = [stop("A", 0.01, 0.01, { province: "นนทบุรี", district: "บางกรวย" }),
             stop("B", 0.02, 0.01, { province: "นนทบุรี", district: "บางกรวย" })];
  assert.equal(P.zoneOf(s, WH), "นนทบุรี · บางกรวย");
});

ok("🪤 จังหวัดเดียว หลายอำเภอ = บอกจำนวน ไม่ใช่หยิบอำเภอเดียวมาหลอก", () => {
  const s = [stop("A", 0.01, 0.01, { province: "นนทบุรี", district: "บางกรวย" }),
             stop("B", 0.02, 0.01, { province: "นนทบุรี", district: "บางใหญ่" }),
             stop("C", 0.03, 0.01, { province: "นนทบุรี", district: "ไทรน้อย" })];
  assert.equal(P.zoneOf(s, WH), "นนทบุรี (3 อำเภอ)");
});

ok("ชื่อโซน: 2 จังหวัด = เขียนทั้ง 2 · 3 จังหวัดขึ้นไป = บอกจำนวน", () => {
  const two = [stop("A", 0.01, 0.01, { province: "นนทบุรี" }), stop("B", 0.02, 0.01, { province: "ปทุมธานี" })];
  assert.equal(P.zoneOf(two, WH), "นนทบุรี · ปทุมธานี");
  const three = two.concat([stop("C", 0.03, 0.01, { province: "สมุทรปราการ" })]);
  assert.equal(P.zoneOf(three, WH), "นนทบุรี +2 จังหวัด");
});

ok("ไม่มีชื่อพื้นที่เลย (งานเก่า) = บอกทิศ + ระยะ ไม่ใช่ช่องว่าง", () => {
  const z = P.zoneOf([stop("A", 0.09, 0)], WH);
  assert.match(z, /^ทางเหนือ ~\d+ กม\.$/, "ได้: " + z);
});

// ── จับรถให้เที่ยว ─────────────────────────────────────────────────
const TRUCKS = [
  { id: "p1", name: "กระบะ 1", vehicle_type: "รถกระบะ" },
  { id: "s1", name: "หกล้อเล็ก 1", vehicle_type: "6 ล้อเล็ก" },
  { id: "b1", name: "หกล้อใหญ่ 1", vehicle_type: "6 ล้อใหญ่" },
];
const tripOf = (kg, cbm) => ({ kg: kg, cbm: cbm });

ok("ได้คันเล็กสุดที่รับไหว (ไม่เอาคันใหญ่มาวิ่งของเบา)", () => {
  const r = P.assignTrucks([tripOf(500, 2)], TRUCKS);
  assert.equal(r[0].truck.id, "p1");
});

ok("🔑 เที่ยวหนักได้คันใหญ่ก่อน (ไม่ใช่เที่ยวแรกคว้าไป)", () => {
  /* เที่ยวแรกเบา เที่ยวสองหนัก — ถ้าไล่ตามลำดับ เที่ยวแรกจะคว้ากระบะ แล้วเที่ยวสองได้หกล้อ ก็ยังถูก
     เคสที่พังจริงคือมีรถคันเดียว: เที่ยวเบาคว้าไป เที่ยวหนักเหลือ null ทั้งที่คันนั้นรับไหวทั้งคู่ */
  const one = [{ id: "b1", name: "หกล้อใหญ่ 1", vehicle_type: "6 ล้อใหญ่" }];
  const r = P.assignTrucks([tripOf(100, 0.5), tripOf(4800, 25)], one);
  assert.equal(r[1].truck.id, "b1", "ของหนักต้องได้รถ");
  assert.equal(r[0].truck, null, "ของเบารอรอบหน้า");
  assert.equal(r[0].truckNote, "ไม่มีรถว่างที่รับไหว");
});

ok("🪤 รถคันเดียวห้ามถูกจับ 2 เที่ยว", () => {
  const r = P.assignTrucks([tripOf(100, 1), tripOf(120, 1), tripOf(130, 1)], [TRUCKS[0]]);
  const ids = r.map((x) => x.truck && x.truck.id).filter(Boolean);
  assert.equal(ids.length, 1);
  assert.equal(new Set(ids).size, 1);
});

ok("พิกัดที่กรอกเองชนะพิกัดมาตรฐานของประเภทรถ", () => {
  assert.deepEqual(P.truckCaps({ vehicle_type: "รถกระบะ" }), { kg: 1800, cbm: 6 });
  assert.deepEqual(P.truckCaps({ vehicle_type: "รถกระบะ", cap_kg: 900, cap_cbm: 3 }), { kg: 900, cbm: 3 });
  assert.deepEqual(P.truckCaps({ vehicle_type: "อื่นๆ" }), { kg: 0, cbm: 0 }, "ประเภทอื่นๆ ไม่มีพิกัดมาตรฐาน");
});

ok("รถที่ปิดใช้งาน ไม่ถูกจับ", () => {
  const r = P.assignTrucks([tripOf(100, 1)], [{ id: "x", name: "พัก", vehicle_type: "6 ล้อใหญ่", active: false }]);
  assert.equal(r[0].truck, null);
});

ok("ยังไม่ได้ลงทะเบียนรถ = บอกตรงๆ (ไม่ใช่เงียบ)", () => {
  const r = P.assignTrucks([tripOf(100, 1)], []);
  assert.equal(r[0].truck, null);
  assert.equal(r[0].truckNote, "ยังไม่ได้ลงทะเบียนรถ");
});

ok("จับรถแล้วเลขของเที่ยวไม่เปลี่ยน + ลำดับเที่ยวไม่สลับ", () => {
  const plan = P.planTrips([stop("A", 0.01, 0.05), stop("B", 0.02, -0.05)], { origin: WH, maxStops: 1 });
  const withT = P.assignTrucks(plan.trips, TRUCKS);
  assert.deepEqual(withT.map((x) => x.seq), plan.trips.map((x) => x.seq));
  assert.deepEqual(withT.map((x) => x.stops.map((s) => s.pr)), plan.trips.map((x) => x.stops.map((s) => s.pr)));
});

ok("🧪 ยาม: จอต้องผูก “เที่ยวที่กำลังทำ” กับใบที่เพิ่งเก็บ ด้วยเลขแทรค ไม่ใช่ลำดับ", () => {
  /* ไม่ผูก = กดเก็บแล้วกดบันทึกต่อ ได้ใบงาน 2 ใบของงานชุดเดียวกัน (รถ 2 คันไปจุดเดียวกัน)
     ผูกด้วยลำดับ = กดจัดรถใหม่ทีไรลำดับเปลี่ยน แล้วไปผูกผิดเที่ยว */
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(/function sameAsRoute\(/.test(html), "หาตัวเทียบ sameAsRoute ไม่เจอ");
  assert.ok(/if\(sameAsRoute\(t\)\)\{ curTripId=id;/.test(html), "เก็บเที่ยวแล้วต้องผูก curTripId");
  assert.ok(!/lookedIdx/.test(html), "ยังเทียบด้วยลำดับอยู่ (lookedIdx) — ลำดับเปลี่ยนทุกครั้งที่จัดใหม่");
});

// ── ⑦ งานไหน "รถเราวิ่งเอง" (ภูม 2026-11-24) ───────────────────────────
//
// ภูม: *"รถขนส่งของเราที่วิ่งมันวิ่งเฉพาะเหมาๆ … อันนี้เหมือนแกดึงมาหมดเลย ถูกไหม"*
// ของเดิมกรองออกแค่ "รับเองหน้าโกดัง" ⇒ Flash / Lalamove / J&T / ไปรษณีย์ หลุดเข้ามา
// กินน้ำหนัก/คิวในรถ + ถูกจัดเป็นจุดส่ง ทั้งที่คนขับเราไม่ได้ไปส่ง (วัด prod 24/11 = 203 งาน)

ok("เหมาๆ (PRF · PCSF) = รถเราวิ่ง", () => {
  assert.equal(P.carrierKindOf("PRF"), "own");
  assert.equal(P.carrierKindOf("PCSF"), "own");
});

ok("Pacred Express (PRE · PCSE) = รถเราวิ่ง (ภูมเคาะ 24/11 ให้เอาด้วย)", () => {
  assert.equal(P.carrierKindOf("PRE"), "own");
  assert.equal(P.carrierKindOf("PCSE"), "own");
});

ok("เจ้าอื่นไปส่ง = ไม่เอามาจัดรถ", () => {
  /* รหัสจริงจากตัวตัดสินของ Pacred — 2 Flash · 58 Lalamove · 24 J&T · 11 ไปรษณีย์ · PCS รับเอง
     13 / 7 / 21 / plpn = เจ้าที่พบจริงบน prod (นับได้ 118 แถว) */
  for (const c of ["2", "58", "24", "11", "PCS", "13", "7", "21", "plpn"]) {
    assert.equal(P.carrierKindOf(c), "other", "รหัส " + c + " ต้องไม่ใช่รถเรา");
  }
});

ok("🪤 ไม่มีรหัส = unknown ไม่ใช่ other (ห้ามตัดทิ้งเงียบ)", () => {
  /* prod 24/11 มี 32 แถวที่ช่องนี้ว่าง — ถ้าเหมาว่า "ไม่ใช่รถเรา" แล้วตัดทิ้ง
     งานที่ลูกค้าจ่ายเงินแล้วจะหายจากหน้าวางแผนโดยไม่มีใครรู้
     = รูปเดียวกับ "แทรคตกหล่น" ที่เพิ่งไล่กันเมื่อเช้า */
  for (const c of [null, undefined, "", "   "]) {
    assert.equal(P.carrierKindOf(c), "unknown", "ค่า " + JSON.stringify(c) + " ต้องเป็น unknown");
  }
});

ok("ตัวพิมพ์เล็ก / มีช่องว่างติดมา ก็ยังอ่านออก", () => {
  assert.equal(P.carrierKindOf(" prf "), "own");
  assert.equal(P.carrierKindOf("pcse"), "own");
});

ok("ยาม: readyJobs ถามตัวตัดสินตัวเดียว ไม่เขียนลิสต์รหัสเอง", () => {
  const js = fs.readFileSync(path.join(__dirname, "delivery.js"), "utf8");
  assert.ok(/carrierKindOf/.test(js), "delivery.js ต้องใช้ carrierKindOf");
  assert.ok(/const kind = carrierKindOf\(j\.carrier\)/.test(js), "ต้องถามตัวตัดสินด้วย j.carrier");
  /* ห้ามใครก๊อปลิสต์รหัสไปไว้ที่อื่น (รอยเดิมของบ้านเรา: ลิสต์ role 2 ก๊อป) */
  assert.ok(!/PCSF/.test(js), "delivery.js ห้ามเขียนรหัส PCSF เอง — ต้องอ่านจาก trip-plan.js");
});

ok("ยาม: งานที่ตัดออกต้องถูกรายงาน ไม่ใช่หายเงียบ", () => {
  const js = fs.readFileSync(path.join(__dirname, "delivery.js"), "utf8");
  assert.ok(js.indexOf("const skipped = { other: 0, unknown: [], assigned: 0, assignedUnknown:") >= 0, "ต้องนับของที่ตัดออก");
  assert.ok(js.indexOf("skipped.assigned += 1") >= 0, "งานที่มอบให้คนขับแล้ว = นับไว้");
  assert.ok(js.indexOf("assignedUnknown: runs.ok === false") >= 0, "อ่านรอบมอบไม่ได้ = ต้องบอก ไม่ใช่เงียบ");
  assert.ok(/skipped\.other \+= 1/.test(js), "เจ้าอื่นส่ง = นับไว้");
  assert.ok(/skipped\.unknown\.push/.test(js), "ไม่มีรหัส = จดเลขแทรคไว้ให้ตามต่อ");
  assert.ok(/jobs: out, at: live\.at \|\| null, skipped/.test(js), "ต้องคืน skipped ออกไปให้จอ");
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(/jobSkip=r\.skipped/.test(html), "จอต้องรับ skipped มาเก็บ");
  assert.ok(/jobSkip\.other/.test(html), "จอต้องบอกว่าซ่อนไปกี่งาน");
  assert.ok(/ตัดสินไม่ได้/.test(html), "จอต้องเตือนงานที่ไม่มีรหัสขนส่ง");
});

// ── ⑧ เพดานเวลาต่อเที่ยว (ภูม 2026-11-24) ──────────────────────────────
//
// ภูม: *"ที่แกทำมา มันกลายเป็นรถคนขับวิ่งไกลโคตรเลยอะ เห็นไหม · ถ้าวิ่งแบบนี้
//        คิดว่าคนขับไม่วิ่งแทบทั้งวันเลยหรอ ไหนจะรถติดอีก"*
//
// วัดงานจริง 24/11 (45 จุด) ด้วยสูตรเดียวกันทั้งก่อน-หลัง:
//   ก่อน = 6 เที่ยว · ยาวสุด 10.4 ชม. · เกิน 8 ชม. 3 เที่ยว
//   หลัง = 8 เที่ยว · ยาวสุด 7.9 ชม. · เกิน 0 เที่ยว

ok("estHours: คิดบนถนนจริง (x1.35) ไม่ใช่เส้นตรง + บวกเวลาต่อจุด", () => {
  /* 100 กม.เส้นตรง → ถนน 135 กม. ÷ 25 กม./ชม. = 5.4 ชม. + 6 จุด × 10 นาที = 1 ชม. */
  const h = P.estHours(100, 6, { kmh: 25, minPerStop: 10 });
  assert.ok(Math.abs(h - 6.4) < 0.01, "ได้ " + h + " ควรได้ 6.4");
  assert.ok(P.ROAD_FACTOR > 1, "ถนนจริงต้องยาวกว่าเส้นตรง");
});

ok("estHours: รถติดลงแล้วเวลาเพิ่ม (ปรับได้ ไม่ฝังตาย)", () => {
  const ok25 = P.estHours(100, 0, { kmh: 25 });
  const jam = P.estHours(100, 0, { kmh: 18 });
  assert.ok(jam > ok25, "รถติดกว่า = ใช้เวลานานกว่า");
});

ok("🔑 เที่ยวถูกตัดเมื่อชนเพดานเวลา (ไม่ใช่รอให้เต็มคันก่อน)", () => {
  /* 6 จุดเรียงไกลขึ้นเรื่อยๆ ทางเดียวกัน · น้ำหนักเบามาก ⇒ ของเดิมจะยัดเที่ยวเดียวหมด */
  const far = [];
  for (let i = 1; i <= 6; i++) far.push(stop("P" + i, 0.08 * i, 0.01 * i));
  const loose = P.planTrips(far, { origin: WH, maxHours: 999 });
  const tight = P.planTrips(far, { origin: WH, maxHours: 3 });
  assert.equal(loose.trips.length, 1, "ไม่มีเพดาน = เที่ยวเดียว");
  assert.ok(tight.trips.length > 1, "มีเพดาน = ต้องแตกเที่ยว (ได้ " + tight.trips.length + ")");
  for (const t of tight.trips) {
    assert.ok(t.hours <= 3 + 1e-6 || t.stops.length === 1, "เที่ยวหลายจุดห้ามเกินเพดาน: " + t.hours);
  }
});

ok("🪤 จุดเดียวที่ไกลเกินเพดาน = ขึ้นเที่ยวแล้วติดธง ไม่ใช่หายไป", () => {
  /* คนขับต้องรู้ว่ามีงานนี้อยู่ ถึงจะตัดสินใจได้ว่าจะทำยังไง — หายเงียบคือสิ่งที่ห้ามที่สุด */
  const r = P.planTrips([stop("ใกล้", 0.01, 0.01), stop("ไกลมาก", 2.5, 0.5)], { origin: WH, maxHours: 2 });
  const prs = r.trips.flatMap((t) => t.stops.map((s) => s.pr)).concat(r.noPin.map((s) => s.pr));
  assert.deepEqual(prs.sort(), ["ไกลมาก", "ใกล้"].sort(), "ห้ามมีจุดไหนหาย");
  const t = r.trips.filter((x) => x.stops.some((s) => s.pr === "ไกลมาก"))[0];
  assert.ok(t, "จุดไกลต้องอยู่ในเที่ยวใดเที่ยวหนึ่ง");
  assert.equal(t.over.hours, true, "ต้องติดธงว่าเกินเวลา");
});

ok("🔑 ไม่มีงานหายแม้เพดานแคบมาก (ข้อที่ห้ามพลาดที่สุด)", () => {
  const many = [];
  for (let i = 0; i < 25; i++) many.push(stop("Q" + i, 0.02 * (i % 7) + 0.01, 0.03 * (i % 5) - 0.06));
  const r = P.planTrips(many, { origin: WH, maxHours: 1.2 });
  const seen = r.trips.flatMap((t) => t.stops.map((s) => s.pr)).concat(r.noPin.map((s) => s.pr));
  assert.equal(seen.length, 25, "จำนวนจุดต้องเท่าเดิม (ได้ " + seen.length + ")");
  assert.equal(new Set(seen).size, 25, "ห้ามมีจุดไหนโผล่ 2 เที่ยว");
});

ok("summarize คืนชั่วโมงให้จอโชว์ (ตัวเดียวกับที่ใช้ตัดสิน)", () => {
  const r = P.planTrips([stop("A", 0.05, 0.02), stop("B", 0.06, 0.03)], { origin: WH });
  const t = r.trips[0];
  assert.ok(t.hours > 0, "ต้องมีช่อง hours");
  assert.ok(Math.abs(t.hours - P.estHours(t.km, t.stopCount, P.PLAN_DEFAULTS)) < 0.02,
    "เลขบนการ์ดต้องมาจาก estHours ตัวเดียวกัน");
});

ok("ยาม: จอมีปุ่มตั้งชั่วโมง/ความเร็ว และอ่านไปใช้จริง", () => {
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(/id="maxHours"/.test(html), "ต้องมีช่องตั้งชั่วโมงบนจอ");
  assert.ok(/id="planKmh"/.test(html), "ต้องมีช่องตั้งความเร็ว (รถติดปรับได้)");
  assert.ok(/maxHours:\(isFinite\(h\)&&h>0\)\?h:/.test(html), "planCaps ต้องอ่านค่าชั่วโมงไปใช้");
  assert.ok(/kmh:\(isFinite\(v\)&&v>0\)\?v:/.test(html), "planCaps ต้องอ่านค่าความเร็วไปใช้");
  assert.ok(/t\.hours\+' ชม\./.test(html), "การ์ดเที่ยวต้องโชว์ชั่วโมง");
  assert.ok(/t\.over&&t\.over\.hours/.test(html), "ต้องเตือนเที่ยวที่เกินเวลา");
  /* สูตรเวลาต้องมีที่เดียว — ห้ามจอคิดเอง */
  assert.ok(!/1\.35/.test(html), "delivery.html ห้ามเขียนตัวคูณระยะถนนเอง");
});

// ── ⑨ หมุดบนแผนที่ (ภูม 2026-11-25) ─────────────────────────────────────
//
// ภูม: *"ในแผนที่ตอนนี้จะขึ้นหมุดของทุกเจ้าที่เรามีเลยถูกไหม ซึ่งมันเยอะไปอะ
//        อยากให้มันขึ้นแค่หมุดของลูกค้าที่มีของต้องส่งแค่นั้นอะ"*

const JOB = (pr, dLat, dLng) => ({ pr: pr, lat: WH.lat + dLat, lng: WH.lng + dLng, geo: "tambon", address: "บ้าน " + pr });
const BOOK = [
  { pr: "PR001", lat: 13.7, lng: 100.5, address: "ก" },
  { pr: "PR002", lat: 13.8, lng: 100.6, address: "ข" },
  { pr: "PR999", lat: 13.9, lng: 100.7, address: "ค" },
];

ok("ตั้งต้น: ขึ้นเฉพาะลูกค้าที่มีของต้องส่ง ไม่ใช่สมุดหมุดทั้งเล่ม", () => {
  const r = P.pinsForMap({ pins: BOOK, jobs: [JOB("PR001", 0.02, 0.01)] });
  assert.deepEqual(r.map((p) => p.pr), ["PR001"], "สมุดมี 3 ราย แต่มีของต้องส่งรายเดียว");
});

ok("กดสวิตช์ (all) = ได้สมุดหมุดทั้งเล่มเหมือนเดิมทุกจุด", () => {
  const r = P.pinsForMap({ all: true, pins: BOOK, jobs: [] });
  assert.deepEqual(r.map((p) => p.pr), ["PR001", "PR002", "PR999"]);
  assert.notEqual(r, BOOK, "ต้องคืนสำเนา ไม่ใช่ตัวเดิม (กันใครเผลอแก้สมุด)");
});

ok("ลูกค้ารายเดียวมีหลายแทรค = หมุดเดียว ไม่ซ้อนกัน", () => {
  const r = P.pinsForMap({ pins: [], jobs: [JOB("PR050", 0.01, 0.01), JOB("PR050", 0.01, 0.01), JOB("PR060", 0.02, 0.02)] });
  assert.deepEqual(r.map((p) => p.pr), ["PR050", "PR060"]);
});

ok("งานที่อยู่ในเที่ยวแล้วไม่ปักซ้ำ (มันมีหมุดเลขจุดของตัวเอง)", () => {
  const jobs = [JOB("PR001", 0.01, 0.01), JOB("PR002", 0.02, 0.02)];
  const r = P.pinsForMap({ pins: [], jobs: jobs, routePrs: ["PR001"] });
  assert.deepEqual(r.map((p) => p.pr), ["PR002"]);
});

ok("🪤 งานที่ยังไม่มีหมุด = ไม่ปักมั่ว", () => {
  /* ปักที่ 0,0 หรือที่โกดัง = คนวางแผนเชื่อว่ารู้ที่อยู่แล้ว ทั้งที่ยังไม่รู้ */
  const noPin = { pr: "PR777", address: "ยังไม่เคยปัก" };
  const zero = { pr: "PR888", lat: 0, lng: 0 };
  const r = P.pinsForMap({ pins: BOOK, jobs: [noPin, zero, JOB("PR001", 0.01, 0.01)] });
  assert.deepEqual(r.map((p) => p.pr), ["PR001"]);
});

ok("ยังไม่ได้ดึงงาน = แผนที่ว่าง (ไม่ตกไปโชว์ทั้งเล่มเอง)", () => {
  assert.deepEqual(P.pinsForMap({ pins: BOOK, jobs: [] }), []);
  assert.deepEqual(P.pinsForMap({ pins: BOOK }), []);
  assert.deepEqual(P.pinsForMap(), []);
});

ok("ยาม: จอเรียกตัวตัดสินตัวเดียว ไม่เขียนสูตรกรองหมุดเอง", () => {
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(/PLAN\.pinsForMap\(/.test(html), "mapPins ต้องเรียก PLAN.pinsForMap");
  assert.ok(!/if\(pinsAll\) return pins;/.test(html), "จอห้ามตัดสินเองว่าโหมดไหนใช้หมุดชุดไหน");
});

ok("ยาม: มีสวิตช์หมุดมุมขวาบน · ตั้งต้นเป็น \"เฉพาะงานที่ต้องส่ง\" · จำค่าไว้", () => {
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(/id="pinsw"/.test(html), "ต้องมีปุ่มสวิตช์บนแผนที่");
  assert.ok(/var pinsAll=false;/.test(html), "ตั้งต้นต้องเป็นเฉพาะงานที่ต้องส่ง");
  assert.ok(/localStorage\.setItem\("dp_pins_all"/.test(html), "ต้องจำค่าที่เลือกไว้");
  assert.ok(/\.pinsw\{position:absolute;right:/.test(html), "ปุ่มต้องลอยอยู่มุมขวาของแผนที่");
});

ok("ยาม: \"เส้นทางเที่ยวนี้\" พับได้ และจำสถานะไว้", () => {
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(/id="stopsHd"/.test(html) && /sub2 fold/.test(html), "หัวข้อต้องกดพับได้");
  assert.ok(/id="stops" class="foldbody"/.test(html), "ตัวรายการต้องพับตามหัวข้อ");
  assert.ok(/localStorage\.setItem\("dp_stops_closed"/.test(html), "ต้องจำว่าพับไว้หรือกางไว้");
});

ok("🪤 ยาม: รายการซ้ายมือห้ามผูกหมุดด้วยลำดับอีก", () => {
  /* พอแผนที่โชว์ไม่ครบทุกหมุด ลำดับใน pins กับลำดับหมุดจะไม่ตรงกัน ⇒ กดแถวแล้วเปิดป้ายผิดจุด */
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(!/pins\.indexOf\(p\)/.test(html), "ห้ามใช้ pins.indexOf เป็นคีย์ของหมุด");
  assert.ok(/function pinKey\(p\)/.test(html), "ต้องผูกด้วยคีย์ของหมุด");
  assert.ok(/markers\[pinKey\(p\)\]=m/.test(html), "เก็บหมุดด้วยคีย์");
});

// ── ⑩ 🔴 ของที่เบราว์เซอร์ได้จริง ต้องครบทุกตัวที่จอเรียก (ภูม 2026-11-25) ──────
//
// เคสจริงที่หลุดขึ้น prod วันนี้: ภูม *"กดอะไรไม่ได้เลยอะ มันค้างหรือว่ายังไง"*
//   ไฟล์นี้รันได้ 2 ที่ — ฝั่ง server `require()` ตรงๆ · ฝั่งจอถูก **ฝังซอร์สลงหน้าเว็บ**
//   แล้วแปะเป็น `window.DP_PLAN` โดย delivery-page.js
//   เดิมตรงนั้นเป็น **ลิสต์ชื่อที่พิมพ์มือ** ⇒ เพิ่ม pinsForMap ที่นี่แต่ลืมเติมที่นั่น
//   ⇒ จอได้ undefined ⇒ โยน TypeError กลางขั้นตอนเปิดหน้า ⇒ **ทั้งหน้าตายเงียบ**
//      (เทสเดิมจับไม่ได้ เพราะมันเรียกผ่าน require ซึ่งได้ครบอยู่แล้ว)

ok("🔴 ทุก PLAN.x ที่จอเรียก ต้องมีใน window.DP_PLAN จริง", () => {
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  const { planBrowserSource } = require("./delivery-page.js");
  /* รันตัวสร้างของจริง แล้วดูว่าเบราว์เซอร์ได้ชื่ออะไรบ้าง */
  const built = planBrowserSource();
  const win = {};
  new Function("window", built)(win);
  assert.ok(win.DP_PLAN, "ตัวสร้างต้องแปะ window.DP_PLAN");

  const used = [...new Set([...html.matchAll(/PLAN\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
  assert.ok(used.length > 5, "หา PLAN.x ในจอไม่เจอ — regex เพี้ยนหรือจอเปลี่ยนรูป");
  const missing = used.filter((n) => win.DP_PLAN[n] === undefined);
  assert.deepEqual(missing, [], "จอเรียกของที่เบราว์เซอร์ไม่มี: " + missing.join(", "));
});

ok("ยาม: ห้ามกลับไปพิมพ์ลิสต์ชื่อมือ — ต้องยกจาก module.exports", () => {
  const dp = fs.readFileSync(path.join(__dirname, "delivery-page.js"), "utf8");
  assert.ok(/window\.DP_PLAN = \" \+ line\.replace/.test(dp),
    "ต้องยกวงเล็บของ module.exports มาตรงๆ ไม่ใช่พิมพ์ชื่อเอง");
  assert.ok(!/DP_PLAN = \{ VEHICLES,/.test(dp), "เจอลิสต์พิมพ์มือกลับมาอีกแล้ว");
});

ok("ของที่ require ได้ ต้องเท่ากับของที่เบราว์เซอร์ได้ (ไม่มีฝั่งไหนขาด)", () => {
  const { planBrowserSource } = require("./delivery-page.js");
  const win = {};
  new Function("window", planBrowserSource())(win);
  const a = Object.keys(P).sort(), b = Object.keys(win.DP_PLAN).sort();
  assert.deepEqual(b, a, "ฝั่ง server กับฝั่งจอต้องได้ของชุดเดียวกัน");
});

// ── ⑪ การ์ดจุดส่งในเที่ยวพับได้ (ภูม 2026-11-25) ────────────────────────
//
// ภูม: *"ไม่ใช่แค่ให้เพิ่ม dropdown ตรงนี้ แต่ให้เพิ่มตรง PR ของลูกค้า เหมือนชุดด้านบนด้วยไง"*
// ⇒ ยกทรงมาจากการ์ดงานด้านบน (.prcard) ให้เหมือนกันทั้ง 2 ชุด · ตั้งต้น "พับ" เหมือนกัน

/* 📱 ภูม 2026-11-25 (ภาพจอ Samsung A55 360px): *"พอเป็น ver. มือถือ มันทับกันเห็นไหม
   มันจะกดไม่ได้นะ แก้ไขด้วยนะ"*

   วัดบนจอจริงตอนยังไม่แก้: กางลิ้นชักแล้วแตะกลางแท็บ 3 จาก 4 แท็บไปโดนสวิตช์หมุด
   (เที่ยวส่ง → .sw · รถ → #pinswT · มอบหมายแล้ว → #pinswN) เพราะสวิตช์ z-index 1200
   ลอยทับลิ้นชัก z-index 1100. ยามนี้กันไม่ให้หลุดกลับไปอีก. */
ok("📱 มือถือ: กางลิ้นชักแล้วสวิตช์หมุดต้องไม่ทับแถบแท็บ", () => {
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");

  // สวิตช์ยังต้องลอยอยู่เหนือแผนที่เหมือนเดิม (ไม่ได้แก้ด้วยการถอดทิ้ง)
  assert.ok(html.includes(".pinsw{position:absolute"), "สวิตช์ต้องยังลอยอยู่มุมขวาบนของแผนที่");

  // กติกาซ่อนต้องอยู่ "ใน" บล็อกมือถือเท่านั้น — จอคอมไม่มีลิ้นชัก ซ่อนทิ้งจะหาสวิตช์ไม่เจอ
  const at = html.indexOf("@media (max-width:720px){");
  assert.ok(at >= 0, "ต้องมีบล็อก @media (max-width:720px)");
  const mobileBlock = html.slice(at, html.indexOf(EOL + "  }", at));
  assert.ok(
    mobileBlock.includes(".panel.open ~ .pinsw{display:none}"),
    "กางลิ้นชักบนมือถือต้องซ่อนสวิตช์หมุด ไม่งั้นมันทับแท็บจนกดไม่ได้",
  );

  // 🪤 ลำดับใน DOM ต้องเป็น .panel มาก่อน .pinsw ไม่งั้นตัวเลือก ~ ไม่ทำงานเลย (เงียบๆ)
  assert.ok(
    html.indexOf('class="panel"') < html.indexOf('class="pinsw"'),
    "ตัวเลือก ~ ใช้ได้เฉพาะเมื่อ .pinsw อยู่หลัง .panel ใน DOM",
  );
});
ok("การ์ดจุดส่งพับได้ ทรงเดียวกับการ์ดงานด้านบน", () => {
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(html.includes('card.className="stopcard"+(sop?" open":"")'), "การ์ดต้องมีคลาส open ตามสถานะ");
  assert.ok(html.indexOf('<div class="stophead"><svg class="i cv"') >= 0, "หัวการ์ดต้องมีลูกศรเหมือน .prhead");
  assert.ok(html.includes(".sitems{padding:2px 0;display:none}"), "พับอยู่ = ซ่อนรายการแทรค");
  assert.ok(html.includes(".stopcard.open .sitems{display:block}"), "กางแล้วต้องโชว์");
  assert.ok(html.includes(".stopcard.open .stophead .cv{transform:rotate(180deg)}"), "ลูกศรต้องหมุนตอนกาง");
  assert.ok(html.includes("var sopen={};"), "ต้องจำว่าการ์ดใบไหนกางอยู่");
});

ok("🪤 กดหัวการ์ดแล้วพับ แต่ปุ่ม ↑ ↓ ✕ ต้องยังทำงานของมัน", () => {
  /* ปุ่มเลื่อนลำดับ/ลบจุด อยู่ใน .stophead ⇒ ถ้าไม่กันไว้ กดแล้วการ์ดจะพับไปด้วย
     (แพทเทินเดียวกับ .prall ของการ์ดงานด้านบน) */
  const html = fs.readFileSync(path.join(__dirname, "delivery.html"), "utf8");
  assert.ok(html.includes('if(e.target.closest(".ctl"))return; sopen[sk]=!sop;'),
    "ต้องข้ามการพับเมื่อกดปุ่มในกลุ่ม .ctl");
});

console.log("\n  " + pass + " ผ่าน · " + fail + " ไม่ผ่าน\n");
process.exit(fail ? 1 : 0);
