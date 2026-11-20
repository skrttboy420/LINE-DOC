// ============================================================
// 🔐 ศูนย์จัดการโกดัง — ทางเข้า (ภูม 2026-11-20 รอบ 2)
//
// 🔴 ปัญหาเดิม: คีย์เดินทางอยู่ใน URL (`/manager?key=…`)
//    ⇒ ไปโผล่ใน **ประวัติเบราว์เซอร์ · ข้อความไลน์ที่บอทส่งลิงก์ · access log ของ Render ·
//       ภาพหน้าจอที่ส่งต่อกัน** — ทั้งที่หน้านี้เก็บ **คะแนนประเมินพนักงาน**
//
// ✅ ที่แก้: คีย์ใช้ "ครั้งแรกครั้งเดียว" แล้วแลกเป็นคุกกี้ จากนั้นเด้งไป URL สะอาด
//    • เข้าด้วย ?key=… ถูก  → ตั้งคุกกี้ + เด้งไป /manager (ไม่มีคีย์ใน URL อีกเลย)
//    • ไม่มีคีย์/คุกกี้      → หน้ากรอกคีย์ (ไม่ใช่หน้า 401 เปล่าๆ)
//    • คุกกี้เก็บ sha256 ของคีย์ ไม่ใช่ตัวคีย์ · HttpOnly ⇒ สคริปต์ในหน้าอ่านไม่ได้
//
// 🔑 เปลี่ยน MANAGER_KEY เมื่อไหร่ = คุกกี้เก่าใช้ไม่ได้ทันที (ไม่ต้องมีปุ่มออกจากระบบ)
// ============================================================

const crypto = require("node:crypto");

const COOKIE = "mgr_s";
const MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 วัน

const keyOf = (name) => (process.env[name] || "").trim();

/** คีย์ที่ใช้อยู่จริง — MANAGER_KEY มาก่อน ไม่มีก็ ADMIN_KEY */
function activeKey() {
  return keyOf("MANAGER_KEY") || keyOf("ADMIN_KEY");
}

const NO_KEY_MSG =
  "ยังไม่ได้ตั้ง MANAGER_KEY (หรือ ADMIN_KEY) ที่ Render — หน้าศูนย์จัดการโกดังถูกปิดไว้";

/** เทียบคีย์แบบไม่บอกใบ้ความยาว */
function sameKey(given, want) {
  return !!want && given.length === want.length && given === want;
}

/** ค่าในคุกกี้ = ลายนิ้วมือของคีย์ (ไม่ใช่ตัวคีย์) */
function tokenOf(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 32);
}

/** อ่านคุกกี้ชื่อหนึ่งจากหัวคำขอ (ไม่ต้องพึ่ง cookie-parser) */
function cookieOf(req, name) {
  const raw = String((req.headers && req.headers.cookie) || "");
  for (const part of raw.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return part.slice(at + 1).trim(); }
  }
  return "";
}

/** คีย์ที่ผู้เรียกส่งมา (query · หัวคำขอ · ฟอร์ม) — ไม่รวมคุกกี้ */
function givenKey(req) {
  const q = (req.query && req.query.key) || "";
  const h = (req.get && req.get("x-manager-key")) || "";
  const b = (req.body && req.body.key) || "";
  return String(q || h || b || "").trim();
}

/**
 * "ok" | "no-key" (ยังไม่ตั้งที่ Render) | "bad-key"
 * ผ่านได้ 2 ทาง: คีย์ที่ส่งมา หรือ คุกกี้ที่แลกไว้แล้ว
 */
function checkKey(req) {
  const key = activeKey();
  if (!key) return "no-key";
  if (sameKey(givenKey(req), key)) return "ok";
  if (cookieOf(req, COOKIE) === tokenOf(key)) return "ok";
  return "bad-key";
}

/** เข้าได้ด้วยคีย์ที่ส่งมา (ไม่ใช่คุกกี้) ⇒ ต้องแลกเป็นคุกกี้แล้วล้างคีย์ออกจาก URL */
function cameWithKey(req) {
  const key = activeKey();
  return !!key && sameKey(givenKey(req), key);
}

/** ตั้งคุกกี้ให้เบราว์เซอร์ (HttpOnly · ข้ามเว็บไม่ได้ · https เท่านั้นตอนรันจริง) */
function setSession(res) {
  const key = activeKey();
  if (!key) return;
  const bits = [
    COOKIE + "=" + tokenOf(key),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + MAX_AGE_SEC,
  ];
  if (process.env.NODE_ENV === "production") bits.push("Secure");
  res.setHeader("Set-Cookie", bits.join("; "));
}

/** หน้ากรอกคีย์ — ขึ้นแทนหน้า 401 เปล่าๆ (ฟอร์มส่งแบบ POST ⇒ คีย์ไม่ติดไปกับ URL) */
function signInPage(wrong) {
  const warn = wrong
    ? '<p class="bad">คีย์ไม่ถูกต้อง ลองใหม่อีกครั้ง</p>'
    : "";
  return [
    '<!doctype html><html lang="th"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    "<title>ศูนย์จัดการโกดัง</title><style>",
    "*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;",
    "background:#f1f5f9;font-family:'Prompt','Noto Sans Thai',-apple-system,sans-serif;color:#0f172a}",
    ".card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:26px 24px;width:min(360px,92vw);",
    "box-shadow:0 10px 30px rgba(15,23,42,.08)}",
    "h1{font-size:17px;margin:0 0 4px}p{font-size:13px;color:#64748b;margin:0 0 16px;line-height:1.5}",
    ".bad{color:#be185d;font-weight:600}",
    "input{width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;font-family:inherit}",
    "input:focus{outline:2px solid #8c0000;outline-offset:1px;border-color:#8c0000}",
    "button{width:100%;margin-top:12px;padding:11px;border:0;border-radius:10px;background:#8c0000;color:#fff;",
    "font-size:15px;font-weight:600;font-family:inherit;cursor:pointer}button:hover{background:#b30000}",
    "</style></head><body><form class='card' method='post' action='/manager/login'>",
    "<h1>🧑‍💼 ศูนย์จัดการโกดัง</h1>",
    "<p>ใส่คีย์เพื่อเข้าใช้งาน — ใส่ครั้งเดียว เครื่องนี้จะจำไว้ 30 วัน</p>",
    warn,
    "<input type='password' name='key' autocomplete='current-password' autofocus placeholder='คีย์'>",
    "<button type='submit'>เข้าใช้งาน</button>",
    "</form></body></html>",
  ].join("");
}

module.exports = { COOKIE, NO_KEY_MSG, activeKey, checkKey, cameWithKey, setSession, signInPage };
