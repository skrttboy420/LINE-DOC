// ============================================================
// 🧪 เดินจริงทั้งเส้น — กดปุ่มในไลน์แล้วบอททำอะไร (ภูม 2026-10-21)
//
// รัน:  node dispatch.test.js
//
// 🔑 ทำไมต้องมีแยกจาก menu.test.js:
//    menu.test.js อ่าน "ซอร์ส" ว่าต่อสายถูกไหม · ตัวนี้ **กดปุ่มจริง** แล้วดูว่าบอทตอบอะไร
//    บทเรียน 2026-10-16: *"เกตเขียว ≠ ปุ่มกดได้"* — ตัวจับคำ/ลำดับ if/สถานะ
//    พลาดได้โดยที่ซอร์สดูถูกทุกบรรทัด
//
// 🚫 ไม่ต่อของจริงเลย — ไลน์ · Supabase · เว็บ Pacred · express ถูกสวมด้วยตัวจำลองทั้งหมด
//    (ดักที่ require ⇒ **ไม่ต้องแก้ index.js แม้แต่บรรทัดเดียว**)
// ============================================================

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

// ── ของที่บอทส่งออกไป (เก็บไว้ตรวจ) ─────────────────────────────────
const sent = { replies: [], pushes: [] };
// ── สถานะคุยค้าง (บอทเก็บใน conversation_state) ──────────────────────
let STATE = null;
// ── แถวทะเบียนที่ผูกไลน์ไว้ ──────────────────────────────────────────
let STAFF = null;
// ── คำถามที่ยิงไปเว็บ Pacred + คำตอบที่ให้กลับ ──────────────────────
const asked = [];
let PACRED = () => ({});

function lastReply() { return sent.replies[sent.replies.length - 1]; }
function replyText() {
  const r = lastReply();
  if (!r) return "";
  const m = Array.isArray(r.messages) ? r.messages[0] : r.messages;
  return m && m.type === "text" ? m.text : "";
}
function replyFlex() {
  const r = lastReply();
  const m = r && (Array.isArray(r.messages) ? r.messages[0] : r.messages);
  return m && m.type === "flex" ? m : null;
}
/** ป้ายบนปุ่มทุกปุ่มในการ์ดที่เพิ่งตอบ */
function flexButtons() {
  const f = replyFlex();
  if (!f) return [];
  return (f.contents.body.contents || [])
    .filter((c) => c.type === "button")
    .map((c) => c.action.label);
}
function quickLabels() {
  const r = lastReply();
  const m = r && (Array.isArray(r.messages) ? r.messages[0] : r.messages);
  return ((m && m.quickReply && m.quickReply.items) || []).map((i) => i.action.label);
}

// ══ ตัวจำลอง (สวมตอน require) ══════════════════════════════════════
let webhookHandler = null;

function fakeExpress() {
  const app = {
    use() { return app; },
    get() { return app; },
    post(route, ...rest) {
      if (route === "/webhook") webhookHandler = rest[rest.length - 1];
      return app;
    },
    listen() { return { close() {} } },   // 🔒 ไม่เปิดพอร์ตจริง
  };
  const ex = () => app;
  ex.json = () => (req, res, next) => next && next();
  ex.urlencoded = () => (req, res, next) => next && next();
  ex.static = () => (req, res, next) => next && next();
  ex.Router = () => app;
  return ex;
}

/** ฐานจำลอง — รองรับเท่าที่ index.js/staff.js ใช้กับตารางที่เส้นนี้แตะ */
function fakeSupabase() {
  return {
    createClient: () => ({
      from(table) {
        const q = {
          _table: table, _filters: {},
          select() { return q; },
          insert() { return Promise.resolve({ error: null }); },
          update() { return q; },
          upsert() { return Promise.resolve({ error: null }); },
          delete() { return q; },
          eq(col, val) { q._filters[col] = val; return q; },
          or() { q._or = true; return q; },
          order() { return q; },
          limit() { return q._result(); },
          gt() { return q; },
          is() { return q; },
          single() { return q._result(true); },
          maybeSingle() { return q._result(true); },
          then(res) { return q._result().then(res); },
          _result(one) {
            if (table === "bot_staff") return Promise.resolve({ data: one ? STAFF : (STAFF ? [STAFF] : []), error: null });
            if (table === "conversation_state") return Promise.resolve({ data: one ? STATE : (STATE ? [STATE] : []), error: null });
            if (table === "hs_codes") return Promise.resolve({ data: [], error: null });
            return Promise.resolve({ data: one ? null : [], error: null });
          },
        };
        return q;
      },
    }),
  };
}

function fakeLine() {
  return {
    middleware: () => (req, res, next) => next && next(),
    Client: class {
      replyMessage(replyToken, messages) { sent.replies.push({ replyToken, messages }); return Promise.resolve({}); }
      pushMessage(to, messages) { sent.pushes.push({ to, messages }); return Promise.resolve({}); }
      getProfile() { return Promise.resolve({ displayName: "ภูมิ" }); }
    },
  };
}

function fakeAxios() {
  const f = (cfg) => {
    const url = String((cfg && cfg.url) || "");
    const q = (cfg && cfg.params) || {};
    if (url.includes("/api/bot")) { asked.push(q); return Promise.resolve({ data: PACRED(q) }); }
    return Promise.resolve({ data: {} });
  };
  f.get = (url, cfg) => f({ url, ...(cfg || {}) });
  f.post = (url, body, cfg) => f({ url, ...(cfg || {}) });
  return f;
}

// ── ดักที่ require ────────────────────────────────────────────────
const STUBS = {
  express: fakeExpress(),
  "@line/bot-sdk": fakeLine(),
  "@supabase/supabase-js": fakeSupabase(),
  axios: fakeAxios(),
  dotenv: { config() {} },
};
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(STUBS, req)) return STUBS[req];
  return realLoad.call(this, req, parent, isMain);
};

// env ที่เส้นนี้ต้องใช้ (ค่าสมมติ — ไม่ใช่ของจริง · ไม่ยิงออกไปไหน)
process.env.CHANNEL_ACCESS_TOKEN = "test-token";
process.env.CHANNEL_SECRET = "test-secret";
process.env.SUPABASE_URL = "http://localhost/test";
process.env.SUPABASE_KEY = "test-key";
process.env.PACRED_API_URL = "http://localhost/pacred";
process.env.PACRED_API_SECRET = "test-pacred";
process.env.RENDER_EXTERNAL_URL = "https://bot.example.test";
process.env.ADMIN_KEY = "test-admin-key-1234567890";
process.env.OWNER_LINE_ID = "Uowner";
delete process.env.GEMINI_API_KEY;        // ไม่เรียก Gemini จริง
delete process.env.NOTIFY_TO;

require(path.join(__dirname, "index.js"));
Module._load = realLoad;
assert.ok(webhookHandler, "ดัก /webhook ไม่ได้ — ตัวจำลอง express ไม่ตรงกับที่ index.js ใช้");

/** กดปุ่ม/พิมพ์ข้อความในแชทส่วนตัว แล้วรอให้บอทตอบ */
async function say(text, userId) {
  sent.replies.length = 0; sent.pushes.length = 0; asked.length = 0;
  const req = { body: { events: [{
    type: "message", message: { type: "text", text }, replyToken: "rt",
    source: { type: "user", userId: userId || "Uowner" },
  }] } };
  await new Promise((done) => webhookHandler(req, { status: () => ({ end: done, json: done, send: done }), sendStatus: done, json: done, send: done, end: done }));
  // เส้นในบอทเป็น async ต่อจาก res — รอให้คิวว่าง
  for (let i = 0; i < 40 && sent.replies.length === 0 && sent.pushes.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

const POOM = {
  line_user_id: "Upoom", login: "admin_poom", code: "PR000", name: "พสิษฐ์", nickname: "ภูมิ",
  department: "ITDT", position: "Front End", roles: ["ops"], active: true, notify: ["momo"],
};

(async () => {
  console.log("\n🧭 เมนู (กดจริง)");

  await ok("พิมพ์ \"เมนู\" → การ์ดมีปุ่มครบทุกหัวข้อ (ไม่ใช่ 2 ปุ่มเหมือนเดิม)", async () => {
    STAFF = POOM; STATE = null;
    await say("เมนู", "Upoom");
    const b = flexButtons();
    for (const want of ["📦 อัพเดตล่าสุด", "🔴 แทรคค้าง", "🧾 งานรอตอบพิกัด", "📊 สรุปงานวันนี้ของฉัน", "🔍 ค้นพิกัดในคลัง", "✨ ให้ Gemini เดาพิกัด"]) {
      assert.ok(b.includes(want), "การ์ดไม่มีปุ่ม " + want + " · มี: " + b.join(" | "));
    }
    assert.equal(quickLabels().length, 6, "ปุ่มลัดต้องมี 6 ปุ่ม · เจอ " + quickLabels().length);
  });

  await ok("⚙️ จัดการสิทธิ์ — พนักงานทั่วไปไม่เห็น · เจ้าของบอทเห็น + ลิงก์ถูก", async () => {
    STAFF = POOM; STATE = null;
    await say("เมนู", "Ustaff");                       // ไม่ใช่เจ้าของบอท
    assert.ok(!flexButtons().some((l) => l.includes("จัดการสิทธิ์")), "พนักงานทั่วไปไม่ควรเห็นปุ่มนี้");

    await say("เมนู", "Uowner");                       // เจ้าของบอท
    assert.ok(flexButtons().some((l) => l.includes("จัดการสิทธิ์")), "เจ้าของบอทต้องเห็นปุ่มนี้");
    const btn = replyFlex().contents.body.contents.find((c) => c.type === "button" && c.action.label.includes("จัดการสิทธิ์"));
    assert.equal(btn.action.type, "uri", "ต้องเป็นปุ่มเปิดลิงก์ (กดแล้วเปิดหน้าได้เลย)");
    assert.ok(btn.action.uri.startsWith("https://bot.example.test/admin?key="), "ลิงก์ผิด: " + btn.action.uri);
  });

  console.log("\n📊 สรุปงานวันนี้ (กดจริง)");

  await ok("กดปุ่ม → ยิงถามเว็บด้วยรหัสล็อกอินของคนที่กด + ตัวเลขขึ้นครบ", async () => {
    STAFF = POOM; STATE = null;
    PACRED = () => ({ ok: true, myDay: {
      day: "2026-10-21", login: "admin_poom", found: true, name: "ภูมิ", active: true,
      intake: { tracks: 11, boxes: 14, weightKg: 161.24, cbm: 0.458, autoTracks: 23 },
      hsAnswered: { orders: 4, hnos: ["P22778", "P22774", "P22776", "P22775"] }, error: null,
    } });
    await say("สรุปงานวันนี้", "Upoom");
    assert.deepEqual(asked.map((a) => a.q), ["my-day"], "ต้องยิง ?q=my-day ครั้งเดียว");
    assert.equal(asked[0].login, "admin_poom", "ต้องส่ง login ของคนที่กด");
    const t = replyText();
    for (const want of ["ภูมิ", "2026-10-21", "11 แทรค", "14 กล่อง", "161.24 กก.", "0.458 คิว", "4 ออเดอร์", "P22778"]) {
      assert.ok(t.includes(want), "ข้อความขาด \"" + want + "\"\n---\n" + t);
    }
    assert.ok(t.includes("ระบบนำเข้าเองอีก 23 แทรค"), "ต้องแยกงานของ cron ออกมาบอก");
  });

  await ok("🔒 พนักงานพิมพ์ชื่อคนอื่นต่อท้าย = ปฏิเสธ (ไม่ยิงถามเว็บเลย)", async () => {
    STAFF = POOM; STATE = null;
    await say("สรุปงานวันนี้ admin_dev", "Upoom");
    assert.equal(asked.length, 0, "ต้องไม่ยิงถามเว็บ — กันดูงานคนอื่น");
    assert.ok(replyText().includes("ดูได้แค่งานของตัวเอง"), "ต้องบอกเหตุผล · ได้: " + replyText());
  });

  await ok("เจ้าของบอทพิมพ์ชื่อคนอื่นได้ (ภูมดูงานทีม)", async () => {
    STAFF = POOM; STATE = null;
    PACRED = () => ({ ok: true, myDay: {
      day: "2026-10-21", login: "admin_bam", found: true, name: "แบม", active: true,
      intake: { tracks: 0, boxes: 0, weightKg: 0, cbm: 0, autoTracks: 0 },
      hsAnswered: { orders: 2, hnos: ["P1", "P2"] }, error: null,
    } });
    await say("สรุปงานวันนี้ admin_bam", "Uowner");
    assert.equal(asked[0] && asked[0].login, "admin_bam", "ต้องถามของคนที่ระบุ");
    assert.ok(replyText().includes("แบม"), "ต้องขึ้นชื่อคนนั้น");
  });

  await ok("ยังไม่ผูกบัญชี = บอกให้ขอรหัสเชิญ (ไม่โชว์ 0 · ไม่ยิงถามเว็บ)", async () => {
    STAFF = null; STATE = null;
    await say("สรุปงานวันนี้", "Uowner");   // เจ้าของบอทที่ไม่เคยผูก
    assert.equal(asked.length, 0, "ไม่รู้ว่าใคร = ต้องไม่ยิงถามเว็บ");
    assert.ok(replyText().includes("ยังไม่รู้ว่าคุณคือใคร"), "ต้องบอกสาเหตุ · ได้: " + replyText());
  });

  console.log("\n✨ Gemini (กดจริง)");

  await ok("กดปุ่ม ✨ Gemini เปล่าๆ → บอทส่งกรอบถามชื่อสินค้า + เข้าโหมดรอ", async () => {
    STAFF = POOM; STATE = null;
    await say("Gemini", "Upoom");
    const f = replyFlex();
    assert.ok(f, "ต้องตอบเป็นการ์ด · ได้ข้อความ: " + replyText());
    assert.ok(f.altText.includes("พิมพ์ชื่อสินค้า"), "การ์ดต้องบอกให้พิมพ์ชื่อสินค้า");
    assert.ok(flexButtons().includes("🔍 ค้นในคลังของเราแทน"), "ควรมีทางเลือกไปค้นคลังเรา");
    assert.ok(flexButtons().includes("ยกเลิก"), "ต้องมีทางออก");
  });

  await ok("กดปุ่ม Gemini แล้วเปลี่ยนใจกด 🔍 ค้นพิกัด → ไม่ไปค้นสินค้าชื่อ \"ค้นพิกัด\"", async () => {
    /* 🔴 ทางตันที่ปิดไปรอบนี้ — เดิมข้อความถัดไปถือเป็นชื่อสินค้าเสมอ */
    STAFF = POOM;
    STATE = { user_id: "Upoom", state: "gemini_wait", data: {} };
    await say("ค้นพิกัด", "Upoom");
    assert.equal(asked.length, 0, "ไม่ควรยิงค้นอะไรเลย — ควรแค่ถามชื่อสินค้าใหม่");
    const alt = (replyFlex() && replyFlex().altText) || replyText();
    assert.ok(!alt.includes("Gemini"), "ไม่ควรยังอยู่ในโหมด Gemini · ได้: " + alt);
  });

  console.log("\n🔍 ค้นพิกัด (กดจริง)");

  await ok("พิมพ์ชื่อสินค้าเฉยๆ → ถามคลัง Pacred และตอบด้วยผลจากคลังนั้น", async () => {
    /* ต้นเหตุที่ภูมบอก "ใช้งานจริงไม่ได้": เดิมพิมพ์เฉยๆ ไปหาคลังเล็กของบอท (ตอบไม่เจอ) */
    STAFF = POOM; STATE = null;
    PACRED = (q) => (q.q === "hs-search" ? { ok: true, hsSearch: {
      query: q.name, total: 25, nearbyNames: ["ปั๊มลม"],
      hits: [{ code: "8414.20.90", nameTh: "ปั๊มลม", nameEn: null, dutyPct: 10, formEPct: 0 }],
    } } : {});
    await say("ปั๊มลม", "Upoom");
    assert.ok(asked.some((a) => a.q === "hs-search" && a.name === "ปั๊มลม"), "ต้องถามคลัง Pacred · ถามไป: " + JSON.stringify(asked));
    const t = replyText();
    assert.ok(t.includes("8414.20.90"), "ต้องตอบพิกัดจากคลัง Pacred · ได้: " + t);
    assert.ok(t.includes("อากร 10%"), "ต้องมีอัตราอากร (คลังบอทไม่มีช่องนี้)");
  });

  await ok("กดปุ่ม 🔍 ค้นพิกัด เปล่าๆ → ถามชื่อก่อน แล้วพิมพ์ตามมาได้", async () => {
    STAFF = POOM; STATE = null;
    await say("ค้นพิกัด", "Upoom");
    assert.equal(asked.length, 0, "ยังไม่มีชื่อ = ยังไม่ต้องค้น");
    assert.ok((replyFlex() || {}).altText || replyText(), "ต้องตอบอะไรกลับ");

    STATE = { user_id: "Upoom", state: "hs_search_wait", data: {} };
    PACRED = (q) => (q.q === "hs-search" ? { ok: true, hsSearch: {
      query: q.name, total: 7, nearbyNames: [],
      hits: [{ code: "6216.00.92", nameTh: "ถุงมือ", nameEn: null, dutyPct: 20, formEPct: 0 }],
    } } : {});
    await say("ถุงมือยาง", "Upoom");
    assert.ok(asked.some((a) => a.q === "hs-search" && a.name === "ถุงมือยาง"), "ต้องค้นชื่อที่พิมพ์ตามมา");
    assert.ok(replyText().includes("6216.00.92"), "ต้องตอบผลค้น · ได้: " + replyText());
  });

  console.log("\n🎟 รหัสเชิญ");

  await ok("🐞 เจ้าของบอทพิมพ์รหัสเชิญ = ต้องเข้าเส้นผูกบัญชี ไม่ใช่ไปค้นพิกัด", async () => {
    /* 🔴 บั๊กที่ภูมเจอ 2026-10-21: *"มันขอรหัสเชิญ แต่พอส่งรหัสเชิญไปให้ มันดันไปหาพิกัดเฉยเลย"*
       เดิมโค้ดรับรหัสซ่อนอยู่ข้างใน `if (!pass.ok)` ของด่านสิทธิ์ · แต่เจ้าของบอทข้ามด่านทั้งก้อน
       ⇒ ไม่มีใครรับรหัส ⇒ ตกไปถึงตัวค้นพิกัด ⇒ เจ้าของบอทผูกบัญชีตัวเองไม่ได้เลย */
    STAFF = null; STATE = null;          // ยังไม่ผูก
    await say("POOM-9717", "Uowner");    // เจ้าของบอท = คนที่ข้ามด่าน
    assert.equal(asked.length, 0, "ต้องไม่ยิงค้นพิกัด · ยิงไป: " + JSON.stringify(asked));
    const t = replyText() || (replyFlex() && replyFlex().altText) || "";
    /* ⚠️ อย่าเช็คแค่คำว่า "พิกัด" — ข้อความของเส้นผูกบัญชีก็มีคำนี้ (บอกทางไปค้นพิกัด)
          ที่ต้องกันจริงคือ **ผลค้นพิกัด** = การ์ด "ไม่พบข้อมูลในฐาน HS CODE" ที่ภูมเจอ */
    assert.ok(!/ไม่พบข้อมูลในฐาน|HS ?CODE/i.test(t), "ต้องไม่ใช่ผลค้นพิกัด · ได้: " + t);
    // ฐานจำลองไม่มีรหัสนี้ ⇒ ต้องตอบจากเส้นผูกบัญชี (พิสูจน์ว่าเดินถึงจริง)
    assert.ok(/ไม่พบรหัสนี้|ผูกบัญชี/.test(t), "ต้องตอบจากเส้นผูกบัญชี · ได้: " + t);
  });

  await ok("พนักงานทั่วไปพิมพ์รหัสเชิญ = เข้าเส้นเดียวกัน (ของเดิมไม่พัง)", async () => {
    STAFF = null; STATE = null;
    await say("BAM-7421", "Ustranger");
    assert.equal(asked.length, 0, "ต้องไม่ยิงค้นพิกัด");
    assert.ok(/รหัส/.test(replyText()), "ต้องตอบเรื่องรหัสเชิญ · ได้: " + replyText());
  });

  await ok("🔒 คนที่ผูกแล้วพิมพ์รหัสเชิญ = ไม่ผูกซ้ำ", async () => {
    STAFF = POOM; STATE = null;
    await say("BAM-7421", "Upoom");
    assert.ok(!/ผูกบัญชีเรียบร้อย/.test(replyText()), "ห้ามผูกทับคนที่ผูกแล้ว · ได้: " + replyText());
  });

  console.log("\n🔁 ของเดิมต้องไม่พัง");

  await ok("📦 อัพล่าสุด · 🔴 แทรคค้าง · 🧾 รอตอบพิกัด ยังยิงถูกท่อเดิม", async () => {
    STAFF = POOM; STATE = null;
    PACRED = (q) => {
      if (q.q === "uploads") return { ok: true, uploads: [], systemImport: [] };
      if (q.q === "pending") return { ok: true, pending: { count: 0 } };
      if (q.q === "hs-pending") return { ok: true, hsPending: { count: 0 } };
      return {};
    };
    for (const [text, want] of [["อัพล่าสุด", "uploads"], ["แทรคค้าง", "pending"], ["รอตอบพิกัด", "hs-pending"]]) {
      await say(text, "Upoom");
      assert.ok(asked.some((a) => a.q === want), 'กด "' + text + '" ต้องยิง ?q=' + want + " · ถามไป: " + JSON.stringify(asked.map((a) => a.q)));
    }
  });

  await ok("🚪 คนที่ยังไม่ผูกบัญชีใช้บอทไม่ได้ (ด่านสิทธิ์ยังอยู่)", async () => {
    STAFF = null; STATE = null;
    await say("เมนู", "Ustranger");
    assert.ok(replyText().includes("ยังไม่ได้ผูกบัญชี"), "ต้องขึ้นข้อความด่านสิทธิ์ · ได้: " + replyText());
    assert.equal(replyFlex(), null, "ไม่ควรได้การ์ดเมนู");
  });

  console.log("\nรวม: " + pass + " ผ่าน" + (fail ? " · " + fail + " ตก" : ""));
  process.exit(fail ? 1 : 0);
})();
