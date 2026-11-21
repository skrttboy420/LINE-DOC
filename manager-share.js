// ============================================================
// 🔗 หน้าลิงก์ส่งเจ้านาย — เช็คลิสต์ก่อนเลิกงาน แบบ "ดูอย่างเดียว" (ภูม 2026-11-21)
//
// ภูม: *"ถ้าทำเป็นลิงค์ฟอร์มด้วยได้ไหม … ภูมิติ๊กเสร็จแล้ว กดออกลิงค์ฟอร์มลิสที่ตรวจไปส่งพี่ป๊อปได้
//        พี่ป๊อปสามารถกดดูรูปที่แนบเป็นหลักฐานได้ด้วย เพราะตอนนี้มันเป็น ข้อความ กับ รูปภาพ
//        มันเลยดูรูปที่เราแนบไปด้วยในลิสไม่ได้"*
//
// 🔒 **หน้านี้ไม่ต้องใช้คีย์** ⇒ กฎเหล็ก 4 ข้อ:
//    ① เปิดได้เฉพาะ "เช็คลิสต์ของวันนั้นวันเดียว" — ไม่มีทีม · ไม่มีคะแนนประเมิน · ไม่มีรถ · ไม่มีสมุดงาน
//    ② อ่านอย่างเดียว — ไม่มีฟอร์ม ไม่มีปุ่มที่เขียนฐาน ไม่มี /manager/api ในหน้า
//    ③ ไม่ให้ค้นเจอ — noindex ทั้ง meta และหัวคำขอ (ตั้งที่ manager-page.js)
//    ④ ไม่โชว์ตัวโทเคนซ้ำในหน้า (กันหลุดจากภาพหน้าจอที่ส่งต่อกัน)
//
// 🔑 วาดเองทั้งหน้าแบบไฟล์เดียว ไม่พึ่งสคริปต์ข้างนอก (html2canvas ฯลฯ) — เจ้านายเปิดบนมือถือ
//    เน็ตช้าก็ต้องขึ้นครบ · รูปเป็น data URL ที่ฝังมาในหน้าแล้ว ไม่ต้องโหลดเพิ่ม
// ============================================================

const { CHECKLIST, itemState, summarize } = require("./manager-checklist");

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TH_DAY = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-11-21" → "ศุกร์ 21 พ.ย. 2569" (วันปฏิทินล้วน ไม่เกี่ยวโซนเวลา) */
function thaiDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!m) return String(day || "");
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return String(day);
  return TH_DAY[d.getDay()] + " " + d.getDate() + " " + TH_MON[d.getMonth()] + " " + (d.getFullYear() + 543);
}

/**
 * เวลาไทยจาก timestamp — 🪤 Render รันบน UTC ⇒ `d.getHours()` ได้เวลา UTC (เพี้ยน 7 ชม.)
 * ต้องแปลงโซนด้วย Intl เสมอ (กติกาเดียวกับ bkkParts ใน index.js)
 */
function thaiTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t) => (f.find((p) => p.type === t) || {}).value || "";
  let h = g("hour"); if (h === "24") h = "00";
  return h + ":" + g("minute");
}

const SHELL_CSS = [
  "*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}",
  "body{margin:0;background:#f4f5f7;color:#1f2430;font-size:15px;line-height:1.55;",
  "font-family:'Noto Sans Thai','Sarabun',system-ui,-apple-system,'Segoe UI',sans-serif}",
  ".wrap{max-width:480px;margin:0 auto;min-height:100vh;background:#f4f5f7}",
  ".top{background:linear-gradient(135deg,#7d0000,#B30000 60%,#cf1818);color:#fff;",
  "padding:20px max(18px,env(safe-area-inset-left,0px)) 22px;box-shadow:0 3px 16px rgba(179,0,0,.28)}",
  ".top .k{font-size:12px;opacity:.88;letter-spacing:.3px}",
  ".top h1{font-size:19px;font-weight:800;margin:3px 0 0}",
  ".top .d{font-size:13px;opacity:.92;margin-top:5px}",
  ".top .w{font-size:12px;opacity:.82;margin-top:2px}",
  ".body{padding:14px max(16px,env(safe-area-inset-left,0px)) 34px}",
  ".card{background:#fff;border-radius:16px;box-shadow:0 1px 2px rgba(20,24,40,.05),0 6px 20px rgba(20,24,40,.05);",
  "padding:14px;margin-bottom:12px}",
  ".sum{display:flex;gap:7px;flex-wrap:wrap;margin:0 2px 12px}",
  ".pill{font-size:12px;font-weight:800;padding:5px 11px;border-radius:20px}",
  ".p-ok{color:#17a66a;background:#e6f6ee}.p-warn{color:#e08a00;background:#fdf2df}",
  ".p-todo{color:#6b7280;background:#eceef2}",
  ".sec{font-size:12.5px;font-weight:800;color:#6b7280;margin:16px 2px 9px}",
  ".it{display:flex;gap:11px;padding:11px 2px;align-items:flex-start}",
  ".it+.it{border-top:1px solid #eceef2}",
  ".mk{width:22px;height:22px;border-radius:7px;flex:0 0 auto;display:grid;place-items:center;",
  "font-size:13px;font-weight:800;line-height:1;margin-top:1px}",
  ".mk.ok{background:#17a66a;color:#fff}.mk.issue{background:#fdf2df;color:#e08a00;border:1.5px solid #f0cc8a}",
  ".mk.todo{background:#fff;border:2px solid #cbd1da}",
  ".it .t{font-size:14.5px;min-width:0}",
  ".it.ok .t{color:#6b7280}",
  ".note{margin-top:6px;background:#fdf2df;border-left:3px solid #e08a00;border-radius:0 9px 9px 0;",
  "padding:8px 10px;font-size:13.5px;color:#7a4a00;white-space:pre-wrap;word-break:break-word}",
  ".note b{display:block;font-size:11.5px;font-weight:800;color:#e08a00;margin-bottom:2px}",
  ".cnt{margin-top:4px;font-size:12.5px;color:#6b7280}.cnt b{color:#1f2430}",
  ".ph{display:flex;gap:9px;flex-wrap:wrap}",
  ".ph a{line-height:0;display:block}",
  ".ph img{width:92px;height:92px;object-fit:cover;border-radius:12px;border:1px solid #eceef2;background:#f4f5f7}",
  ".foot{font-size:11.5px;color:#9aa1ad;margin:2px 4px;line-height:1.6}",
  ".empty{color:#9aa1ad;font-size:13px;text-align:center;padding:16px 4px}",
  /* 🔎 ดูรูปเต็มจอด้วย :target — ไม่ต้องใช้สคริปต์เลย (กดรูป = เปิด · กดพื้นหลัง/✕ = ปิด) */
  ".lb{position:fixed;inset:0;background:rgba(10,12,18,.93);display:none;z-index:50;",
  "align-items:center;justify-content:center;padding:14px}",
  ".lb:target{display:flex}",
  ".lb img{max-width:100%;max-height:86vh;border-radius:10px}",
  ".lb .x{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:16px;color:#fff;",
  "font-size:26px;font-weight:700;text-decoration:none;line-height:1}",
  ".lb .hint{position:absolute;bottom:calc(16px + env(safe-area-inset-bottom,0px));left:0;right:0;",
  "text-align:center;color:#cfd3da;font-size:12px}",
  ".lb .back{position:absolute;inset:0}",
].join("");

function head(title) {
  return [
    '<!doctype html><html lang="th"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    "<title>" + esc(title) + "</title>",
    "<style>" + SHELL_CSS + "</style></head><body>",
  ].join("");
}

/** ลิงก์ที่ใช้ไม่ได้แล้ว — บอกตรงๆ ว่าทำไม ไม่ใช่หน้า 404 เปล่าๆ */
function shareDeadPage() {
  return [
    head("ลิงก์เช็คลิสต์ใช้ไม่ได้แล้ว"),
    '<div class="wrap"><div class="top"><div class="k">PACRED · โกดัง</div>',
    "<h1>ลิงก์นี้ใช้ไม่ได้แล้ว</h1>",
    '<div class="d">อาจเป็นเพราะหัวหน้าโกดังออกลิงก์ใบใหม่ หรือลิงก์ถูกคัดลอกมาไม่ครบ</div></div>',
    '<div class="body"><div class="card"><div class="empty">ขอลิงก์ใหม่จากหัวหน้าโกดังอีกครั้งได้เลยครับ</div></div>',
    '<div class="foot">แต่ละวันมีลิงก์ของตัวเอง · ออกใบใหม่แล้วใบเก่าจะใช้ไม่ได้ทันที (กันลิงก์เก่าหลุดไปที่อื่น)</div>',
    "</div></div></body></html>",
  ].join("");
}

/**
 * หน้ารายงานของวันนั้น
 * @param {object} row แถวจาก manager.getShared() — { day, checks, notes, pallet, photos, updated_by, updated_at }
 */
function sharePage(row) {
  const r = row || {};
  const checks = r.checks || {};
  const notes = r.notes || {};
  const photos = Array.isArray(r.photos) ? r.photos : [];
  const s = summarize(checks, notes);
  const pallet = String(r.pallet == null ? "" : r.pallet).trim();
  const when = thaiTime(r.updated_at);

  const items = CHECKLIST.map((it) => {
    const st = itemState(it.k, checks, notes);
    const mark = st === "ok" ? "✓" : st === "issue" ? "!" : "";
    const note = String(notes[it.k] == null ? "" : notes[it.k]).trim();
    let extra = "";
    if (it.num && pallet) extra += '<div class="cnt">นับได้ <b>' + esc(pallet) + "</b> พาเลท</div>";
    if (note) extra += '<div class="note"><b>หมายเหตุจากหัวหน้า</b>' + esc(note) + "</div>";
    return (
      '<div class="it ' + st + '"><div class="mk ' + st + '">' + mark + "</div>" +
      '<div class="t">' + esc(it.t) + extra + "</div></div>"
    );
  }).join("");

  /* รูปหลักฐาน — แตะแล้วเปิดเต็มจอ (:target · ไม่ใช้สคริปต์) */
  let photoCard = "";
  if (photos.length) {
    const thumbs = photos
      .map((src, i) => '<a href="#p' + i + '"><img src="' + esc(src) + '" alt="รูปหลักฐานที่ ' + (i + 1) + '"></a>')
      .join("");
    const boxes = photos
      .map(
        (src, i) =>
          '<div class="lb" id="p' + i + '"><a class="back" href="#close" aria-label="ปิด"></a>' +
          '<a class="x" href="#close" aria-label="ปิด">&times;</a>' +
          '<img src="' + esc(src) + '" alt="รูปหลักฐานที่ ' + (i + 1) + '">' +
          '<div class="hint">กดค้างที่รูปเพื่อบันทึก · แตะพื้นหลังเพื่อปิด</div></div>',
      )
      .join("");
    photoCard =
      '<div class="sec">📷 รูปหลักฐาน (' + photos.length + ") — แตะที่รูปเพื่อดูเต็มจอ</div>" +
      '<div class="card"><div class="ph">' + thumbs + "</div></div>" + boxes;
  }

  return [
    head("เช็คลิสต์ก่อนเลิกงาน · " + thaiDay(r.day)),
    '<div class="wrap">',
    '<div class="top"><div class="k">PACRED · โกดัง</div><h1>เช็คลิสต์ก่อนเลิกงาน</h1>',
    '<div class="d">' + esc(thaiDay(r.day)) + "</div>",
    '<div class="w">ผู้ตรวจ: ' + esc(String(r.updated_by || "").trim() || "หัวหน้าโกดัง") +
      (when ? " · บันทึกล่าสุด " + esc(when) + " น." : "") + "</div></div>",
    '<div class="body">',
    '<div class="sum">',
    '<span class="pill p-ok">ผ่าน ' + s.ok + "/" + s.total + "</span>",
    s.issue ? '<span class="pill p-warn">⚠ มีปัญหา ' + s.issue + " ข้อ</span>" : "",
    s.todo ? '<span class="pill p-todo">ยังไม่ได้ตรวจ ' + s.todo + " ข้อ</span>" : "",
    "</div>",
    '<div class="card">' + items + "</div>",
    photoCard,
    '<div class="foot">หน้านี้ดูอย่างเดียว — ข้อมูลตรงกับที่หัวหน้าโกดังบันทึกไว้ในระบบ ณ เวลาที่เปิดหน้านี้<br>',
    "⚠️ ใครถือลิงก์นี้ก็เปิดได้ กรุณาไม่ส่งต่อให้คนนอก</div>",
    "</div></div></body></html>",
  ].join("");
}

module.exports = { sharePage, shareDeadPage, thaiDay, thaiTime };
