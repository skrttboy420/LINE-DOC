// ============================================================
// 🛠 หน้าจัดการสิทธิ์ของบอท — ภูม 2026-10-20
//
// ภูม: *"ถ้าสร้างหน้าขึ้นมาไม่เกี่ยวกับ pacred เลย เวลาภูมิจะจัดการสิทธิ์ก็กดลิงค์เข้าไป
//        เป็นเหมือน webapp และแก้ไขได้เลยถูกต้องไหม"* → ใช่ · นี่คือตัวนั้น
//
// เปิดที่:  https://<บอทบน Render>/admin?key=<ADMIN_KEY>
// 🔒 ต้องตั้ง env `ADMIN_KEY` (สุ่มยาวๆ) ก่อน · ไม่ตั้ง = ปิดหน้านี้ทั้งหน้า (fail-closed)
//
// ทำอะไรได้: ออกรหัสเชิญ · ติ๊กหมวดแจ้งเตือนรายคน · ถอดคนออก · ซิงค์กับเว็บ Pacred
// ไม่แตะเว็บ Pacred เลย — อ่านรายชื่อพนักงานผ่านท่อ /api/bot?q=staff เท่านั้น
// ============================================================

const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

/** ด่าน — ไม่ตั้งคีย์ = ปิดหน้านี้ · คีย์ผิด = 401 */
function checkKey(req) {
  if (!ADMIN_KEY) return "no-key";
  const given = String(req.query.key || req.get("x-admin-key") || "").trim();
  if (given.length !== ADMIN_KEY.length || given !== ADMIN_KEY) return "bad-key";
  return "ok";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page() {
  return `<!doctype html><html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>จัดการสิทธิ์บอท Pacred</title>
<style>
 :root{--red:#B30000;--line:#e5e7eb;--muted:#6b7280;--bg:#f8fafc}
 *{box-sizing:border-box}
 body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif;background:var(--bg);color:#111}
 header{background:var(--red);color:#fff;padding:14px 16px;position:sticky;top:0;z-index:5}
 header b{font-size:17px}
 header span{opacity:.85;font-size:12px;display:block;margin-top:2px}
 main{padding:16px;max-width:1100px;margin:0 auto}
 .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:16px}
 .card h2{margin:0 0 10px;font-size:15px}
 .muted{color:var(--muted);font-size:12px}
 button{background:var(--red);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer}
 button.ghost{background:#fff;color:#111;border:1px solid var(--line)}
 button:disabled{opacity:.5;cursor:default}
 select,input{padding:8px;border:1px solid var(--line);border-radius:8px;font-size:13px;max-width:100%}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
 th{font-size:11px;color:var(--muted);font-weight:600}
 .chips{display:flex;flex-wrap:wrap;gap:6px}
 .chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:12px;cursor:pointer;background:#fff;user-select:none}
 .chip.on{background:#fff1f1;border-color:#f3b4b4;color:var(--red);font-weight:600}
 .chip.sens{border-style:dashed}
 .off{opacity:.55}
 .pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600}
 .ok{background:#ecfdf5;color:#047857}.no{background:#f1f5f9;color:#475569}
 .code{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;letter-spacing:.5px}
 .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 .err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px;border-radius:8px;font-size:13px;margin-bottom:12px}
 .grp{margin-bottom:8px}
 .grp>.gh{font-size:11px;color:var(--muted);font-weight:600;margin-bottom:3px}
 .gear{border:0;background:#eef2f7;color:#475569;border-radius:999px;padding:1px 5px;margin-left:6px;font-size:11px;cursor:pointer;line-height:1.4}
 .gear:hover{background:var(--red);color:#fff}
 .chip.on .gear{background:#ffdede;color:var(--red)}
 dialog{border:0;border-radius:14px;padding:0;max-width:560px;width:94vw;box-shadow:0 20px 60px rgba(0,0,0,.25)}
 dialog::backdrop{background:rgba(0,0,0,.35)}
 .dlg-h{background:var(--red);color:#fff;padding:12px 16px;font-weight:700;font-size:14px}
 .dlg-b{padding:16px}
 .dlg-f{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
 .fld{margin-bottom:12px}
 .fld label{display:block;font-size:12px;font-weight:600;margin-bottom:4px}
 .fld input{width:100%;font-family:ui-monospace,Menlo,monospace;font-size:12px}
 .ph{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
 .ph b{font-family:ui-monospace,Menlo,monospace;font-size:11px;background:#f1f5f9;border-radius:5px;padding:2px 6px;cursor:pointer;font-weight:500}
 .ph b.req{background:#fff1f1;color:var(--red);font-weight:700}
 .prev{background:#0b141a;color:#e6edf3;border-radius:10px;padding:12px;font-size:12.5px;white-space:pre-wrap;line-height:1.55;min-height:70px}
 .warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:9px 11px;border-radius:8px;font-size:12px;margin-bottom:12px}
 @media(max-width:640px){th:nth-child(2),td:nth-child(2){display:none}}
</style></head><body>
<header><b>🛠 จัดการสิทธิ์บอท Pacred</b><span>ทะเบียนนี้อยู่ฝั่งบอท — ไม่แตะระบบ Pacred</span></header>
<main>
  <div id="err"></div>

  <div class="card">
    <h2>① ออกรหัสเชิญ</h2>
    <p class="muted">เลือกพนักงาน → กดออกรหัส → ส่งรหัสให้เขาทางไลน์ → เขาแอดบอทแล้วพิมพ์รหัส</p>
    <div class="row">
      <select id="who" style="min-width:260px"></select>
      <button id="btnInvite">ออกรหัสเชิญ</button>
      <button class="ghost" id="btnSync">🔄 ซิงค์กับเว็บ Pacred</button>
    </div>
    <div id="inviteOut" style="margin-top:10px"></div>
  </div>

  <div class="card">
    <h2>② คนที่ผูกไลน์แล้ว <span class="muted" id="cnt"></span></h2>
    <p class="muted">ติ๊กหมวดที่ให้เขาได้รับ — กดแล้วบันทึกทันที · <span style="border-bottom:1px dashed #999">เส้นประ</span> = หมวดที่ควรติ๊กเองเท่านั้น · กด ⚙ หลังชื่อหมวดเพื่อแก้ข้อความที่บอทจะส่ง</p>
    <p class="muted" id="tplWarn"></p>
    <table><thead><tr><th>พนักงาน</th><th>แผนก / ตำแหน่ง</th><th>หมวดแจ้งเตือน</th><th></th></tr></thead>
    <tbody id="rows"><tr><td colspan="4" class="muted">กำลังโหลด…</td></tr></tbody></table>
  </div>
</main>

<dialog id="dlg">
  <div class="dlg-h" id="dlgTitle">⚙ ตั้งค่าหมวด</div>
  <div class="dlg-b">
    <div id="dlgNote" class="muted" style="margin-bottom:12px"></div>
    <div id="dlgErr"></div>
    <div class="fld">
      <label>หัวข้อ</label>
      <input id="tHead" autocomplete="off">
      <div class="ph" id="phHead"></div>
    </div>
    <div class="fld">
      <label>บรรทัดรายการ (ซ้ำตามจำนวนงาน)</label>
      <input id="tLine" autocomplete="off">
      <div class="ph" id="phLine"></div>
    </div>
    <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">ตัวอย่างที่บอทจะส่ง</label>
    <div class="prev" id="tPrev"></div>
  </div>
  <div class="dlg-f">
    <button class="ghost" id="tReset">คืนค่าเดิม</button>
    <button class="ghost" id="tClose">ปิด</button>
    <button id="tSave">บันทึก</button>
  </div>
</dialog>

<script>
const KEY = new URLSearchParams(location.search).get("key") || "";
const api = (p, body) => fetch("/admin/api/" + p + "?key=" + encodeURIComponent(KEY), body
  ? { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body) } : {})
  .then(r => r.json());
let CATS = [], SENS = [], TPL = {}, TPL_READY = false, FIELDS = {}, KIND_OF = {}, CUR = null;
const showErr = (m) => { document.getElementById("err").innerHTML = m ? '<div class="err">'+m+'</div>' : ""; };

async function load() {
  const d = await api("data");
  if (d.error) return showErr(d.error);
  showErr("");
  CATS = d.categories; SENS = d.sensitive;
  TPL = d.templates || {}; TPL_READY = !!d.templatesReady;
  FIELDS = d.fields || {}; KIND_OF = d.kindOf || {}; d0 = d.defaults || {};
  document.getElementById("tplWarn").innerHTML = TPL_READY ? ""
    : '⚠️ แก้ข้อความยังไม่เปิด — รัน <b>notify-schema.sql</b> ที่ Supabase ของบอทก่อน (บอทยังแจ้งเตือนได้ปกติด้วยข้อความตั้งต้น)';

  const sel = document.getElementById("who");
  sel.innerHTML = d.pacred.rows.map(s =>
    '<option value="'+s.login+'" data-name="'+(s.name||"")+'">'+(s.nickname?s.nickname+" · ":"")+s.name+' — '+(s.department||"ยังไม่ผูกแผนก")+'</option>').join("");

  document.getElementById("cnt").textContent =
    "(" + d.linked.filter(x=>x.active).length + " คน" + (d.linked.some(x=>!x.active) ? " · ลาออก/ล็อก " + d.linked.filter(x=>!x.active).length : "") + ")";

  document.getElementById("rows").innerHTML = d.linked.length === 0
    ? '<tr><td colspan="4" class="muted">ยังไม่มีใครผูกไลน์ — ออกรหัสเชิญข้างบนก่อน</td></tr>'
    : d.linked.map(s => {
      /* 🗂 จัดกลุ่มตาม c.group — ภูม: *"เรียงหมวดแจ้งเตือนให้ดูเป็นระเบียบก่อนให้ดูง่ายๆ"*
            ⚙ ขึ้นเฉพาะหมวดที่แก้ข้อความได้ (หมวดที่ยิงเองอย่าง hs_pending/system ไม่มี) */
      const groups = [];
      for (const c of CATS) {
        let g = groups.find(x => x.name === (c.group || "อื่นๆ"));
        if (!g) { g = { name: c.group || "อื่นๆ", items: [] }; groups.push(g); }
        g.items.push(c);
      }
      const chips = groups.map(g =>
        '<div class="grp"><div class="gh">'+g.name+'</div><div class="chips">'+
        g.items.map(c => '<span class="chip'+(s.notify.includes(c.key)?" on":"")+(SENS.includes(c.key)?" sens":"")+
          '" data-u="'+s.line_user_id+'" data-c="'+c.key+'" title="'+c.hint+'">'+c.label+
          (KIND_OF[c.key] ? '<button class="gear" data-gear="'+c.key+'" title="แก้ข้อความที่บอทจะส่ง">⚙</button>' : '')+
          '</span>').join("")+'</div></div>').join("");
      return '<tr class="'+(s.active?"":"off")+'"><td><b>'+(s.nickname||s.name)+'</b><br><span class="muted">'+s.name+'</span><br>'+
        (s.active?'<span class="pill ok">ทำงานอยู่</span>':'<span class="pill no">ลาออก · ล็อก</span>')+
        '</td><td class="muted">'+(s.department||"—")+'<br>'+(s.position||"—")+'</td>'+
        '<td><div class="chips">'+chips+'</div></td>'+
        '<td><button class="ghost" data-unlink="'+s.line_user_id+'">ถอดออก</button></td></tr>';
    }).join("");
}

/* ── ⚙ กล่องแก้ข้อความ ────────────────────────────────────────────── */
const dlg = document.getElementById("dlg");
const $ = (id) => document.getElementById(id);

function renderPrev() {
  const r = fetch("/admin/api/template-preview?key=" + encodeURIComponent(KEY), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: CUR, head: $("tHead").value, line: $("tLine").value }),
  }).then(x => x.json());
  r.then(d => {
    $("dlgErr").innerHTML = d.error ? '<div class="err">'+d.error+'</div>' : "";
    $("tPrev").textContent = d.preview || "";
  });
}

function openGear(key) {
  CUR = key;
  const cat = CATS.find(c => c.key === key) || {};
  const kind = KIND_OF[key];
  const f = (FIELDS[kind] || { head: { all: [], required: [] }, line: { all: [], required: [] } });
  const cur = TPL[key] || {};
  $("dlgTitle").textContent = "⚙ " + cat.label;
  $("dlgNote").innerHTML = (cat.hint || "") +
    (TPL[key] ? '<br><b>แก้ไว้แล้ว</b> — กด "คืนค่าเดิม" เพื่อกลับไปใช้ข้อความตั้งต้น' : "");
  $("tHead").value = cur.head || (d0[key] || {}).head || "";
  $("tLine").value = cur.line || (d0[key] || {}).line || "";
  const chipsOf = (spec, target) =>
    spec.all.map(ph => '<b class="'+(spec.required.includes(ph)?"req":"")+'" data-ins="'+target+'" data-ph="'+ph+'">'+ph+'</b>').join("");
  $("phHead").innerHTML = chipsOf(f.head, "tHead");
  $("phLine").innerHTML = chipsOf(f.line, "tLine") + ' <span class="muted">(แดง = ลบไม่ได้)</span>';
  $("tSave").disabled = !TPL_READY;
  renderPrev();
  dlg.showModal();
}

let d0 = {};   // ข้อความตั้งต้น (จาก /admin/api/data)

$("tHead").addEventListener("input", renderPrev);
$("tLine").addEventListener("input", renderPrev);
$("tClose").onclick = () => dlg.close();
$("tSave").onclick = async () => {
  const r = await api("template", { key: CUR, head: $("tHead").value, line: $("tLine").value });
  if (r.error || r.ok === false) { $("dlgErr").innerHTML = '<div class="err">'+(r.error||r.message)+'</div>'; return; }
  dlg.close(); load();
};
$("tReset").onclick = async () => {
  if (!confirm("คืนข้อความของหมวดนี้เป็นค่าเดิม?")) return;
  const r = await api("template-reset", { key: CUR });
  if (r.error) { $("dlgErr").innerHTML = '<div class="err">'+r.error+'</div>'; return; }
  dlg.close(); load();
};
document.addEventListener("click", (e) => {
  const ins = e.target.dataset && e.target.dataset.ins;
  if (!ins) return;
  const el = $(ins);
  el.value = el.value + e.target.dataset.ph;
  el.focus(); renderPrev();
});

document.addEventListener("click", async (e) => {
  const gear = e.target.closest("[data-gear]");
  if (gear) { e.stopPropagation(); openGear(gear.dataset.gear); return; }

  const chip = e.target.closest(".chip");
  if (chip) {
    const tr = chip.closest("tr");
    const on = [...tr.querySelectorAll(".chip.on")].map(x=>x.dataset.c);
    const c = chip.dataset.c;
    const next = on.includes(c) ? on.filter(x=>x!==c) : on.concat(c);
    chip.classList.toggle("on");
    const r = await api("notify", { lineUserId: chip.dataset.u, categories: next });
    if (r.error) { showErr(r.error); chip.classList.toggle("on"); }
    return;
  }
  const un = e.target.dataset && e.target.dataset.unlink;
  if (un) {
    if (!confirm("ถอดคนนี้ออกจากบอท? (เขาจะใช้บอทไม่ได้จนกว่าจะผูกใหม่)")) return;
    const r = await api("unlink", { lineUserId: un });
    if (r.error) showErr(r.error); else load();
  }
});

document.getElementById("btnInvite").onclick = async () => {
  const sel = document.getElementById("who");
  const opt = sel.selectedOptions[0];
  if (!opt) return;
  const r = await api("invite", { login: opt.value, name: opt.dataset.name });
  if (r.error) return showErr(r.error);
  document.getElementById("inviteOut").innerHTML =
    '<div style="background:#fff1f1;border:1px solid #f3b4b4;border-radius:10px;padding:12px">'+
    'รหัสของ <b>'+opt.dataset.name+'</b><br><span class="code">'+r.code+'</span>'+
    '<div class="muted" style="margin-top:6px">ส่งรหัสนี้ให้เขาทางไลน์ · ใช้ได้ครั้งเดียว · หมดอายุใน 24 ชม.</div></div>';
  load();
};

document.getElementById("btnSync").onclick = async (e) => {
  e.target.disabled = true; e.target.textContent = "กำลังซิงค์…";
  const r = await api("sync", {});
  e.target.disabled = false; e.target.textContent = "🔄 ซิงค์กับเว็บ Pacred";
  if (r.error || r.ok === false) return showErr(r.error || r.message);
  showErr("");
  alert("ซิงค์แล้ว — อัปเดต " + r.updated + " คน · ปิดสิทธิ์คนที่ลาออก " + r.deactivated + " คน");
  load();
};

load();
</script></body></html>`;
}

/**
 * ต่อหน้าจัดการเข้ากับ express app ที่มีอยู่
 * @param {import("express").Express} app
 * @param {ReturnType<typeof import("./staff").createStaffRegistry>} registry
 */
/**
 * @param {import("express").Express} app
 * @param {ReturnType<typeof import("./staff").createStaffRegistry>} registry
 * @param {ReturnType<typeof import("./notify-template-store").createTemplateStore>} [templateStore]
 *        ไม่ส่ง = หน้าจัดการยังใช้ได้ แค่แก้ข้อความไม่ได้ (fail-soft)
 */
function mountStaffAdmin(app, registry, templateStore) {
  const express = require("express");
  const json = express.json();

  function guard(req, res) {
    const k = checkKey(req);
    if (k === "no-key") { res.status(503).json({ error: "ยังไม่ได้ตั้ง ADMIN_KEY ที่ Render — หน้าจัดการถูกปิดไว้" }); return false; }
    if (k === "bad-key") { res.status(401).json({ error: "คีย์ไม่ถูกต้อง" }); return false; }
    return true;
  }

  app.get("/admin", (req, res) => {
    const k = checkKey(req);
    if (k === "no-key") return res.status(503).send("ยังไม่ได้ตั้ง ADMIN_KEY ที่ Render — หน้าจัดการถูกปิดไว้");
    if (k === "bad-key") return res.status(401).send("คีย์ไม่ถูกต้อง — ใส่ ?key=&lt;ADMIN_KEY&gt; ท้าย URL");
    res.type("html").send(page());
  });

  const TPL = require("./notify-template");

  app.get("/admin/api/data", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const [linked, pacred] = await Promise.all([registry.listLinked(), registry.staffFromPacred(false)]);
      /* ✏️ ข้อความที่แก้ไว้ + ของตั้งต้น — อ่านไม่ได้ก็ยังเปิดหน้าได้ (แค่แก้ข้อความไม่ได้) */
      let templates = {}, templatesReady = false;
      if (templateStore) {
        templates = await templateStore.loadAll().catch(() => ({}));
        templatesReady = await templateStore.isReady().catch(() => false);
      }
      res.json({
        linked, pacred,
        categories: registry.CATEGORIES,
        sensitive: [...registry.SENSITIVE],
        templates, templatesReady,
        defaults: TPL.DEFAULTS,
        fields: TPL.FIELDS,
        kindOf: TPL.KIND_OF,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/admin/api/invite", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const { login, name } = req.body || {};
      if (!login) return res.status(400).json({ error: "ไม่ได้เลือกพนักงาน" });
      res.json(await registry.issueInvite(login, name));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/admin/api/notify", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const { lineUserId, categories } = req.body || {};
      if (!lineUserId) return res.status(400).json({ error: "ไม่ได้ระบุคน" });
      res.json({ ok: true, notify: await registry.setNotify(lineUserId, categories) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/admin/api/unlink", json, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const { lineUserId } = req.body || {};
      if (!lineUserId) return res.status(400).json({ error: "ไม่ได้ระบุคน" });
      await registry.unlink(lineUserId);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* 👁 ดูตัวอย่าง — ตรวจด่านด้วย แล้วคืนข้อความที่บอทจะส่งจริง (ไม่เขียนอะไร) */
  app.post("/admin/api/template-preview", json, async (req, res) => {
    if (!guard(req, res)) return;
    const { key, head, line } = req.body || {};
    const v = TPL.validateTemplate(key, head, line);
    if (!v.ok) return res.json({ error: v.message, preview: "" });
    res.json({
      ok: true,
      preview: TPL.renderNotification(key, TPL.sampleRows(key), { head, line }, 3),
    });
  });

  app.post("/admin/api/template", json, async (req, res) => {
    if (!guard(req, res)) return;
    if (!templateStore) return res.json({ ok: false, message: "ยังไม่ได้เปิดการแก้ข้อความ" });
    const { key, head, line } = req.body || {};
    try {
      res.json(await templateStore.save(key, head, line, "admin-page"));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/admin/api/template-reset", json, async (req, res) => {
    if (!guard(req, res)) return;
    if (!templateStore) return res.json({ ok: false, message: "ยังไม่ได้เปิดการแก้ข้อความ" });
    try {
      res.json(await templateStore.reset((req.body || {}).key));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/admin/api/sync", json, async (req, res) => {
    if (!guard(req, res)) return;
    try { res.json(await registry.syncFromPacred()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log(ADMIN_KEY
    ? "🛠 หน้าจัดการสิทธิ์เปิดอยู่ที่ /admin?key=…"
    : "⚠️ ยังไม่ได้ตั้ง ADMIN_KEY — หน้าจัดการสิทธิ์ปิดอยู่");
}

module.exports = { mountStaffAdmin };
