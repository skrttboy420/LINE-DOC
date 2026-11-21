// ============================================================
// 🧑‍💼 ศูนย์จัดการโกดัง — หน้าเว็บ + ท่อข้อมูล (ภูม 2026-11-20)
//
// แอปแยกของหัวหน้าโกดัง (ภูม) — เปิดจากปุ่มในบอทไลน์ หรือพิมพ์ลิงก์+คีย์
//   เปิดที่:  https://<บอทบน Render>/manager?key=<คีย์>
//
// 🔑 คีย์: ตั้ง MANAGER_KEY (ของหัวหน้า) ก็ได้ · ไม่ตั้งก็ใช้ ADMIN_KEY เดิมของภูมได้เลย
//    ไม่ตั้งทั้ง 2 ใบ = ปิดหน้านี้ (fail-closed)
//    🔒 หน้านี้มีข้อมูลประเมินพนักงาน ⇒ อย่าแจกคีย์ให้พนักงานทั่วไป
//       (ปุ่มในบอทโชว์เฉพาะเจ้าของ/ทีมระบบ — ดู index.js)
//
// 🔒 ไม่แตะระบบ Pacred — เขียนแค่ตารางของบอท (mgr_*) · ดู manager.js + manager-schema.sql
// ============================================================

const fs = require("node:fs");
const path = require("node:path");

/* 🔗 หน้าลิงก์ "ดูอย่างเดียว" ที่ส่งให้เจ้านาย (ไม่ต้องใช้คีย์) — ดู manager-share.js */
const { sharePage, shareDeadPage } = require("./manager-share");

/* 🔐 ทางเข้า (คีย์ → คุกกี้ → URL สะอาด) อยู่ที่ manager-auth.js ที่เดียว —
      หน้านี้เก็บคะแนนประเมินพนักงาน ⇒ คีย์ต้องไม่ค้างใน URL/ประวัติ/ภาพหน้าจอ */
const {
  NO_KEY_MSG,
  activeKey,
  checkKey,
  cameWithKey,
  setSession,
  signInPage,
} = require("./manager-auth");

/** อ่านไฟล์หน้าเว็บ — อ่านสดตอน dev · แคชตอนรันจริง (แบบเดียวกับ warehouse-page) */
const pageCache = {};
function readPage(file) {
  if (process.env.NODE_ENV !== "production") return fs.readFileSync(path.join(__dirname, file), "utf8");
  if (!pageCache[file]) pageCache[file] = fs.readFileSync(path.join(__dirname, file), "utf8");
  return pageCache[file];
}

/* ── 📋 ฝังตัวเช็คลิสต์ลงหน้าเว็บ ──────────────────────────────────
 *
 * 🔑 ทั้ง **ข้อความ 10 ข้อ** และ **กติกาตัดสินสถานะ** (ผ่าน / มีหมายเหตุ / ยังไม่ตรวจ)
 *    อยู่ใน manager-checklist.js ที่เดียว แล้วยก "ซอร์สจริง" ฝังเข้าหน้าเว็บตอนเสิร์ฟ
 *    ⇒ จอของหัวหน้า กับ หน้าลิงก์ที่เจ้านายเปิด **นับด้วยโค้ดบรรทัดเดียวกัน**
 *    (ถ้าก๊อปกติกาไว้ 2 ที่ วันไหนแก้ ตัวเลขบน 2 จอจะไม่ตรงกัน = เรื่องที่ภูมจับได้แน่)
 * 🪤 หาเครื่องหมายไม่เจอ / แปลงซอร์สไม่ได้ = **พังเสียงดังทันที** ไม่ใช่ปล่อยให้เช็คลิสต์ว่างเงียบๆ
 */
const CHK_MARK = /\/\*__CHK_MODULE__\*\/[\s\S]*?\/\*__CHK_MODULE_END__\*\//;
const EXPORT_LINE = /^module\.exports\s*=.*$/m;

/** ซอร์สของ manager-checklist.js ที่รันในเบราว์เซอร์ได้ (ครอบ IIFE · ยิงออกทาง window.MGR_CHK) */
function checklistBrowserSource() {
  const src = fs.readFileSync(path.join(__dirname, "manager-checklist.js"), "utf8");
  if (!EXPORT_LINE.test(src)) {
    throw new Error("manager-checklist.js: หาบรรทัด module.exports ไม่เจอ — แปลงเป็นสคริปต์เบราว์เซอร์ไม่ได้");
  }
  const body = src.replace(EXPORT_LINE, "window.MGR_CHK = { CHECKLIST, CHECK_KEYS, itemState, summarize };");
  return "(function(){\n" + body + "\n})();";
}

function injectChecklist(html) {
  const out = html.replace(CHK_MARK, () => checklistBrowserSource());
  if (out === html) {
    throw new Error("manager.html: หาเครื่องหมาย __CHK_MODULE__ ไม่เจอ — เช็คลิสต์จะขึ้นเป็นหน้าว่าง");
  }
  return out;
}

/** ลิงก์เต็มของหน้าแชร์ — ไม่รู้โดเมน (รันในเครื่อง) = คืน "" แล้วให้จอต่อ origin เอง */
function shareUrlOf(token) {
  const base = String(process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/[/]+$/, "");
  /* 🪤 อย่าตั้งชื่อตัวแปรนี้ว่า path — จะไปบังโมดูล path ที่ไฟล์นี้ใช้อ่านไฟล์หน้าเว็บ */
  const at = "/manager/r/" + encodeURIComponent(token);
  return { token, path: at, url: base ? base + at : "" };
}

/**
 * @param {object} app      express app
 * @param {object} manager  ตัวที่ createManager() คืนมา
 */
function mountManager(app, manager) {
  const express = require("express");
  /* 🔑 limit ใหญ่กว่า warehouse เพราะหน้านี้ส่งรูปใบขับขี่ (data URL บีบแล้ว ~ ไม่กี่ร้อย KB) */
  const json = express.json({ limit: "8mb" });

  /* หน้าเว็บ — gate ด้วยคีย์ */
  app.get("/manager", (req, res) => {
    const k = checkKey(req);
    if (k === "no-key") return res.status(503).type("text/plain; charset=utf-8").send(NO_KEY_MSG);
    if (k === "bad-key") {
      /* ใส่คีย์มาแล้วผิด = เตือน · ไม่ได้ใส่มาเลย = หน้ากรอกคีย์เฉยๆ (ไม่ใช่หน้า error) */
      const tried = !!String(req.query.key || req.get("x-manager-key") || "").trim();
      return res.status(tried ? 401 : 200).type("html").send(signInPage(tried));
    }
    /* 🔑 เข้าด้วย ?key=… ถูก ⇒ แลกเป็นคุกกี้ แล้วเด้งไป /manager เปล่าๆ
          (คีย์หายจากช่อง URL · ประวัติเบราว์เซอร์ · ภาพหน้าจอ ตั้งแต่วินาทีแรก) */
    if (cameWithKey(req)) {
      setSession(res);
      return res.redirect(302, "/manager");
    }
    res.type("html").send(injectChecklist(readPage("manager.html")));
  });

  /* หน้ากรอกคีย์ส่งมาที่นี่ — POST ⇒ คีย์ไม่ติดไปกับ URL เลย */
  app.post("/manager/login", express.urlencoded({ extended: false }), (req, res) => {
    if (!activeKey()) return res.status(503).type("text/plain; charset=utf-8").send(NO_KEY_MSG);
    if (checkKey(req) !== "ok") return res.status(401).type("html").send(signInPage(true));
    setSession(res);
    res.redirect(302, "/manager");
  });

  /* ── 🔗 หน้าที่เจ้านายเปิด (ไม่ต้องใช้คีย์) ─────────────────────
   *
   * 🔒 ทางเข้าคือ **โทเคนของวันนั้น** ไม่ใช่คีย์หัวหน้า ⇒ เปิดได้แค่เช็คลิสต์วันเดียว อ่านอย่างเดียว
   *    (คีย์หัวหน้าเปิดได้ทั้งแอป รวมคะแนนประเมินพนักงาน — ห้ามเอาไปทำลิงก์ส่งต่อ)
   * 🔒 ห้ามให้ค้นเจอ/ถูกแคชตามพร็อกซี — ใส่หัวคำขอ noindex + no-store ทุกครั้ง
   */
  app.get("/manager/r/:token", async (req, res) => {
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Referrer-Policy", "no-referrer");
    try {
      const row = await manager.getShared(req.params.token);
      /* ไม่เจอ = 404 + บอกว่าทำไม (มักเพราะหัวหน้าออกใบใหม่ทับ) */
      if (!row) return res.status(404).type("html").send(shareDeadPage());
      res.type("html").send(sharePage(row));
    } catch (e) {
      const msg = (e && e.message) || "เปิดลิงก์ไม่ได้";
      res.status(/ยังไม่ได้ลงตาราง/.test(msg) ? 503 : 400)
        .type("text/plain; charset=utf-8").send(msg);
    }
  });

  /* ── ท่อข้อมูล (ทุกเส้นต้องผ่านคีย์) ───────────────────────────── */

  function guard(req, res) {
    const k = checkKey(req);
    if (k === "no-key") { res.status(503).json({ error: NO_KEY_MSG }); return false; }
    if (k === "bad-key") { res.status(401).json({ error: "คีย์ไม่ถูกต้อง" }); return false; }
    return true;
  }

  /** คนที่บันทึก — เว็บส่ง by มา (จำชื่อที่ผู้ใช้พิมพ์ครั้งเดียว) · ไม่ส่ง = "หัวหน้า" */
  const who = (req) => {
    const said = String((req.body && req.body.by) || req.query.u || "").trim();
    return said ? said.slice(0, 40) : "หัวหน้า";
  };

  /** ครอบ handler: ผ่านคีย์ก่อน แล้วค่อยทำ · error = ข้อความไทยที่คนอ่านรู้เรื่อง */
  const api = (method, route, run) =>
    app[method](route, method === "post" ? json : (req, res, next) => next(), async (req, res) => {
      if (!guard(req, res)) return;
      try {
        res.json(await run(req));
      } catch (e) {
        /* "ยังไม่ได้ลงตาราง…" = ยังไม่ได้รัน SQL ⇒ 503 (ชั่วคราว) · อื่นๆ = 400 */
        const msg = (e && e.message) || "มีบางอย่างผิดพลาด";
        res.status(/ยังไม่ได้ลงตาราง/.test(msg) ? 503 : 400).json({ error: msg });
      }
    });

  /* โหลดทีเดียวตอนเปิดหน้า — ลดจำนวนรอบ (เช็คลิสต์วันนี้ + ทีม + รถ + งาน) */
  api("get", "/manager/api/bootstrap", async (req) => {
    const day = String(req.query.day || "").trim();
    const [checklist, team, trucks, tasks] = await Promise.all([
      day ? manager.getChecklist(day) : Promise.resolve({ checks: {}, pallet: "" }),
      manager.listTeam(),
      manager.listTrucks(),
      manager.listTasks(),
    ]);
    return { checklist, team, trucks, tasks };
  });

  /* เช็คลิสต์ */
  api("get", "/manager/api/checklist", async (req) => manager.getChecklist(req.query.day));
  api("post", "/manager/api/checklist", async (req) =>
    /* 🪤 ครั้งแรกลืมส่ง notes ต่อตรงนี้ ⇒ จอขึ้น "บันทึกแล้ว" แต่หมายเหตุไม่เคยถึงฐาน (รีหน้าแล้วหาย)
          — เทส "หมายเหตุที่พิมพ์ต้องไปโผล่หน้าเจ้านาย" ใน manager-share.test.js กันไว้แล้ว */
    manager.saveChecklist(req.body.day, req.body.checks, req.body.pallet, who(req), req.body.photos, req.body.notes));
  /* ประวัติย้อนหลัง — สรุปต่อวัน (กดวันไหนค่อยเรียก /checklist?day= ของวันนั้น) */
  api("get", "/manager/api/checklist/history", async (req) =>
    ({ days: await manager.listChecklistDays(req.query.limit) }));

  /* 🔗 ลิงก์ส่งเจ้านาย — มีอยู่แล้วใช้ใบเดิม · "ใบใหม่" = ใบเก่าใช้ไม่ได้ทันที */
  api("get", "/manager/api/share", async (req) =>
    shareUrlOf((await manager.ensureShareToken(req.query.day)).token));
  api("post", "/manager/api/share/new", async (req) =>
    shareUrlOf((await manager.rotateShareToken(req.body.day)).token));

  /* ทีม */
  api("get", "/manager/api/team", async () => ({ team: await manager.listTeam() }));
  api("post", "/manager/api/team/add", async (req) => manager.addTeam(req.body.name));
  api("post", "/manager/api/team/update", async (req) => manager.updateTeam(req.body.id, req.body));
  api("post", "/manager/api/team/delete", async (req) => manager.deleteTeam(req.body.id));

  /* โน้ตประเมิน */
  api("get", "/manager/api/team/notes", async (req) => ({ notes: await manager.listNotes(req.query.member) }));
  api("post", "/manager/api/team/notes/add", async (req) => manager.addNote(req.body.member, req.body.body));
  api("post", "/manager/api/team/notes/delete", async (req) => manager.deleteNote(req.body.id));

  /* รถ */
  api("get", "/manager/api/trucks", async () => ({ trucks: await manager.listTrucks() }));
  api("post", "/manager/api/truck/add", async (req) => manager.addTruck(req.body.name));
  api("post", "/manager/api/truck/update", async (req) => manager.updateTruck(req.body.id, req.body));
  api("post", "/manager/api/truck/delete", async (req) => manager.deleteTruck(req.body.id));

  /* สมุดงาน */
  api("get", "/manager/api/tasks", async () => ({ tasks: await manager.listTasks() }));
  api("post", "/manager/api/task/add", async (req) => manager.addTask(req.body.body));
  api("post", "/manager/api/task/update", async (req) => manager.updateTask(req.body.id, req.body));
  api("post", "/manager/api/task/delete", async (req) => manager.deleteTask(req.body.id));

  console.log(
    activeKey()
      ? "🧑‍💼 หน้าศูนย์จัดการโกดังเปิดอยู่ที่ /manager (ใส่คีย์ครั้งแรกครั้งเดียว)"
      : "⚠️ ยังไม่ได้ตั้ง MANAGER_KEY/ADMIN_KEY — หน้าศูนย์จัดการโกดังปิดอยู่",
  );
}

/**
 * ลิงก์หน้าศูนย์จัดการโกดัง — "" = เปิดไม่ได้ · ใช้ทำปุ่มในบอท
 *
 * 🔑 ยังพาคีย์ไปด้วย เพื่อให้กดจากไลน์แล้วเข้าได้เลยครั้งแรก — แต่พอถึงหน้าแล้ว
 *    ระบบแลกเป็นคุกกี้ทันทีและเด้งไป /manager เปล่าๆ ⇒ คีย์ไม่ค้างในประวัติ/ภาพหน้าจอ
 *    (ตัวลิงก์ในข้อความไลน์ยังมีคีย์อยู่ ⇒ อย่าส่งต่อข้อความนั้นให้คนนอก)
 */
function managerLink() {
  const base = String(process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/[/]+$/, "");
  const key = activeKey();
  if (!base || !key) return "";
  return base + "/manager?key=" + encodeURIComponent(key);
}

module.exports = { mountManager, managerLink, checkKey };
