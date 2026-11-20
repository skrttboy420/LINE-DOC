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

const keyOf = (name) => (process.env[name] || "").trim();

/** เทียบคีย์แบบไม่บอกใบ้ความยาว (แบบเดียวกับ warehouse-page) */
function sameKey(given, want) {
  return !!want && given.length === want.length && given === want;
}

/** "ok" | "no-key" (ยังไม่ตั้ง) | "bad-key" — รับได้ทั้ง MANAGER_KEY และ ADMIN_KEY */
function checkKey(req) {
  const mgr = keyOf("MANAGER_KEY"), admin = keyOf("ADMIN_KEY");
  if (!mgr && !admin) return "no-key";
  const given = String(req.query.key || req.get("x-manager-key") || "").trim();
  if (sameKey(given, mgr) || sameKey(given, admin)) return "ok";
  return "bad-key";
}

const NO_KEY_MSG =
  "ยังไม่ได้ตั้ง MANAGER_KEY (หรือ ADMIN_KEY) ที่ Render — หน้าศูนย์จัดการโกดังถูกปิดไว้";

/** อ่านไฟล์หน้าเว็บ — อ่านสดตอน dev · แคชตอนรันจริง (แบบเดียวกับ warehouse-page) */
const pageCache = {};
function readPage(file) {
  if (process.env.NODE_ENV !== "production") return fs.readFileSync(path.join(__dirname, file), "utf8");
  if (!pageCache[file]) pageCache[file] = fs.readFileSync(path.join(__dirname, file), "utf8");
  return pageCache[file];
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
    if (k === "bad-key")
      return res.status(401).type("text/plain; charset=utf-8").send("คีย์ไม่ถูกต้อง — ใส่ ?key=<คีย์> ท้าย URL");
    res.type("html").send(readPage("manager.html"));
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
    manager.saveChecklist(req.body.day, req.body.checks, req.body.pallet, who(req)));

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
    keyOf("MANAGER_KEY") || keyOf("ADMIN_KEY")
      ? "🧑‍💼 หน้าศูนย์จัดการโกดังเปิดอยู่ที่ /manager?key=…"
      : "⚠️ ยังไม่ได้ตั้ง MANAGER_KEY/ADMIN_KEY — หน้าศูนย์จัดการโกดังปิดอยู่",
  );
}

/** ลิงก์หน้าศูนย์จัดการโกดัง (พากุญแจไปด้วย) — "" = เปิดไม่ได้ · ใช้ทำปุ่มในบอท */
function managerLink() {
  const base = String(process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/[/]+$/, "");
  const key = keyOf("MANAGER_KEY") || keyOf("ADMIN_KEY");
  if (!base || !key) return "";
  return base + "/manager?key=" + encodeURIComponent(key);
}

module.exports = { mountManager, managerLink, checkKey };
