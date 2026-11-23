// ============================================================
// 🚚 Delivery Planner — ตัวอ่าน/เขียนฐานของบอท + ดึงงานพร้อมส่ง (ภูม 2026-11-22)
//
// 🔒 แค่วางแผน — ไม่เขียนกลับ pacred · มอบงาน/ปิดงานจริงทำใน pacred เท่านั้น
// 🔗 งาน "พร้อมส่ง" ดึงจากท่อเดิมของโกดัง (warehouse.jobsFromPacred) แล้วกรอง PICK.READY
//    พิกัดลูกค้า = หมุดจาก pacred (กลางตำบล/อำเภอ หรือหมุดที่คนขับปักเป๊ะ) + หมุดที่เซฟไว้เอง
// 🧮 สูตรแนะนำรถ + ตัวจัดรถอัตโนมัติอยู่ trip-plan.js ที่เดียว (จอฝังซอร์สตัวเดียวกัน)
// ============================================================

const crypto = require("node:crypto");
const { pickStateOf, PICK } = require("./warehouse");
const { recommendVehicle, planTrips, PLAN_DEFAULTS } = require("./trip-plan");

/**
 * @param {object} supabase  Supabase ของบอท (service_role)
 * @param {object} warehouse ตัวที่ createWarehouse() คืนมา (ไว้ดึงงานจาก pacred ผ่านท่อเดิม)
 */
function createDelivery(supabase, warehouse) {
  async function isReady() {
    const { error } = await supabase.from("dp_setting").select("key").limit(1);
    if (!error) return true;
    if (isMissingSchema(error)) return false;
    throw new Error(error.message);
  }
  function isMissingSchema(error) {
    const code = String((error && error.code) || "");
    return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205" ||
      /does not exist|could not find|relation .* does not exist/i.test((error && error.message) || "");
  }
  const SCHEMA_MSG =
    "ยังไม่ได้ลงตารางของ Delivery Planner — เปิด Supabase ของบอท → SQL Editor → วางไฟล์ delivery-schema.sql แล้ว Run";
  function boom(error) { throw new Error(isMissingSchema(error) ? SCHEMA_MSG : error.message); }

  const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
  const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const inThai = (lat, lng) => lat > 5 && lat < 21 && lng > 96 && lng < 106;

  /* 🏭 จุดโกดัง PACRED ค่าตั้งต้น — ติดโกดัง PCS (ภูมส่งลิงก์แมพมา 2026-11-22)
     ยังไม่ตั้งเอง = ใช้จุดนี้ · ปักใหม่ในแอปได้ (เก็บทับใน dp_setting) */
  const DEFAULT_ORIGIN = { lat: 13.7109246, lng: 100.3241082, label: "โกดัง PACRED" };


  /* ── ตั้งค่า / จุดโกดัง ──────────────────────────────────────────── */
  async function getSetting(key) {
    const { data, error } = await supabase
      .from("dp_setting").select("value").eq("key", clip(key, 60)).maybeSingle();
    if (error) boom(error);
    return (data && data.value) || null;
  }
  async function setSetting(key, value) {
    const { error } = await supabase
      .from("dp_setting").upsert({ key: clip(key, 60), value: value || {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) boom(error);
    return { ok: true };
  }
  async function getOrigin() { return (await getSetting("warehouse_origin")) || DEFAULT_ORIGIN; }
  async function setOrigin(lat, lng, label) {
    const la = Number(lat), ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || !inThai(la, ln))
      throw new Error("พิกัดโกดังไม่ถูกต้อง (ต้องอยู่ในไทย)");
    await setSetting("warehouse_origin", { lat: +la.toFixed(7), lng: +ln.toFixed(7), label: clip(label, 60) || "โกดัง PACRED" });
    return getOrigin();
  }

  /* ── รถ ─────────────────────────────────────────────────────────── */
  const TRUCK_TYPES = ["รถกระบะ", "6 ล้อเล็ก", "6 ล้อใหญ่", "อื่นๆ"];
  function cleanTruck(p) {
    const o = {};
    if (p.name !== undefined) o.name = clip(p.name, 60);
    if (p.vehicle_type !== undefined) o.vehicle_type = TRUCK_TYPES.includes(p.vehicle_type) ? p.vehicle_type : "รถกระบะ";
    if (p.cap_kg !== undefined) o.cap_kg = numOrNull(p.cap_kg);
    if (p.cap_cbm !== undefined) o.cap_cbm = numOrNull(p.cap_cbm);
    if (p.driver_name !== undefined) o.driver_name = clip(p.driver_name, 80);
    if (p.driver_code !== undefined) o.driver_code = clip(p.driver_code, 20);
    if (p.plate !== undefined) o.plate = clip(p.plate, 20);
    if (p.active !== undefined) o.active = !!p.active;
    return o;
  }
  async function listTrucks() {
    const { data, error } = await supabase.from("dp_truck").select("*").order("created_at").limit(100);
    if (error) boom(error);
    return data || [];
  }
  async function addTruck(patch) {
    const o = cleanTruck(patch || {});
    if (!o.name) throw new Error("ยังไม่ได้ใส่ชื่อรถ");
    const { data, error } = await supabase.from("dp_truck").insert(o).select().single();
    if (error) boom(error);
    return data;
  }
  async function updateTruck(id, patch) {
    const o = cleanTruck(patch || {});
    if (!Object.keys(o).length) return { ok: true };
    const { data, error } = await supabase.from("dp_truck").update(o).eq("id", clip(id, 40)).select().single();
    if (error) boom(error);
    return data;
  }
  async function deleteTruck(id) {
    const { error } = await supabase.from("dp_truck").delete().eq("id", clip(id, 40));
    if (error) boom(error);
    return { ok: true };
  }

  /* ── เที่ยวส่ง + จุดส่ง ─────────────────────────────────────────── */
  async function listTrips() {
    const { data, error } = await supabase
      .from("dp_trip").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) boom(error);
    return data || [];
  }
  async function getTrip(id) {
    const tid = clip(id, 40);
    const [{ data: trip, error: e1 }, { data: stops, error: e2 }] = await Promise.all([
      supabase.from("dp_trip").select("*").eq("id", tid).maybeSingle(),
      supabase.from("dp_stop").select("*").eq("trip_id", tid).order("seq").limit(500),
    ]);
    if (e1) boom(e1);
    if (e2) boom(e2);
    return trip ? Object.assign({}, trip, { stops: stops || [] }) : null;
  }
  async function createTrip(patch) {
    const p = patch || {};
    const row = {
      name: clip(p.name, 60) || "เที่ยวใหม่",
      plan_date: p.plan_date && /^\d{4}-\d{2}-\d{2}$/.test(p.plan_date) ? p.plan_date : null,
      truck_id: p.truck_id ? clip(p.truck_id, 40) : null,
      note: p.note != null ? clip(p.note, 300) : null,
    };
    const { data, error } = await supabase.from("dp_trip").insert(row).select().single();
    if (error) boom(error);
    return Object.assign({}, data, { stops: [] });
  }
  async function updateTrip(id, patch) {
    const p = patch || {}, o = { updated_at: new Date().toISOString() };
    if (p.name !== undefined) o.name = clip(p.name, 60);
    if (p.plan_date !== undefined) o.plan_date = p.plan_date && /^\d{4}-\d{2}-\d{2}$/.test(p.plan_date) ? p.plan_date : null;
    if (p.truck_id !== undefined) o.truck_id = p.truck_id ? clip(p.truck_id, 40) : null;
    if (p.note !== undefined) o.note = p.note != null ? clip(p.note, 300) : null;
    if (p.status !== undefined) o.status = p.status === "planned" ? "planned" : "draft";
    const { data, error } = await supabase.from("dp_trip").update(o).eq("id", clip(id, 40)).select().single();
    if (error) boom(error);
    return data;
  }
  async function deleteTrip(id) {
    const { error } = await supabase.from("dp_trip").delete().eq("id", clip(id, 40)); // stops cascade
    if (error) boom(error);
    return { ok: true };
  }

  function cleanStop(s, tripId, seq) {
    return {
      trip_id: tripId,
      seq: Number.isFinite(Number(s.seq)) ? Number(s.seq) : (seq || 0),
      pr: clip(s.pr, 20) || null,
      tracking: clip(s.tracking, 40) || null,
      customer: clip(s.customer, 120) || null,
      address: clip(s.address, 300) || null,
      lat: numOrNull(s.lat),
      lng: numOrNull(s.lng),
      boxes: Number.isFinite(Number(s.boxes)) ? Number(s.boxes) : null,
      weight_kg: numOrNull(s.weight_kg),
      cbm: numOrNull(s.cbm),
      note: clip(s.note, 300) || null,
    };
  }
  /** แทนที่จุดส่งทั้งเที่ยว (ส่งลำดับ+รายการมาทั้งชุด) — ง่ายและกันลำดับเพี้ยน */
  async function setStops(tripId, stops) {
    const tid = clip(tripId, 40);
    const rows = (Array.isArray(stops) ? stops : []).map((s, i) => cleanStop(s || {}, tid, i));
    const del = await supabase.from("dp_stop").delete().eq("trip_id", tid);
    if (del.error) boom(del.error);
    if (rows.length) {
      const { error } = await supabase.from("dp_stop").insert(rows);
      if (error) boom(error);
    }
    await supabase.from("dp_trip").update({ updated_at: new Date().toISOString() }).eq("id", tid);
    return getTrip(tid);
  }

  /* ── งานพร้อมส่ง (ดึงท่อเดิมของโกดัง แล้วกรอง "พร้อมส่ง") ──────────── */
  async function readyJobs() {
    if (!warehouse || !warehouse.jobsFromPacred) return { ok: false, jobs: [], error: "ไม่ได้ต่อท่อโกดัง" };
    const live = await warehouse.jobsFromPacred([], []); // ของบนชั้นที่ถึงไทยทั้งหมด (แค่ธง ไม่เอารายละเอียดส่วนตัว)
    const out = [];
    for (const j of live.jobs || []) {
      const st = pickStateOf(j, true);
      if (st.pick !== PICK.READY) continue;       // 🟢 พร้อมส่ง = จ่ายแล้ว + ถึงไทย
      if (j.selfPickup) continue;                  // รับเองหน้าโกดัง ไม่ต้องจัดรถส่ง
      out.push({
        pr: String(j.memberCode || "").trim(),
        tracking: String(j.tracking || "").trim(),
        boxes: Number(j.boxes) || 1,
        weightKg: Number(j.weightKg) || 0,   // น้ำหนัก/ปริมาตรจริงจาก pacred (ท่อ bot ส่งมาแล้ว)
        cbm: Number(j.cbm) || 0,              // ⇒ planner บวกเอง + แนะนำรถ (ไม่ต้องกรอก)
        customer: j.customer || null,
        /* 📍 หมุดจาก pacred (ภูม 2026-11-23) — ไม่ต้องมานั่งปักเองทีละราย
           geo บอกความแม่น: driver (คนขับปักเป๊ะ) · tambon · amphoe · changwat
           ไม่มี = null ⇒ จอจะบอกว่า "ยังไม่มีหมุด" ไม่ใช่ปักมั่ว */
        lat: Number.isFinite(Number(j.lat)) ? Number(j.lat) : null,
        lng: Number.isFinite(Number(j.lng)) ? Number(j.lng) : null,
        geo: j.geo || null,
        address: j.address || null,     /* เติมของจริงอีกทีในรอบที่ 2 ข้างล่าง */
        province: j.province || null,   /* 🏷 ไว้ตั้งชื่อโซนของเที่ยว ("นนทบุรี · บางกรวย") */
        district: j.district || null,   /*    อยู่ในช่อง address อยู่แล้ว — แยกมาให้อ่านง่าย ไม่ใช่ข้อมูลใหม่ */
      });
    }
    /* 📍 ขอ "ที่อยู่จริง + หมุดที่คนขับปัก" ของเฉพาะงานที่จะจัดรถรอบนี้ (ภูม 2026-11-23)
     *
     * ภูม: *"ถ้าไม่เอาที่อยู่จริงๆลูกค้าอะ มันก็ปักผิดจุด ผิดที่ได้เลยนะแบบนี้อะ"* — ถูกต้อง
     * หมุดกลางตำบลใช้ "จัดโซน" ได้ แต่ไม่ใช่หน้าบ้าน ⇒ คนวางแผนต้องเห็นที่อยู่จริงคู่กัน
     * ถึงจะรู้ว่าหมุดนั้นตรงหรือเพี้ยน
     *
     * 🔒 ใช้ช่องทางเดิมของท่อ (d= = ขอรายละเอียดของกล่องที่ระบุ) ไม่ได้เปิดทางใหม่
     *    ขอเฉพาะงาน "พร้อมส่ง" รอบนี้ ไม่ใช่ทั้งโกดัง · เก็บแค่ ที่อยู่ + พิกัด
     *    **ไม่เก็บเบอร์โทร/ชื่อผู้รับ** ต่อเข้าหน้าวางแผน (ไม่ได้ใช้ ยิ่งถือน้อยยิ่งดี)
     */
    const want = out.map((j) => j.tracking).filter(Boolean);
    if (want.length) {
      const det = await warehouse.jobsFromPacred([], want);
      const byTk = new Map();
      for (const d of det.jobs || []) byTk.set(String(d.tracking || "").trim(), d);
      for (const j of out) {
        const d = byTk.get(j.tracking);
        if (!d) continue;
        j.address = d.address || null;
        j.province = d.province || null;
        j.district = d.district || null;
        /* หมุดเป๊ะมาเฉพาะรอบนี้ ⇒ ทับของคร่าวๆ ที่ได้มารอบแรก */
        if (Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng))) {
          j.lat = Number(d.lat);
          j.lng = Number(d.lng);
          j.geo = d.geo || j.geo;
        }
      }
    }

    return { ok: live.ok !== false, jobs: out, at: live.at || null };
  }

  /** แทรค+เที่ยว ของจุดส่งทุกเที่ยว — ไว้ติดธง "งานนี้อยู่ในเที่ยวอื่นแล้ว" (กันใส่ซ้ำ 2 คัน) */
  async function placedTrackings() {
    const { data, error } = await supabase.from("dp_stop").select("tracking,trip_id").limit(3000);
    if (error) { if (isMissingSchema(error)) return []; boom(error); }
    return (data || []).filter((r) => r.tracking).map((r) => ({ tracking: r.tracking, trip_id: r.trip_id }));
  }

  /* ── หน้าคนขับ + ติดตามรถ (เฟส 4) ─────────────────────────────── */
  function tok() { return crypto.randomUUID().replace(/-/g, "").slice(0, 18); }

  /** โทเคนของเที่ยว (สร้างถ้ายังไม่มี) — ไว้ทำลิงก์ให้คนขับเปิดมือถือ (ไม่ใช้คีย์แอดมิน) */
  async function driverTripToken(id) {
    const t = await getTrip(id);
    if (!t) throw new Error("ไม่พบเที่ยว");
    if (t.share_token) return t.share_token;
    const token = tok();
    const { error } = await supabase.from("dp_trip").update({ share_token: token }).eq("id", clip(id, 40));
    if (error) boom(error);
    return token;
  }

  /** เที่ยวสำหรับคนขับ (ดูอย่างเดียว · ยืนยันด้วยโทเคน) */
  async function getTripForDriver(id, token) {
    const tid = clip(id, 40), tk = clip(token, 40);
    if (!tk) throw new Error("ลิงก์ไม่ถูกต้อง");
    const { data: trip, error } = await supabase
      .from("dp_trip").select("id,name,truck_id,share_token").eq("id", tid).maybeSingle();
    if (error) boom(error);
    if (!trip || !trip.share_token || trip.share_token !== tk) throw new Error("ลิงก์หมดอายุหรือไม่ถูกต้อง");
    const [stopsR, truckR, originV] = await Promise.all([
      supabase.from("dp_stop").select("seq,pr,tracking,customer,address,lat,lng,boxes").eq("trip_id", tid).order("seq").limit(500),
      trip.truck_id ? supabase.from("dp_truck").select("name,vehicle_type,driver_name,plate").eq("id", trip.truck_id).maybeSingle() : Promise.resolve({ data: null }),
      getOrigin(),
    ]);
    if (stopsR.error) boom(stopsR.error);
    return { id: trip.id, name: trip.name, stops: stopsR.data || [], truck: truckR.data || null, origin: originV };
  }

  /** คนขับส่งพิกัด GPS จากมือถือ (ยังไม่มี car-track ⇒ ใช้มือถือไปก่อน) */
  async function driverPing(id, token, lat, lng) {
    const la = Number(lat), ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || !inThai(la, ln)) throw new Error("พิกัดไม่ถูกต้อง");
    const { data: trip, error } = await supabase
      .from("dp_trip").select("id,share_token").eq("id", clip(id, 40)).maybeSingle();
    if (error) boom(error);
    if (!trip || !trip.share_token || trip.share_token !== clip(token, 40)) throw new Error("ลิงก์ไม่ถูกต้อง");
    const up = await supabase.from("dp_trip")
      .update({ last_lat: +la.toFixed(7), last_lng: +ln.toFixed(7), last_ping_at: new Date().toISOString() })
      .eq("id", trip.id);
    if (up.error) boom(up.error);
    return { ok: true };
  }

  /** เที่ยวที่มีตำแหน่งรถล่าสุด — ไว้โชว์บนแผนที่แอดมิน */
  async function listTripPositions() {
    const { data, error } = await supabase
      .from("dp_trip").select("id,name,truck_id,last_lat,last_lng,last_ping_at").not("last_lat", "is", null).limit(100);
    if (error) { if (isMissingSchema(error)) return []; boom(error); }
    const trucks = await listTrucks().catch(() => []);
    const byId = {}; trucks.forEach((t) => { byId[t.id] = t; });
    return (data || []).map((r) => ({
      id: r.id, name: r.name, lat: +r.last_lat, lng: +r.last_lng, at: r.last_ping_at,
      truck: byId[r.truck_id] ? byId[r.truck_id].name : null,
      driver: byId[r.truck_id] ? byId[r.truck_id].driver_name : null,
    }));
  }

  return {
    isReady, recommendVehicle, planTrips, PLAN_DEFAULTS, TRUCK_TYPES,
    getSetting, setSetting, getOrigin, setOrigin,
    listTrucks, addTruck, updateTruck, deleteTruck,
    listTrips, getTrip, createTrip, updateTrip, deleteTrip, setStops,
    readyJobs, placedTrackings,
    driverTripToken, getTripForDriver, driverPing, listTripPositions,
  };
}

module.exports = { createDelivery };
