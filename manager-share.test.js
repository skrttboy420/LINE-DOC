// ============================================================
// 🧪 ลิงก์ส่งเจ้านาย + หมายเหตุรายข้อ (ภูม 2026-11-21)
//
// รัน:  node manager-share.test.js
//
// เทส 2 ชั้น:
//   ① ตัววาดหน้า (manager-share.js) — สรุปตัวเลข · หมายเหตุขึ้นบนหน้า · กัน HTML แปลกปลอม
//   ② ยกแอป express ขึ้นจริงแล้วยิงเข้าไป (manager-page.js) — ทางเข้า/ทางออกของลิงก์
//      🔑 ชั้นนี้คือตัวกันพลาดที่สำคัญสุด: **หน้าลิงก์ต้องเปิดได้โดยไม่มีคีย์**
//         แต่ **ห้ามเปิดอย่างอื่นได้** และ **ห้ามมีคีย์/โทเคนโผล่ในหน้า**
// ============================================================

const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const KEY = "test-manager-key-0123456789";
process.env.MANAGER_KEY = KEY;
delete process.env.RENDER_EXTERNAL_URL;
delete process.env.SELF_URL;

const { sharePage, shareDeadPage, thaiDay, thaiTime } = require("./manager-share");
const { CHECKLIST, itemState, summarize } = require("./manager-checklist");
const { mountManager } = require("./manager-page");

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

/** เช็คลิสต์ตัวอย่าง: ติ๊ก 8 ข้อ · ชั้นวางไม่ติ๊กแต่มีหมายเหตุ · กล้องยังไม่ได้ตรวจ */
function sampleRow() {
  const checks = {};
  CHECKLIST.forEach((it) => { if (it.k !== "shelf" && it.k !== "cctv") checks[it.k] = true; });
  return {
    day: "2026-11-21",
    checks,
    notes: { shelf: "คนขับรถชนตัวกั้น ชั้นวางบุบ 1 ช่อง แจ้งช่างแล้ว" },
    pallet: "42",
    photos: [IMG, IMG],
    updated_by: "หัวหน้าภูมิ",
    updated_at: "2026-11-21T11:30:00.000Z",
  };
}

/* ── ฐานปลอมในหน่วยความจำ (แถวเดียวต่อวัน เหมือนตารางจริง) ───────── */
function fakeManager() {
  const rows = {};               /* day -> row */
  const tokens = {};             /* token -> day */
  const m = {
    async getChecklist(day) {
      return rows[day] || { day, checks: {}, notes: {}, pallet: "", photos: [], share_token: null };
    },
    async saveChecklist(day, checks, pallet, who, photos, notes) {
      const cur = rows[day] || { day, checks: {}, notes: {}, pallet: "", photos: [], share_token: null };
      rows[day] = Object.assign(cur, {
        checks: checks || {},
        pallet: pallet || "",
        ...(photos === undefined ? {} : { photos: photos || [] }),
        ...(notes === undefined ? {} : { notes: notes || {} }),
        updated_by: who,
        updated_at: new Date().toISOString(),
      });
      return { ok: true };
    },
    async listChecklistDays() { return []; },
    async ensureShareToken(day) {
      const cur = await m.getChecklist(day);
      if (cur.share_token) return { day, token: cur.share_token, created: false };
      return { day, token: await m.rotateShareToken(day).then((r) => r.token), created: true };
    },
    async rotateShareToken(day) {
      const cur = rows[day] || { day, checks: {}, notes: {}, pallet: "", photos: [] };
      if (cur.share_token) delete tokens[cur.share_token];
      const token = "tok" + Math.random().toString(36).slice(2) + "abcdefghij";
      cur.share_token = token; rows[day] = cur; tokens[token] = day;
      return { day, token };
    },
    async getShared(token) {
      const day = tokens[String(token || "")];
      return day ? Object.assign({}, rows[day], { share_token: undefined }) : null;
    },
    async listTeam() { return []; },
    async listTrucks() { return []; },
    async listTasks() { return []; },
  };
  m._rows = rows;
  return m;
}

/** ยกแอปขึ้นบนพอร์ตว่าง — คืน { base, close } */
async function serve(manager) {
  const express = require("express");
  const app = express();
  mountManager(app, manager);
  const srv = await new Promise((res) => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const { port } = srv.address();
  return { base: "http://127.0.0.1:" + port, close: () => new Promise((r) => srv.close(r)) };
}

(async () => {
  console.log("\n🔗 ลิงก์ส่งเจ้านาย + หมายเหตุรายข้อ\n");

  /* ══ ① ตัววาดหน้า ══════════════════════════════════════════════ */

  await ok("ข้อที่ไม่ติ๊กแต่มีหมายเหตุ = ตรวจแล้ว (ไม่ใช่ลืมตรวจ)", () => {
    const r = sampleRow();
    assert.equal(itemState("shelf", r.checks, r.notes), "issue");
    assert.equal(itemState("cctv", r.checks, r.notes), "todo");
    assert.equal(itemState("fire", r.checks, r.notes), "ok");
    const s = summarize(r.checks, r.notes);
    assert.deepEqual(
      { ok: s.ok, issue: s.issue, todo: s.todo, checked: s.checked },
      { ok: 8, issue: 1, todo: 1, checked: 9 },
    );
  });

  await ok("ติ๊กแล้วใส่หมายเหตุด้วยก็ได้ = ยังนับเป็นผ่าน (หมายเหตุประกอบ)", () => {
    assert.equal(itemState("shelf", { shelf: true }, { shelf: "บุบแต่ใช้ได้" }), "ok");
    const s = summarize({ shelf: true }, { shelf: "บุบแต่ใช้ได้" });
    assert.equal(s.ok, 1);
    assert.equal(s.issue, 0);
  });

  await ok("หมายเหตุว่าง/ช่องว่างล้วน = ไม่นับว่ามีปัญหา", () => {
    assert.equal(itemState("shelf", {}, { shelf: "   " }), "todo");
    assert.equal(summarize({}, { shelf: "" }).issue, 0);
  });

  await ok("หน้าลิงก์: ขึ้นข้อความหมายเหตุ + สรุป ผ่าน/มีหมายเหตุ/ยังไม่ตรวจ", () => {
    const h = sharePage(sampleRow());
    assert.ok(h.includes("คนขับรถชนตัวกั้น"), "ไม่มีข้อความหมายเหตุในหน้า");
    assert.ok(h.includes("ผ่าน 8/10"), "สรุปจำนวนผ่านไม่ตรง");
    assert.ok(/มีปัญหา 1 ข้อ/.test(h), "ไม่บอกว่าเจอปัญหากี่ข้อ");
    assert.ok(/ยังไม่ได้ตรวจ 1 ข้อ/.test(h), "ไม่บอกว่ายังไม่ตรวจกี่ข้อ");
    assert.ok(h.includes("42"), "ไม่โชว์จำนวนพาเลท");
  });

  await ok("🔒 หน้าลิงก์: ข้อความจากช่องหมายเหตุถูกแปลงก่อนวาด (ฝัง HTML ไม่ได้)", () => {
    const r = sampleRow();
    r.notes = { shelf: '<img src=x onerror="alert(1)">' };
    r.updated_by = '<script>bad()</script>';
    const h = sharePage(r);
    /* 🪤 ตรวจ "แท็กจริง" ไม่ใช่แค่คำว่า onerror — ตัวอักษรที่ถูกแปลงแล้วยังเป็นข้อความอยู่ในหน้าได้ */
    assert.ok(!/<img[^>]*onerror/i.test(h), "หลุดเป็นแท็ก img ที่ยิงสคริปต์ได้");
    assert.ok(!/<script>bad/.test(h), "หลุดแท็กสคริปต์เข้าไปในหน้า");
    assert.ok(h.includes("&lt;img"), "ควรถูกแปลงเป็นข้อความ");
    assert.ok(h.includes("&lt;script&gt;bad"), "ควรถูกแปลงเป็นข้อความ");
  });

  await ok("หน้าลิงก์: รูปหลักฐานกดดูเต็มจอได้ครบทุกรูป (ภูม: *'กดดูรูปที่แนบได้'*)", () => {
    const h = sharePage(sampleRow());
    assert.equal((h.match(/class="lb"/g) || []).length, 2, "กล่องดูรูปเต็มจอไม่ครบ 2 รูป");
    assert.equal((h.match(/href="#p\d"/g) || []).length, 2, "รูปย่อไม่ได้ลิงก์ไปกล่องเต็มจอ");
  });

  await ok("🔒 หน้าลิงก์: ไม่มีทางเขียนฐาน + ไม่โชว์โทเคน/คีย์ + ห้ามค้นเจอ", () => {
    const h = sharePage(sampleRow());
    assert.ok(!h.includes("/manager/api"), "หน้าอ่านอย่างเดียวต้องไม่มีท่อข้อมูลอยู่ในหน้า");
    assert.ok(!/<form/i.test(h), "ต้องไม่มีฟอร์ม");
    assert.ok(!/x-manager-key|MANAGER_KEY/.test(h), "ต้องไม่มีคีย์หัวหน้าในหน้า");
    assert.ok(/noindex/.test(h), "ต้องห้ามเสิร์ชเอนจินเก็บ");
  });

  await ok("🕒 เวลาบันทึกเป็นเวลาไทย (เซิร์ฟเวอร์รันบน UTC ก็ต้องตรง)", () => {
    assert.equal(thaiTime("2026-11-21T11:30:00.000Z"), "18:30");
    assert.equal(thaiDay("2026-11-21"), "เสาร์ 21 พ.ย. 2569");
    assert.equal(thaiTime(null), "");
  });

  await ok("ลิงก์ที่ใช้ไม่ได้ = บอกเหตุ ไม่ใช่หน้าเปล่า", () => {
    const h = shareDeadPage();
    assert.ok(h.includes("ใช้ไม่ได้แล้ว"));
    assert.ok(/noindex/.test(h));
  });

  /* ══ ② ยกแอปขึ้นจริง ═══════════════════════════════════════════ */

  const mgr = fakeManager();
  const srv = await serve(mgr);
  try {
    await ok("หน้าหัวหน้า: สคริปต์ที่ฝังมาต้องรันได้ และได้เช็คลิสต์ครบ 10 ข้อ", async () => {
      const r = await fetch(srv.base + "/manager", { headers: { "x-manager-key": KEY }, redirect: "manual" });
      /* เข้าด้วยคีย์ = แลกคุกกี้แล้วเด้ง ⇒ ตามไปด้วยคุกกี้ */
      const cookie = String(r.headers.get("set-cookie") || "").split(";")[0];
      assert.ok(cookie, "ไม่ได้คุกกี้ตอนเข้าด้วยคีย์");
      const r2 = await fetch(srv.base + "/manager", { headers: { cookie } });
      assert.equal(r2.status, 200);
      const html = await r2.text();
      const inline = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      assert.ok(inline.length >= 2, "ไม่พบสคริปต์ในหน้า");
      /* รันสคริปต์ที่ฝังเช็คลิสต์มา ในกล่องปลอดภัย แล้วดูว่าได้ของครบ */
      const sandbox = { window: {} };
      vm.createContext(sandbox);
      new vm.Script(inline[0]).runInContext(sandbox);
      assert.ok(sandbox.window.MGR_CHK, "สคริปต์ไม่ได้ยิง window.MGR_CHK ออกมา");
      assert.equal(sandbox.window.MGR_CHK.CHECKLIST.length, CHECKLIST.length);
      assert.equal(sandbox.window.MGR_CHK.itemState("shelf", {}, { shelf: "x" }), "issue");
      /* ทุกสคริปต์ในหน้าต้องแปลผ่าน (กันของที่ฝังมาทำหน้าพังทั้งหน้า) */
      inline.forEach((src, i) => new vm.Script(src, { filename: "inline" + i }));
    });

    await ok("🪤 ข้อความเช็คลิสต์ต้องไม่ถูกก๊อปไว้ใน manager.html (กัน 2 จอพูดไม่เหมือนกัน)", () => {
      const html = fs.readFileSync(path.join(__dirname, "manager.html"), "utf8");
      assert.ok(html.includes("/*__CHK_MODULE__*/"), "ไม่พบเครื่องหมายที่เซิร์ฟเวอร์ใช้ฝังตัวเช็คลิสต์");
      assert.ok(!/\{k:"shelf"/.test(html), "ยังมีรายการเช็คลิสต์เขียนไว้ในหน้าเว็บเอง");
      assert.ok(!/var CHK=\[/.test(html), "ยังมีรายการเช็คลิสต์เขียนไว้ในหน้าเว็บเอง");
    });

    await ok("ออกลิงก์: กดซ้ำได้ใบเดิม (ลิงก์ที่ส่งไปแล้วไม่ตาย)", async () => {
      const h = { "x-manager-key": KEY };
      const a = await (await fetch(srv.base + "/manager/api/share?day=2026-11-21", { headers: h })).json();
      const b = await (await fetch(srv.base + "/manager/api/share?day=2026-11-21", { headers: h })).json();
      assert.ok(a.token && a.token.length >= 16, "โทเคนสั้นเกินไป/ไม่มี");
      assert.equal(a.token, b.token);
      assert.equal(a.path, "/manager/r/" + a.token);
    });

    await ok("🔒 ท่อออกลิงก์ต้องมีคีย์ (ไม่มีคีย์ = 401 · ไม่แจกโทเคน)", async () => {
      const r = await fetch(srv.base + "/manager/api/share?day=2026-11-21");
      assert.equal(r.status, 401);
      const body = await r.text();
      assert.ok(!/tok/.test(body), "หลุดโทเคนออกไปตอนไม่มีคีย์");
    });

    await ok("เจ้านายเปิดลิงก์ได้ **โดยไม่มีคีย์** และเห็นหมายเหตุ+รูป", async () => {
      await mgr.saveChecklist("2026-11-21", sampleRow().checks, "42", "หัวหน้าภูมิ",
        [IMG, IMG], sampleRow().notes);
      const { token } = await (await fetch(srv.base + "/manager/api/share?day=2026-11-21",
        { headers: { "x-manager-key": KEY } })).json();
      const r = await fetch(srv.base + "/manager/r/" + token);     /* ไม่ส่งคีย์ ไม่ส่งคุกกี้ */
      assert.equal(r.status, 200);
      assert.match(String(r.headers.get("x-robots-tag") || ""), /noindex/);
      assert.match(String(r.headers.get("cache-control") || ""), /no-store/);
      const html = await r.text();
      assert.ok(html.includes("คนขับรถชนตัวกั้น"), "เจ้านายไม่เห็นหมายเหตุ");
      assert.ok(html.includes(IMG), "เจ้านายไม่เห็นรูปหลักฐาน");
      assert.ok(!html.includes(KEY), "🔴 คีย์หัวหน้าหลุดไปอยู่ในหน้าที่ส่งต่อกัน");
      assert.ok(!html.includes(token), "โทเคนไม่ควรโชว์ซ้ำในเนื้อหน้า (กันหลุดจากภาพหน้าจอ)");
    });

    await ok("🪤 หมายเหตุที่พิมพ์บนจอ ต้องไปโผล่หน้าเจ้านายจริง (ทั้งเส้น ไม่ใช่แค่ถึงตัวเขียน)", async () => {
      /* เคสจริงที่เจอตอนลองบนจอ: จอขึ้น "บันทึกแล้ว" แต่ท่อข้อมูลลืมส่ง notes ต่อ
         ⇒ หมายเหตุไม่เคยถึงฐาน รีหน้าแล้วหาย · เทสนี้ยิงผ่าน HTTP จริงทั้งเส้น */
      const h = { "content-type": "application/json", "x-manager-key": KEY };
      const r = await fetch(srv.base + "/manager/api/checklist", {
        method: "POST", headers: h,
        body: JSON.stringify({
          day: "2026-11-21", checks: { clean: true }, pallet: "7",
          notes: { fork: "เบรกหลวม ส่งช่างเช็คพรุ่งนี้" },
        }),
      });
      assert.equal(r.status, 200);
      const saved = await mgr.getChecklist("2026-11-21");
      assert.deepEqual(saved.notes, { fork: "เบรกหลวม ส่งช่างเช็คพรุ่งนี้" }, "หมายเหตุไม่ถึงตัวเขียน");
      const { token } = await (await fetch(srv.base + "/manager/api/share?day=2026-11-21",
        { headers: { "x-manager-key": KEY } })).json();
      const html = await (await fetch(srv.base + "/manager/r/" + token)).text();
      assert.ok(html.includes("เบรกหลวม ส่งช่างเช็คพรุ่งนี้"), "เจ้านายไม่เห็นหมายเหตุที่เพิ่งพิมพ์");
      assert.ok(html.includes("<b>7</b>"), "จำนวนพาเลทไม่ถึงหน้าเจ้านาย");
    });

    await ok("🔒 ลิงก์เปิดได้แค่เช็คลิสต์วันนั้น — ไม่มีทีม/รถ/สมุดงานติดไปด้วย", async () => {
      const { token } = await (await fetch(srv.base + "/manager/api/share?day=2026-11-21",
        { headers: { "x-manager-key": KEY } })).json();
      const html = await (await fetch(srv.base + "/manager/r/" + token)).text();
      ["ประเมินทีม", "ใบขับขี่", "สมุดงาน", "คะแนน"].forEach((w) => {
        assert.ok(!html.includes(w), "หน้าลิงก์ไม่ควรมีคำว่า " + w);
      });
    });

    await ok("ออกลิงก์ใหม่ = ลิงก์เดิมใช้ไม่ได้ทันที (ใช้เป็นปุ่มปิดลิงก์)", async () => {
      const h = { "x-manager-key": KEY };
      const oldTok = (await (await fetch(srv.base + "/manager/api/share?day=2026-11-21", { headers: h })).json()).token;
      const r = await fetch(srv.base + "/manager/api/share/new", {
        method: "POST", headers: Object.assign({ "content-type": "application/json" }, h),
        body: JSON.stringify({ day: "2026-11-21" }),
      });
      const fresh = (await r.json()).token;
      assert.notEqual(fresh, oldTok);
      assert.equal((await fetch(srv.base + "/manager/r/" + oldTok)).status, 404);
      assert.equal((await fetch(srv.base + "/manager/r/" + fresh)).status, 200);
    });

    await ok("โทเคนมั่ว/เดาสุ่ม = 404 พร้อมบอกเหตุ (ไม่ใช่หน้าเปล่า)", async () => {
      const r = await fetch(srv.base + "/manager/r/ไม่มีอยู่จริง1234567890");
      assert.equal(r.status, 404);
      assert.ok((await r.text()).includes("ใช้ไม่ได้แล้ว"));
    });

    await ok("🔒 มีลิงก์แล้วก็เปิดหน้าหัวหน้าไม่ได้ (โทเคนไม่ใช่คีย์)", async () => {
      const { token } = await (await fetch(srv.base + "/manager/api/share?day=2026-11-21",
        { headers: { "x-manager-key": KEY } })).json();
      const r = await fetch(srv.base + "/manager?key=" + encodeURIComponent(token), { redirect: "manual" });
      assert.equal(r.status, 401, "โทเคนลิงก์ต้องเปิดหน้าหัวหน้าไม่ได้");
      const r2 = await fetch(srv.base + "/manager/api/team", { headers: { "x-manager-key": token } });
      assert.equal(r2.status, 401, "โทเคนลิงก์ต้องเรียกท่อข้อมูลไม่ได้");
    });
  } finally {
    await srv.close();
  }

  console.log("\n✅ manager-share: " + pass + " pass, " + fail + " fail\n");
  process.exit(fail ? 1 : 0);
})();
