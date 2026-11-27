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
function mountWarehouse(app, warehouse, whoOf, count) {
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
  /* 🔗 หน้า "ยิงเก็บเข้าชั้น" ของ Pacred — ที่เดียวที่แก้ตำแหน่งของได้ (ภูม 2026-11-17)
     ใช้ 3 ที่: พาหน้ายิง/หน้าคีย์ไปที่นั่น · ตอบท่อที่ปิดแล้ว · ส่งให้จอ 3D ทำปุ่ม */
  const pacredBase = String(process.env.PACRED_API_URL || "").replace(/[/]+$/, "");
  const PUTAWAY_URL = pacredBase ? pacredBase + "/admin/barcode/putaway" : null;
  /* 🟡 คิว "ยังไม่เก็บเข้าชั้น" ของ Pacred — ชิปบนจอ 3D กดแล้วไปดูว่ามีใบอะไรรออยู่
     (ตัวเลขบนชิปมาจากธง awaitingShelf ชุดเดียวกับหน้านั้น ⇒ กดแล้วต้องเจอจำนวนเท่ากัน) */
  const PENDING_SHELF_URL = pacredBase ? pacredBase + "/admin/warehouse/pending-shelf" : null;

  /* 🚪 ภูม 2026-11-17 (*"ยิงที่ Pacred อย่างเดียว"*) — หน้ายิง/หน้าคีย์ของบอทพาไปที่ Pacred
     ตำแหน่งของอยู่ที่นั่นที่เดียวแล้ว · ยิงที่นี่ = ลงเล่มที่ไม่มีใครอ่าน
     🔑 ยังไม่ได้ตั้ง PACRED_API_URL = เปิดหน้าเดิมไว้ก่อน (ดีกว่าพาไปลิงก์เสีย) */
  for (const p of ["/warehouse/assign", "/warehouse/scan"]) {
    app.get(p, (req, res, next) =>
      PUTAWAY_URL ? res.redirect(302, PUTAWAY_URL) : next());
  }
  app.get("/warehouse/assign", servePage("warehouse-assign.html"));
  app.get("/warehouse/scan", servePage("warehouse-scan.html"));
  app.get("/warehouse/labels", servePage("warehouse-labels.html"));
  /* 📋 ตรวจนับสต็อก — ภูม 2026-11-27: *"ต้องเดินเข้าไปนับของในโกดังว่าตรงกับในระบบไหม"*
     🔑 คนละเรื่องกับ "ยิงเก็บเข้าชั้น" (ที่ย้ายไป Pacred แล้ว) — ตรวจนับ **ไม่แก้ตำแหน่งของ**
        แค่บันทึกว่าเดินไปเห็นอะไรจริง แล้วเทียบกับที่ระบบบอก ⇒ อยู่ที่บอทได้ ไม่ขัดกติกา */
  app.get("/warehouse/count", servePage("warehouse-count.html"));

  /* ── ท่อข้อมูล ─────────────────────────────────────────────── */

  /** ภาพรวมทั้งโกดัง (ผัง + ของที่วาง + สถานะสด) */
  app.get("/warehouse/api/view", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      /* 🔗 ลิงก์หน้า 'ยิงเก็บเข้าชั้น' ของ Pacred — จอ 3D เอาไปทำปุ่ม (ภูม 2026-11-17)
         env ไม่ได้ตั้ง = null ⇒ จอซ่อนปุ่มเอง ไม่ใช่พาไปลิงก์เสีย */
      const v = await warehouse.view(req.query.wh);
      res.json(Object.assign(v, { putawayUrl: PUTAWAY_URL, pendingShelfUrl: PENDING_SHELF_URL }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /** สถานะของแทรคเดียว — หน้าคีย์ตำแหน่งใช้เตือนตอนพิมพ์ */
  app.get("/warehouse/api/job", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const t = String(req.query.tracking || "").trim();
      if (!t) return res.status(400).json({ error: "ไม่ได้ใส่เลขแทรค" });
      /* 🔑 ถามรายกล่อง ⇒ ฝั่งเว็บถึงจะส่งชื่อ/เบอร์/ที่อยู่มาให้ (ภาพรวมได้แค่ธง) */
      const live = await warehouse.jobsFromPacred([t], [t]);
      const job = (live.jobs || []).find((j) => String(j.tracking || "").trim() === t) || null;
      const st = pickStateOf(job, true);
      /* 📍 ช่องที่ของวางอยู่ = เอาจากงานของ Pacred ตรงๆ (เดฟ/ผู้ตรวจ 2026-11-18)
         เดิมถาม `find()` ที่อ่านสมุดเก่าของบอท (`wh_placement`) ⇒ กล่องที่ยิงเข้าชั้นที่ Pacred
         หลัง 11-17 ขึ้น "ยังไม่ถูกคีย์ตำแหน่ง" ทุกใบ ทั้งที่ผังวาดอยู่ถูกต้อง
         🔑 ที่พักของ (TEMP) ไม่ใช่ช่องชั้นวาง ⇒ ถือว่ายังไม่ได้วาง (กติกาเดียวกับผัง) */
      const code = String((job && job.location) || "").trim().toUpperCase();
      const onShelf =
        Boolean(code) && code !== "TEMP" && !(LAYOUT.isHolding && LAYOUT.isHolding(code));
      const placement = onShelf ? { tracking: t, slot: code, wh: LAYOUT.DEFAULT_WH } : null;
      res.json({
        tracking: t, job: job, state: st, liveOk: live.ok,
        placement: placement
          ? {
              slot: placement.slot, label: LAYOUT.slotLabel(placement.slot),
              /* 🏭 บอกโกดังด้วย — รหัสช่องซ้ำกันได้ 2 โกดัง (ภูมเคาะ 13/11) */
              wh: LAYOUT.normWh(placement.wh), whName: LAYOUT.whName(placement.wh),
            }
          : null,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /** 🔎 ค้นหาในชั้นวาง */
  app.get("/warehouse/api/find", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      const rows = await warehouse.find(req.query.q);
      const cages = await warehouse.findCages(req.query.q).catch(() => []);
      res.json({ rows: rows, cages: cages });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* 🚪 ภูม 2026-11-17 (*"ยิงที่ Pacred อย่างเดียว"*) — ทางเขียนตำแหน่งของบอทปิดแล้ว
     ตำแหน่งของอยู่ที่ Pacred ที่เดียว ⇒ ยิงที่นี่ = เขียนลงเล่มที่ไม่มีใครอ่าน (ยิงแล้วจอไม่ขยับ)
     ⇒ ตอบ 410 (ย้ายไปที่อื่นถาวร) พร้อม **ลิงก์หน้าที่ถูก** ไม่ใช่ปล่อยให้ยิงแล้วเงียบ
     🔒 ท่อกรงเหล็ก (/api/cage) ไม่เกี่ยว — กรงยังเป็นของบอทเหมือนเดิม */
  function movedToPacred(req, res) {
    return res.status(410).json({
      error:
        'ยิงเก็บเข้าชั้นย้ายไปที่ระบบ Pacred แล้ว — เปิด Warehouse › "ยิงเก็บเข้าชั้น" ' +
        "ยิงป้ายล็อกก่อน แล้วยิงกล่อง · ยิงที่นั่นแล้วจอ 3D อัปเดตให้เอง",
      movedTo: PUTAWAY_URL,
    });
  }

  app.post("/warehouse/api/place", json, movedToPacred);

  /**
   * 📤 เอาของออกจากชั้น
   * body.kind = "load" (เอาขึ้นรถ · จ่ายออกให้ลูกค้า) หรือเว้นว่าง (เอาออกเฉยๆ)
   */
  app.post("/warehouse/api/remove", json, movedToPacred);

  /**
   * 📷 ยิงรับเข้าชั้น — ลงตำแหน่ง + ตอบกลับทุกอย่างที่คนยิงต้องเห็นในครั้งเดียว
   *
   * ภูม 2026-11-12: *"พอพนักงานจะยิงรับเข้า ต้องพิมพ์ล็อกที่จะเอาเข้าหรือยิงบาโค้ดล็อกนั้นๆ
   * ก่อนนะ ถึงค่อยยิงรับเข้าตามปกติ"* — หน้าเว็บคุมลำดับ (ต้องมีช่องก่อน) · ที่นี่เขียนจริง
   *
   * 🔑 ตอบ tone กลับไปให้หน้าเว็บเลือกสี+เสียง: ok (เขียว) · warn (ส้ม) · bad (แดง)
   *    กล่องที่ "ห้ามหยิบ/ต้องเช็ค" ต้องดังไม่เหมือนกล่องปกติ ⇒ คนยิงรู้ตั้งแต่ตอนวางของ
   */
  app.post("/warehouse/api/scan", json, movedToPacred);

  /**
   * 🧺 กรงเหล็ก — ใส่กรงลงช่อง / แก้ชื่อ / เอากรงออก
   * ภูม 2026-11-13: *"เรามีกรงเหล็กที่ไว้ให้พวกสินค้าชิ้นเล็กๆและพวกสินค้าที่เป็น nocode"*
   * body: { slot, wh, kind: "small"|"nocode", name, note }  ·  { slot, wh, drop: true } = เอาออก
   */
  app.post("/warehouse/api/cage", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireTables(res))) return;
      const b = req.body || {};
      if (b.drop) return res.json(await warehouse.removeCage(b.wh, b.slot, who(req)));
      res.json(await warehouse.putCage(
        { wh: b.wh, slot: b.slot, kind: b.kind, name: b.name, note: b.note }, who(req),
      ));
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

  /* ══ 📋 ตรวจนับสต็อก (ภูม 2026-11-27) ═══════════════════════════
     เดินยิงรัวทุกกล่อง → ระบบเทียบกับ "ของที่ควรมี" ที่ถ่ายไว้ตอนเปิดรอบ
     🔒 ไม่แก้อะไรในระบบ Pacred — เป็นหลักฐานให้คนตัดสิน ไม่ใช่ตัวสั่งแก้ */
  /** ยังไม่ได้ลง SQL ของตรวจนับ = บอกให้ไปรัน (ไม่ใช่พังเงียบ) */
  async function requireCountTables(res) {
    if (await count.isReady()) return true;
    res.status(503).json({ error: count.SCHEMA_MSG });
    return false;
  }

  /** สถานะตอนนี้ — รอบที่เปิดอยู่ + ผลเทียบสด */
  app.get("/warehouse/api/count/now", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      const open = await count.openSession(req.query.wh);
      if (!open) return res.json({ open: null });
      const r = await count.report(open.id);
      res.json({ open: r.session, result: r.result, scanCount: r.scanCount });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/warehouse/api/count/open", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      res.json(await count.open({ wh: req.body && req.body.wh, by: who(req), note: req.body && req.body.note }));
    } catch (e) {
      res.status(e.code === "ALREADY_OPEN" ? 409 : 500).json({ error: e.message, session: e.session || null });
    }
  });

  app.post("/warehouse/api/count/scan", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      const b = req.body || {};
      res.json(await count.scan({ wh: b.wh, code: b.code, slot: b.slot, by: who(req) }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /** ยิงพลาดต้องแก้ได้ — ไม่งั้นพนักงานจะเลี่ยงไม่ใช้ */
  app.post("/warehouse/api/count/undo", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      res.json(await count.undoLast({ wh: req.body && req.body.wh }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post("/warehouse/api/count/close", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      res.json(await count.close({ wh: req.body && req.body.wh, by: who(req) }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /** ประวัติรอบนับ */
  app.get("/warehouse/api/count/list", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      res.json({ rows: await count.list({ wh: req.query.wh, limit: req.query.limit }) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /** ผลของรอบใดรอบหนึ่ง (ดูย้อนหลัง) */
  app.get("/warehouse/api/count/report", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      res.json(await count.report(req.query.id));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /** ไฟล์สรุปส่งพี่ป๊อป — CSV เปิดด้วย Excel (BOM ให้ภาษาไทยไม่เพี้ยน) */
  app.get("/warehouse/api/count/export", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!(await requireCountTables(res))) return;
      const { session, result } = await count.report(req.query.id);
      const cell = (v) => {
        const t = String(v == null ? "" : v);
        return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
      };
      const lines = [["ผล", "เลขแทรค", "รหัสลูกค้า", "ช่อง", "สถานะงาน", "ควรมี(กล่อง)", "นับได้(กล่อง)", "ขาด(กล่อง)"]];
      for (const r of result.rows) {
        const short = r.boxes - Math.min(r.scanned, r.boxes);
        lines.push([
          short === 0 ? "ครบ" : r.scanned === 0 ? "หายทั้งแถว" : "ขาดบางส่วน",
          r.tracking, r.memberCode || "", r.slot || "", r.statusTh || "", r.boxes, Math.min(r.scanned, r.boxes), short,
        ]);
      }
      for (const e of result.extra) lines.push(["ระบบไม่รู้จัก", e.code, "", "", "", 0, e.scanned, 0]);
      const csv = "\uFEFF" + lines.map((l) => l.map(cell).join(",")).join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="count-' + session.id + '.csv"');
      res.send(csv);
    } catch (e) { res.status(400).json({ error: e.message }); }
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
  const path = sub && ["assign", "scan", "labels", "count"].includes(sub) ? "/" + sub : "";
  return base + "/warehouse" + path + "?key=" + encodeURIComponent(key);
}

module.exports = { mountWarehouse, warehouseLink, checkKey };
