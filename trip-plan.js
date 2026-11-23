// ============================================================
// 🚚 trip-plan.js — "จัดรถอัตโนมัติ" (ภูม 2026-11-23)
//
// ภูม: *"สมมุติ PR นี่บ้านอยู่โซนนี้ แล้วอีก PR อยู่โซนใกล้เคียงกัน คือระบบจับมอบหมายให้
//        อัตโนมัติเลย แต่ไม่ได้กดส่งไปเลย แค่กดแล้วระบบจัดมาให้ดูก่อนว่ามีกี่จุด …
//        ไม่ใช่แค่ระบบจัดเส้นทางให้ว่าควรไปที่ไหนก่อนแค่นั้นนะ"*
//
// ⇒ ของเดิมทำแค่ **เรียงลำดับจุดในเที่ยวเดียว** · ตัวนี้ทำ **แบ่งเป็นหลายเที่ยว** ให้เลย
//   แล้วเอาไปโชว์ให้คนดูก่อน ⇒ **ไม่เขียนฐาน ไม่สั่งงานใคร** คนกดเก็บเองทีละเที่ยว
//
// 🔑 ตัวตัดสินเดียวของทั้งหน้า — ไฟล์นี้ถูกฝังซอร์สลง delivery.html ตอนเสิร์ฟ
//    (แพทเทินเดียวกับ manager-checklist.js) ⇒ เทสในเครื่องกับที่รันบนจอ **เป็นโค้ดบรรทัดเดียวกัน**
//
// 📐 วิธีแบ่ง = "กวาดเป็นซี่พัด" (sweep) จากโกดัง ไม่ใช่สุ่มหรือไล่ใกล้สุด
//    ① วัดมุมของทุกจุดเทียบโกดัง → เรียงตามมุม ⇒ จุดที่มุมติดกัน = อยู่ทางเดียวกันจริง
//    ② ไล่ตามมุม ใส่เข้าเที่ยวจนเต็มพิกัด (กก. / คิว / จำนวนจุด) แล้วขึ้นเที่ยวใหม่
//    ③ ในเที่ยวค่อยเรียง "ใกล้สุดก่อน" (ตัวเดียวกับปุ่มจัดเส้นทาง)
//    🪤 ไล่ใกล้สุดทีเดียวทั้งกองไม่ได้ — มันจะได้เที่ยวที่พุ่งข้ามเมืองไปหยิบจุดที่หลงเหลือ
//
// 🪤 **ลองจิจูดต้องคูณ cos(lat) ก่อนวัดมุม** — ไม่คูณ มุมจะเพี้ยนตามละติจูด
//    (ที่ไทย 1 องศาลองจิจูด ≈ 0.97 ของละติจูด · ไม่คูณแล้วซี่พัดจะบิด)
// ============================================================

/* ── พิกัดรถของบ้านเรา — ตรงกับ src/lib/admin/vehicle-recommendation.ts ของ pacred ──
   🔑 ที่เดียวของระบบบอท: delivery.js กับหน้าจอ **อ่านตัวนี้** ไม่เขียนสูตรเอง */
const VEHICLES = [
  { type: "รถกระบะ", kg: 1800, cbm: 6 },
  { type: "6 ล้อเล็ก", kg: 3500, cbm: 12 },
  { type: "6 ล้อใหญ่", kg: 5000, cbm: 30 },
];
const OVER_VEHICLE = "มากกว่ารถที่กำหนด";

/** รถที่เล็กสุดที่รับของก้อนนี้ได้ — เกินทุกคัน = บอกตรงๆ ว่าเกิน */
function recommendVehicle(kg, cbm) {
  const w = Number(kg) || 0;
  const v = Number(cbm) || 0;
  for (const x of VEHICLES) if (w <= x.kg && v <= x.cbm) return x.type;
  return OVER_VEHICLE;
}

/* 🚚 พิกัดตั้งต้นตอนยังไม่เลือกรถ = คันใหญ่สุด ⇒ เสนอเที่ยวเต็มที่ไว้ก่อน แล้วคนค่อยเลือกรถ
   📍 12 จุด/เที่ยว = ค่าเริ่มต้นที่ **ปรับได้บนจอ** (ภูม 2026-11-23: *"มันบอกไม่ได้ว่าเที่ยวนึงมีกี่จุด"*)
      ⇒ ไม่ฝังเป็นกฎ · ตั้งไว้ให้พอดีงานกล่องแถวปริมณฑล แล้วเลื่อนเองตอนใช้จริง */
const BIG = VEHICLES[VEHICLES.length - 1];
const PLAN_DEFAULTS = { maxStops: 12, maxKg: BIG.kg, maxCbm: BIG.cbm };

const RAD = Math.PI / 180;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const n2 = (x) => Math.round(num(x) * 100) / 100;
const n3 = (x) => Math.round(num(x) * 1000) / 1000;

/** จุดนี้มีหมุดไหม — 🪤 0,0 ไม่ใช่หมุด แปลว่า "ยังไม่ปัก" (ฐาน pacred ตั้งต้นไว้แบบนั้น) */
function hasGeo(o) {
  const la = Number(o && o.lat);
  const ln = Number(o && o.lng);
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
}

/** ระยะทางบนผิวโลก (กม.) */
function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

/** มุมจากโกดังไปจุดนั้น (เรเดียน 0..2π · ทิศเหนือ = 0 แล้ววนตามเข็มนาฬิกา) */
function bearingFrom(origin, p) {
  const north = p.lat - origin.lat;
  const east = (p.lng - origin.lng) * Math.cos(((origin.lat + p.lat) / 2) * RAD);
  let a = Math.atan2(east, north);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

const COMPASS = [
  "เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้",
  "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ",
];
/** ทิศจากมุม — ใช้ตอนไม่รู้ชื่อพื้นที่ (เอาไว้บอกคนอ่านว่าเที่ยวนี้ไปทางไหน) */
function compassOf(rad) {
  return COMPASS[Math.round(num(rad) / (Math.PI / 4)) % 8];
}

const stopKg = (s) => (s.items || []).reduce((n, it) => n + num(it.weightKg), 0);
const stopCbm = (s) => (s.items || []).reduce((n, it) => n + num(it.cbm), 0);
const stopBoxes = (s) => (s.items || []).reduce((n, it) => n + (num(it.boxes) || 1), 0);

/** เรียงจุดในเที่ยว "ใกล้สุดก่อน" จากโกดัง — 🪤 จุดไม่มีหมุดวัดระยะไม่ได้ ⇒ ต่อท้ายตามลำดับที่กดเพิ่ม */
function orderByNearest(stops, origin) {
  const list = (stops || []).slice();
  if (!origin || !hasGeo(origin) || list.length < 2) return list;
  const rest = list.filter(hasGeo);
  const tail = list.filter((s) => !hasGeo(s));
  const out = [];
  let pt = { lat: origin.lat, lng: origin.lng };
  while (rest.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = haversineKm(pt, rest[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    pt = { lat: rest[bi].lat, lng: rest[bi].lng };
    out.push(rest.splice(bi, 1)[0]);
  }
  return out.concat(tail);
}

/** ระยะทางทั้งเที่ยว (โกดัง → ทุกจุด → กลับโกดัง) — นับเฉพาะจุดที่มีหมุด */
function routeKm(stops, origin) {
  if (!origin || !hasGeo(origin)) return 0;
  const pts = (stops || []).filter(hasGeo);
  if (!pts.length) return 0;
  let pt = { lat: origin.lat, lng: origin.lng };
  let km = 0;
  for (const s of pts) { km += haversineKm(pt, s); pt = { lat: s.lat, lng: s.lng }; }
  return km + haversineKm(pt, { lat: origin.lat, lng: origin.lng });
}

/** ค่าที่เจอบ่อยสุดในช่องนั้น + จำนวนค่าที่ต่างกันทั้งหมด */
function topValue(stops, key) {
  const n = {};
  let best = null;
  for (const s of stops) {
    const v = String((s && s[key]) || "").trim();
    if (!v) continue;
    n[v] = (n[v] || 0) + 1;
    if (!best || n[v] > n[best]) best = v;
  }
  return { top: best, kinds: Object.keys(n).length };
}

/** ชื่อโซนที่คนอ่านรู้เรื่องทันที — ชื่อจังหวัด/อำเภอมาก่อน ทิศเป็นตัวสำรอง
 *  🪤 เที่ยวคร่อม 3 อำเภอแล้วเขียนชื่ออำเภอเดียว = หลอกคนอ่าน ⇒ บอกจำนวนไปด้วย */
function zoneOf(stops, origin) {
  const p = topValue(stops, "province");
  const d = topValue(stops, "district");
  if (p.top) {
    if (p.kinds > 2) return p.top + " +" + (p.kinds - 1) + " จังหวัด";
    if (p.kinds === 2) {
      const other = topValue(stops.filter((s) => String(s.province || "").trim() !== p.top), "province");
      return p.top + " · " + (other.top || "");
    }
    if (d.kinds === 1 && d.top) return p.top + " · " + d.top;
    if (d.kinds > 1) return p.top + " (" + d.kinds + " อำเภอ)";
    return p.top;
  }
  if (d.top) return d.kinds > 1 ? d.top + " +" + (d.kinds - 1) : d.top;
  /* ไม่มีชื่อพื้นที่เลย (งานเก่าที่ยังไม่กรอก) = บอกทิศ + ระยะไกลสุด */
  const pinned = stops.filter(hasGeo);
  if (!origin || !pinned.length) return "ไม่ทราบพื้นที่";
  const far = Math.max.apply(null, pinned.map((s) => haversineKm(origin, s)));
  return "ทาง" + compassOf(bearingFrom(origin, pinned[0])) + " ~" + Math.round(far) + " กม.";
}

function capsOf(opts) {
  const o = opts || {};
  const pick = (v, dflt) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : dflt);
  return {
    maxStops: pick(o.maxStops, PLAN_DEFAULTS.maxStops),
    maxKg: pick(o.maxKg, PLAN_DEFAULTS.maxKg),
    maxCbm: pick(o.maxCbm, PLAN_DEFAULTS.maxCbm),
  };
}

/** ใส่จุดนี้เพิ่มในเที่ยวได้ไหม (เที่ยวว่างต้องรับได้เสมอ ไม่งั้นวนไม่จบ) */
function fits(acc, s, caps) {
  if (!acc.stops.length) return true;
  if (acc.stops.length >= caps.maxStops) return false;
  if (acc.kg + stopKg(s) > caps.maxKg + 1e-9) return false;
  if (acc.cbm + stopCbm(s) > caps.maxCbm + 1e-9) return false;
  return true;
}

/** สรุปเที่ยว 1 เที่ยว — เลขทุกตัวที่จอต้องโชว์ คิดที่นี่ที่เดียว */
function summarize(stops, origin, caps, seq) {
  const ordered = orderByNearest(stops, origin);
  const kg = n2(ordered.reduce((n, s) => n + stopKg(s), 0));
  const cbm = n3(ordered.reduce((n, s) => n + stopCbm(s), 0));
  return {
    seq: seq,
    stops: ordered,
    stopCount: ordered.length,
    boxes: ordered.reduce((n, s) => n + stopBoxes(s), 0),
    trackings: ordered.reduce((n, s) => n + (s.items || []).length, 0),
    kg: kg,
    cbm: cbm,
    km: n2(routeKm(ordered, origin)),
    zone: zoneOf(ordered, origin),
    vehicle: recommendVehicle(kg, cbm),
    noPin: ordered.filter((s) => !hasGeo(s)).length,
    /* 🪤 จุดเดียวที่หนักเกินพิกัดต้อง "ขึ้นเที่ยวแล้วติดธง" ไม่ใช่หายไปเงียบๆ */
    over: { kg: kg > caps.maxKg + 1e-9, cbm: cbm > caps.maxCbm + 1e-9 },
  };
}

/**
 * จัดรถอัตโนมัติ — คืน "ข้อเสนอ" ไม่เขียนอะไร ไม่สั่งงานใคร
 *
 * @param stops [{ pr, lat, lng, geo, address, customer, province, district, items:[{tracking,boxes,weightKg,cbm}] }]
 * @param opts  { origin:{lat,lng}, maxStops, maxKg, maxCbm }
 * @returns { trips:[สรุปเที่ยว], noPin:[จุดที่ยังไม่มีหมุด], caps }
 */
function planTrips(stops, opts) {
  const caps = capsOf(opts);
  const origin = (opts && opts.origin) || null;
  const all = (stops || []).filter((s) => s && (s.items || []).length);

  /* 🔑 จุดไม่มีหมุด **ไม่เข้าการจัดกลุ่ม** — จัดโซนให้ไม่ได้ (ไม่รู้ว่าอยู่ไหน)
     ⇒ กองไว้ต่างหากให้คนจัดมือ · ไม่ใช่ยัดลงเที่ยวแรกแล้วเงียบ */
  const pinned = all.filter(hasGeo);
  const noPin = all.filter((s) => !hasGeo(s));
  if (!origin || !hasGeo(origin) || !pinned.length) {
    return { trips: [], noPin: all, caps: caps };
  }

  const ring = pinned
    .map((s) => ({ s: s, a: bearingFrom(origin, s) }))
    .sort((x, y) => x.a - y.a);

  /* 🪤 **เริ่มกวาดที่ "ช่องว่างกว้างสุด" ไม่ใช่ที่ทิศเหนือ**
     มุมมันวนครบวง ⇒ ถ้าเริ่มที่เหนือเป๊ะ กองที่คร่อมทิศเหนือ (มุม ~0 กับ ~2π = ที่เดียวกัน)
     จะถูกผ่าเป็น 2 เที่ยว แล้วรถ 2 คันวิ่งไปซ้อนกันเองโดยไม่มีใครรู้ว่าทำไม */
  let cut = 0;
  let widest = -1;
  for (let i = 0; i < ring.length; i++) {
    const prev = ring[(i - 1 + ring.length) % ring.length].a;
    let gap = ring[i].a - prev;
    if (gap < 0) gap += 2 * Math.PI;
    if (gap > widest) { widest = gap; cut = i; }
  }
  const sorted = ring.slice(cut).concat(ring.slice(0, cut)).map((x) => x.s);

  const trips = [];
  let acc = { stops: [], kg: 0, cbm: 0 };
  const close = () => { if (acc.stops.length) trips.push(acc.stops); acc = { stops: [], kg: 0, cbm: 0 }; };
  for (const s of sorted) {
    if (!fits(acc, s, caps)) close();
    acc.stops.push(s);
    acc.kg += stopKg(s);
    acc.cbm += stopCbm(s);
  }
  close();

  return {
    trips: trips.map((g, i) => summarize(g, origin, caps, i + 1)),
    noPin: noPin,
    caps: caps,
  };
}

/** พิกัดของรถคันนั้น — กรอกเองมาก่อน ไม่ได้กรอกค่อยใช้พิกัดมาตรฐานของประเภทรถ */
function truckCaps(t) {
  const std = VEHICLES.filter((v) => v.type === String((t && t.vehicle_type) || "").trim())[0];
  const kg = num(t && t.cap_kg) > 0 ? num(t.cap_kg) : (std ? std.kg : 0);
  const cbm = num(t && t.cap_cbm) > 0 ? num(t.cap_cbm) : (std ? std.cbm : 0);
  return { kg: kg, cbm: cbm };
}

/**
 * จับรถให้แต่ละเที่ยว — **คันเล็กสุดที่รับไหว** · คันละ 1 เที่ยวต่อ 1 รอบแผน
 *
 * 🔑 ไล่จากเที่ยวที่หนักสุดก่อน ⇒ ของหนักได้คันใหญ่ก่อนที่เที่ยวเล็กจะมาหยิบไป
 *    (ไล่จากเที่ยวแรกเฉยๆ แล้วเที่ยวเล็กคว้า 6 ล้อใหญ่ไป ของหนักจะเหลือแต่กระบะ)
 * 🪤 รถไม่พอ = คืน truck:null แล้วบอกเหตุ **ไม่ใช่ยัดคันเดิมซ้ำ 2 เที่ยว**
 *    (ซ้ำแล้วคนขับคนเดียวได้ 2 ใบงานในวันเดียวโดยไม่มีใครรู้)
 */
function assignTrucks(trips, trucks) {
  const free = (trucks || [])
    .filter((t) => t && t.id && t.active !== false)
    .map((t) => ({ t: t, c: truckCaps(t) }))
    .sort((a, b) => a.c.kg - b.c.kg || a.c.cbm - b.c.cbm);
  const used = {};
  const order = (trips || []).map((x, i) => ({ x: x, i: i })).sort((a, b) => b.x.kg - a.x.kg);
  const got = {};
  for (const o of order) {
    const hit = free.filter((f) => !used[f.t.id] && f.c.kg >= o.x.kg && f.c.cbm >= o.x.cbm)[0];
    if (hit) { used[hit.t.id] = true; got[o.i] = hit.t; }
  }
  return (trips || []).map((x, i) => Object.assign({}, x, {
    truck: got[i] || null,
    truckNote: got[i] ? null : ((trucks || []).length ? "ไม่มีรถว่างที่รับไหว" : "ยังไม่ได้ลงทะเบียนรถ"),
  }));
}

module.exports = { VEHICLES, OVER_VEHICLE, PLAN_DEFAULTS, COMPASS, recommendVehicle, hasGeo, haversineKm, bearingFrom, compassOf, orderByNearest, routeKm, zoneOf, planTrips, truckCaps, assignTrucks };
