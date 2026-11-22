// ============================================================
// 🚚 Delivery Planner — หน้าเว็บ + ท่อข้อมูล (ภูม 2026-11-22)
//
// เปิดที่: https://<บอทบน Render>/delivery?key=<คีย์>   (ใช้ ADMIN_KEY หรือ MANAGER_KEY ของภูม)
// 🔒 แค่วางแผน — ปุ่มในบอทโชว์เฉพาะเจ้าของ/ทีมระบบ · มอบงาน/ปิดงานจริงทำใน pacred เท่านั้น
// 🔒 ไม่เขียนกลับ pacred — เก็บแผนในฐานบอท (dp_*) · อ่านงานพร้อมส่งผ่านท่อเดิมของโกดัง
// ============================================================

const fs = require("node:fs");
const path = require("node:path");

const keyOf = (name) => (process.env[name] || "").trim();
function sameKey(given, want) { return !!want && given.length === want.length && given === want; }

/** "ok" | "no-key" | "bad-key" — รับ MANAGER_KEY หรือ ADMIN_KEY (คีย์ของภูม) */
function checkKey(req) {
  const mgr = keyOf("MANAGER_KEY"), admin = keyOf("ADMIN_KEY");
  if (!mgr && !admin) return "no-key";
  const given = String(req.query.key || req.get("x-delivery-key") || "").trim();
  if (sameKey(given, mgr) || sameKey(given, admin)) return "ok";
  return "bad-key";
}
const NO_KEY_MSG = "ยังไม่ได้ตั้ง ADMIN_KEY (หรือ MANAGER_KEY) ที่ Render — หน้าวางแผนจัดส่งถูกปิดไว้";

const fileCache = {};
function readFileCached(file) {
  if (process.env.NODE_ENV !== "production") return fs.readFileSync(path.join(__dirname, file), "utf8");
  if (!fileCache[file]) fileCache[file] = fs.readFileSync(path.join(__dirname, file), "utf8");
  return fileCache[file];
}

function mountDelivery(app, delivery) {
  const express = require("express");
  const json = express.json({ limit: "2mb" });

  /* หน้าเว็บ */
  app.get("/delivery", (req, res) => {
    const k = checkKey(req);
    if (k === "no-key") return res.status(503).type("text/plain; charset=utf-8").send(NO_KEY_MSG);
    if (k === "bad-key") return res.status(401).type("text/plain; charset=utf-8").send("คีย์ไม่ถูกต้อง — ใส่ ?key=<คีย์> ท้าย URL");
    res.type("html").send(readFileCached("delivery.html"));
  });

  /* หมุดลูกค้า (ไฟล์ static · จับคู่กับงานด้วยรหัส PR) */
  app.get("/delivery/api/pins", (req, res) => {
    const k = checkKey(req);
    if (k !== "ok") return res.status(k === "no-key" ? 503 : 401).json({ error: k === "no-key" ? NO_KEY_MSG : "คีย์ไม่ถูกต้อง" });
    try { res.type("application/json").send(readFileCached("delivery-pins.json")); }
    catch (e) { res.json({ count: 0, pins: [], error: "ยังไม่มีไฟล์หมุด (delivery-pins.json)" }); }
  });

  function guard(req, res) {
    const k = checkKey(req);
    if (k === "no-key") { res.status(503).json({ error: NO_KEY_MSG }); return false; }
    if (k === "bad-key") { res.status(401).json({ error: "คีย์ไม่ถูกต้อง" }); return false; }
    return true;
  }
  const api = (method, route, run) =>
    app[method](route, method === "post" ? json : (req, res, next) => next(), async (req, res) => {
      if (!guard(req, res)) return;
      try { res.json(await run(req)); }
      catch (e) {
        const msg = (e && e.message) || "มีบางอย่างผิดพลาด";
        res.status(/ยังไม่ได้ลงตาราง/.test(msg) ? 503 : 400).json({ error: msg });
      }
    });

  /* โหลดทีเดียวตอนเปิด (จุดโกดัง + รถ + เที่ยว) */
  api("get", "/delivery/api/bootstrap", async () => {
    const [origin, trucks, trips, placed] = await Promise.all([
      delivery.getOrigin(), delivery.listTrucks(), delivery.listTrips(), delivery.placedTrackings(),
    ]);
    return { origin, trucks, trips, placed };
  });

  /* จุดโกดัง */
  api("get", "/delivery/api/origin", async () => ({ origin: await delivery.getOrigin() }));
  api("post", "/delivery/api/origin", async (req) =>
    ({ origin: await delivery.setOrigin(req.body.lat, req.body.lng, req.body.label) }));

  /* รถ */
  api("get", "/delivery/api/trucks", async () => ({ trucks: await delivery.listTrucks() }));
  api("post", "/delivery/api/truck/add", async (req) => delivery.addTruck(req.body));
  api("post", "/delivery/api/truck/update", async (req) => delivery.updateTruck(req.body.id, req.body));
  api("post", "/delivery/api/truck/delete", async (req) => delivery.deleteTruck(req.body.id));

  /* เที่ยวส่ง + จุดส่ง */
  api("get", "/delivery/api/trips", async () => ({ trips: await delivery.listTrips() }));
  api("get", "/delivery/api/trip", async (req) => ({ trip: await delivery.getTrip(req.query.id) }));
  api("post", "/delivery/api/trip/create", async (req) => delivery.createTrip(req.body));
  api("post", "/delivery/api/trip/update", async (req) => delivery.updateTrip(req.body.id, req.body));
  api("post", "/delivery/api/trip/delete", async (req) => delivery.deleteTrip(req.body.id));
  api("post", "/delivery/api/trip/stops", async (req) => ({ trip: await delivery.setStops(req.body.id, req.body.stops) }));

  /* งานพร้อมส่ง (จากท่อ pacred เดิม — แค่อ่าน) */
  api("get", "/delivery/api/jobs", async () => delivery.readyJobs());

  /* ── หน้าคนขับ + ติดตามรถ (เฟส 4) ─────────────────────────────── */
  /* แอดมิน (ต้องมีคีย์): ตำแหน่งรถล่าสุด + ขอลิงก์ให้คนขับของเที่ยว */
  api("get", "/delivery/api/positions", async () => ({ positions: await delivery.listTripPositions() }));
  api("post", "/delivery/api/trip/driver-link", async (req) => {
    const token = await delivery.driverTripToken(req.body.id);
    const base = String(process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/[/]+$/, "");
    return { token, url: base ? base + "/delivery/driver?trip=" + encodeURIComponent(String(req.body.id || "")) + "&t=" + token : "" };
  });

  /* คนขับ: หน้า + ท่อข้อมูล — ไม่ใช้คีย์แอดมิน · ยืนยันด้วยโทเคนของเที่ยว (ดูอย่างเดียว) */
  app.get("/delivery/driver", (req, res) => { res.type("html").send(readFileCached("driver.html")); });
  app.get("/delivery/api/driver/trip", async (req, res) => {
    try { res.json({ trip: await delivery.getTripForDriver(req.query.trip, req.query.t) }); }
    catch (e) { res.status(400).json({ error: (e && e.message) || "เปิดเที่ยวไม่ได้" }); }
  });
  app.post("/delivery/api/driver/ping", json, async (req, res) => {
    try { res.json(await delivery.driverPing(req.body.trip, req.body.t, req.body.lat, req.body.lng)); }
    catch (e) { res.status(400).json({ error: (e && e.message) || "ส่งตำแหน่งไม่ได้" }); }
  });

  console.log(
    keyOf("ADMIN_KEY") || keyOf("MANAGER_KEY")
      ? "🚚 หน้าวางแผนจัดส่งเปิดอยู่ที่ /delivery?key=…"
      : "⚠️ ยังไม่ได้ตั้ง ADMIN_KEY/MANAGER_KEY — หน้าวางแผนจัดส่งปิดอยู่",
  );
}

/** ลิงก์หน้าวางแผนจัดส่ง (พากุญแจไปด้วย) — "" = เปิดไม่ได้ · ใช้ทำปุ่มในบอท */
function deliveryLink() {
  const base = String(process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/[/]+$/, "");
  const key = keyOf("ADMIN_KEY") || keyOf("MANAGER_KEY");
  if (!base || !key) return "";
  return base + "/delivery?key=" + encodeURIComponent(key);
}

module.exports = { mountDelivery, deliveryLink, checkKey };
