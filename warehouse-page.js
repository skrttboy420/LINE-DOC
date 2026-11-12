// ============================================================
// 🏭 โกดัง 3D — หน้าเว็บ + ท่อข้อมูล (ภูม 2026-11-12)
//
// ภูม: *"ทำทางเข้ามีปุ่มเข้าทางบอทไลน์ภูมิได้ หรือพิมพ์ลิงค์เข้าไปได้
//        เหมือนหน้าจัดการสิทธิ์ ของบอทไลน์ภูมิอะ"*
//
// เปิดที่:  https://<บอทบน Render>/warehouse?key=<คีย์>        ← จอ 3D
//          https://<บอทบน Render>/warehouse/scan?key=<คีย์>    ← ยิงบาร์โค้ดรับเข้าชั้น
//          https://<บอทบน Render>/warehouse/labels?key=<คีย์>  ← พิมพ์ป้ายโลเคชั่น
//          https://<บอทบน Render>/warehouse/assign?key=<คีย์>  ← คีย์เอง (มือถือ)
//
// 🔑 คีย์ 2 ใบ (ตั้งใบไหนก็เปิดได้):
//      WAREHOUSE_KEY = ของพนักงานโกดัง — เปิดได้แค่หน้าโกดัง
//      ADMIN_KEY     = ของภูม — เปิดได้ทุกหน้า (รวมหน้าจัดการสิทธิ์)
//    🔒 ทำไมแยก: ถ้าให้พนักงานโกดังถือ ADMIN_KEY เขาจะออกรหัสเชิญ/ตัดสิทธิ์คนอื่นได้ด้วย
//    ไม่ตั้งทั้ง 2 ใบ = ปิดหน้านี้ทั้งหน้า (fail-closed)
//
// 🔒 ไม่แตะระบบ Pacred — เขียนแค่ตารางของบอท · อ่านเว็บผ่าน /api/bot?q=warehouse
// ============================================================

const fs = require("node:fs");
const path = require("node:path");

const LAYOUT = require("./warehouse-layout");
const { pickStateOf } = require("./warehouse");

const keyOf = (name) => (process.env[name] || "").trim();

/** เทียบคีย์แบบไม่หลุดความยาว (ไม่ถึงขั้น timing-safe แต่ไม่บอกใบ้ความยาว) */
function sameKey(given, want) {
  return !!want && given.length === want.length && given === want;
}

/** "ok" | "no-key" (ยังไม่ตั้ง) | "bad-key" */
function checkKey(req) {
  const wh = keyOf("WAREHOUSE_KEY"), admin = keyOf("ADMIN_KEY");
  if (!wh && !admin) return "no-key";
  const given = String(req.query.key || req.get("x-warehouse-key") || "").trim();
  if (sameKey(given, wh) || sameKey(given, admin)) return "ok";
  return "bad-key";
}

const NO_KEY_MSG = "ยังไม่ได้ตั้ง WAREHOUSE_KEY (หรือ ADMIN_KEY) ที่ Render — หน้าโกดังถูกปิดไว้";

/** อ่านไฟล์หน้าเว็บ — อ่านสดทุกครั้งตอน dev · แคชไว้ตอนรันจริง */
const pageCache = {};
function readPage(file) {
  if (process.env.NODE_ENV !== "production") return fs.readFileSync(path.join(__dirname, file), "utf8");
  if (!pageCache[file]) pageCache[file] = fs.readFileSync(path.join(__dirname, file), "utf8");
  return pageCache[file];
}

/**
 * @param {object} app      express app
 * @param {object} warehouse ตัวที่ createWarehouse() คืนมา
 * @param {(req:object)=>string} whoOf คนที่กดคือใคร (ไว้ลงประวัติ)
 */
function mountWarehouse(app, warehouse, whoOf) {
  const express = require("express");
  const json = express.json({ limit: "64kb" });

  function guard(req, res) {
    const k = checkKey(req);
    if (k === "no-key")  { res.status(503).json({ error: NO_KEY_MSG }); return false; }
    if (k === "bad-key") { res.status(401).json({ error: "คีย์ไม่ถูกต้อง" }); return false; }
    return true;
  }

  /**
   * คนที่กดคือใคร — ไว้ลงประวัติ (ภูม: ต้องตามได้ว่าใครย้ายตอนไหน)
   * 🔑 หน้านี้เปิดด้วยลิงก์+คีย์ ไม่ได้ล็อกอินไลน์ ⇒ ไม่มีทางรู้ตัวตนจากคีย์
   *    ⇒ ให้พนักงานพิมพ์ชื่อตัวเองครั้งเดียว (หน้าเว็บจำไว้) แล้วส่งมากับทุกการบันทึก
   *    ไม่ใส่ชื่อ = ลงเป็น "warehouse" (ยังรู้ว่ามีการย้าย แค่ไม่รู้ว่าใคร)
   */
  const who = (req) => {
    try {
      const fromHook = whoOf && whoOf(req);
      if (fromHook) return String(fromHook).slice(0, 40);
    } catch { /* hook พลาด = ตกไปใช้ชื่อที่หน้าเว็บส่งมา */ }
    const said = String((req.body && req.body.by) || req.query.u || "").trim();
    return said ? said.slice(0, 40) : "warehouse";
  };

  /** ยังไม่ได้ลง SQL = บอกให้ไปรัน warehouse-schema.sql (ไม่ใช่พังเงียบ) */
  async function requireTables(res) {
    const ready = await warehouse.isReady();
    if (ready) return true;
    res.status(503).json({
      error: "ยังไม่ได้ลงตารางของโกดัง — เปิด Supabase ของบอท → SQL Editor → วางไฟล์ warehouse-schema.sql แล้ว Run",
    });
    return false;
  }

  /* ── หน้าเว็บ ──────────────────────────────────────────────── */

  const servePage = (file) => (req, res) => {
    const k = checkKey(req);
    if (k === "no-key")  return res.status(503).type("text/plain; charset=utf-8").send(NO_KEY_MSG);
    if (k === "bad-key") return res.status(401).type("text/plain; charset=utf-8")
      .send("คีย์ไม่ถูกต้อง — ใส่ ?key=<คีย์> ท้าย URL");
    res.type("html").send(readPage(file));
  };

  app.get("/warehouse", servePage("warehouse-3d.html"));
  app.get("/warehouse/assign", servePage("warehouse-assign.html"));
  app.get("/warehouse/scan", servePage("warehouse-scan.html"));
  app.get("/warehouse/labels", servePage("warehouse-labels.html"));

  /* ── ท่อข้อมูล ─────────────────────────────────────────────── */

  /** ภาพรวมทั้งโกดัง (ผัง + ของที่วาง + สถานะสด) */
  app.get("/warehouse/api/view", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      res.json(await warehouse.view());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /** สถานะของแทรคเดียว — หน้าคีย์ตำแหน่งใช้เตือนตอนพิมพ์ */
  app.get("/warehouse/api/job", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const t = String(req.query.tracking || "").trim();
      if (!t) return res.status(400).json({ error: "ไม่ได้ใส่เลขแทรค" });
      const live = await warehouse.jobsFromPacred();
      const job = (live.jobs || []).find((j) => String(j.tracking || "").trim() === t) || null;
      const st = pickStateOf(job, true);
      const found = await warehouse.find(t).catch(() => []);
      const placement = (found || []).find((p) => String(p.tracking || "").trim() === t) || null;
      res.json({
        tracking: t, job: job, state: st, liveOk: live.ok,
        placement: placement ? { slot: placement.slot, label: LAYOUT.slotLabel(placement.slot) } : null,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /** 🔎 ค้นหาในชั้นวาง */
  app.get("/warehouse/api/find", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      res.json({ rows: await warehouse.find(req.query.q) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /** 📥 คีย์ว่าของอยู่ช่องไหน (วางใหม่ / ย้าย) */
  app.post("/warehouse/api/place", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      const b = req.body || {};
      /* รหัสลูกค้าถ่ายจากเว็บ ไม่เชื่อค่าที่หน้าเว็บส่งมา (กันคีย์ผิดคน) */
      let memberCode = null;
      try {
        const live = await warehouse.jobsFromPacred();
        const job = (live.jobs || []).find((j) => String(j.tracking || "").trim() === String(b.tracking || "").trim());
        if (job) memberCode = job.memberCode || null;
      } catch { /* อ่านเว็บไม่ได้ก็คีย์ตำแหน่งได้ — แค่ไม่มีรหัสลูกค้าติดไป */ }

      res.json(await warehouse.place(b.tracking, b.slot, who(req), {
        boxes: b.boxes, note: b.note, memberCode: memberCode,
      }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /**
   * 📤 เอาของออกจากชั้น
   * body.kind = "load" (เอาขึ้นรถ · จ่ายออกให้ลูกค้า) หรือเว้นว่าง (เอาออกเฉยๆ)
   */
  app.post("/warehouse/api/remove", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      const b = req.body || {};
      res.json(await warehouse.remove(b.tracking, who(req), b.note, b.kind));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /**
   * 📷 ยิงรับเข้าชั้น — ลงตำแหน่ง + ตอบกลับทุกอย่างที่คนยิงต้องเห็นในครั้งเดียว
   *
   * ภูม 2026-11-12: *"พอพนักงานจะยิงรับเข้า ต้องพิมพ์ล็อกที่จะเอาเข้าหรือยิงบาโค้ดล็อกนั้นๆ
   * ก่อนนะ ถึงค่อยยิงรับเข้าตามปกติ"* — หน้าเว็บคุมลำดับ (ต้องมีช่องก่อน) · ที่นี่เขียนจริง
   *
   * 🔑 ตอบ tone กลับไปให้หน้าเว็บเลือกสี+เสียง: ok (เขียว) · warn (ส้ม) · bad (แดง)
   *    กล่องที่ "ห้ามหยิบ/ต้องเช็ค" ต้องดังไม่เหมือนกล่องปกติ ⇒ คนยิงรู้ตั้งแต่ตอนวางของ
   */
  app.post("/warehouse/api/scan", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      const b = req.body || {};
      const tracking = String(b.tracking || "").trim();
      if (!tracking) return res.status(400).json({ error: "ไม่ได้ส่งเลขแทรคมา" });
      const parsed = LAYOUT.parseSlot(b.slot);
      if (!parsed) return res.status(400).json({ error: 'ช่อง "' + b.slot + '" ไม่มีในผังโกดัง' });

      /* หางานจากเว็บก่อน — เอารหัสลูกค้าติดไปด้วย + เอาไว้บอกสถานะคนยิง */
      let job = null, liveOk = true;
      try {
        const live = await warehouse.jobsFromPacred([tracking]);
        liveOk = live.ok;
        job = (live.jobs || []).find((j) => String(j.tracking || "").trim() === tracking) || null;
      } catch { liveOk = false; }

      const saved = await warehouse.place(tracking, parsed.slot, who(req), {
        boxes: b.boxes, note: b.note, memberCode: job ? job.memberCode : null,
      });

      const st = pickStateOf(job, true);
      /* ⬛ หาในระบบไม่เจอ = ส้ม (ไม่ใช่แดง) — ของวางได้ แค่ต้องไปเช็คว่าเลขถูกไหม */
      const tone = !job ? "warn"
        : st.pick === "ready" ? "ok"
        : st.pick === "wait" ? "warn"
        : "bad";
      const headline = !liveOk ? "บันทึกตำแหน่งแล้ว (เช็คสถานะกับเว็บไม่ได้)"
        : !job ? "บันทึกตำแหน่งแล้ว — แต่หาแทรคนี้ในระบบไม่เจอ"
        : saved.moved ? "ย้ายช่องแล้ว" : "รับเข้าชั้นแล้ว";

      res.json({
        ok: true, tracking: tracking, slot: parsed.slot, label: LAYOUT.slotLabel(parsed.slot),
        movedFrom: saved.moved ? saved.from : null, unchanged: !!saved.unchanged,
        job: job, pickLabel: st.label, why: st.why, tone: tone, headline: headline, liveOk: liveOk,
      });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /** ประวัติการย้ายของแทรคนี้ */
  app.get("/warehouse/api/history", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      res.json({ rows: await warehouse.history(req.query.tracking, req.query.limit) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /** ผังเปล่า (ไม่ต้องมีฐาน) — ไว้เช็คว่าหน้าเปิดได้ก่อนลง SQL */
  app.get("/warehouse/api/layout", (req, res) => {
    if (!guard(req, res)) return;
    res.json(LAYOUT.buildLayout());
  });

  console.log(
    keyOf("WAREHOUSE_KEY") || keyOf("ADMIN_KEY")
      ? "🏭 หน้าโกดัง 3D เปิดอยู่ที่ /warehouse?key=… (คีย์ตำแหน่ง /warehouse/assign)"
      : "⚠️ ยังไม่ได้ตั้ง WAREHOUSE_KEY/ADMIN_KEY — หน้าโกดัง 3D ปิดอยู่",
  );
}

/** ลิงก์หน้าโกดัง (พากุญแจไปด้วย) — "" = เปิดไม่ได้ · ใช้ทำปุ่มในบอท */
function warehouseLink(sub) {
  const base = String(process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/[/]+$/, "");
  const key = keyOf("WAREHOUSE_KEY") || keyOf("ADMIN_KEY");
  if (!base || !key) return "";
  const path = sub && ["assign", "scan", "labels"].includes(sub) ? "/" + sub : "";
  return base + "/warehouse" + path + "?key=" + encodeURIComponent(key);
}

module.exports = { mountWarehouse, warehouseLink, checkKey };
