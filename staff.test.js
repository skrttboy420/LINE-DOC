// ============================================================
// 🧪 เทสทะเบียนพนักงาน + ด่านสิทธิ์ — ภูม 2026-10-20
//
// รัน:  node staff.test.js
//
// ใช้ฐานจำลอง (ไม่ต่อ Supabase จริง) + ตัวถามเว็บจำลองที่คืน "รูปเดียวกับของจริง"
// (ก๊อปมาจากผลยิง /api/bot?q=staff บน prod 20/10)
// ============================================================

const assert = require("node:assert/strict");
const { createStaffRegistry } = require("./staff");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}
async function okA(name, fn) {
  try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

// ── ฐานจำลองเล็กๆ ที่รองรับเท่าที่ staff.js ใช้ ─────────────────────
function fakeDb(seed) {
  const T = JSON.parse(JSON.stringify(seed || {}));
  const match = (row, f) => f.every(([col, val]) => row[col] === val);
  function builder(table) {
    const filters = [];
    let op = null, payload = null, nullCol = null, gtCol = null, gtVal = null;
    const self = {
      select() { op = op || "select"; return self; },
      insert(v) { op = "insert"; payload = v; return self; },
      upsert(v) { op = "upsert"; payload = v; return self; },
      update(v) { op = "update"; payload = v; return self; },
      delete() { op = "delete"; return self; },
      eq(c, v) { filters.push([c, v]); return self; },
      is(c) { nullCol = c; return self; },
      gt(c, v) { gtCol = c; gtVal = v; return self; },
      order() { return self; },
      limit() { return self; },
      maybeSingle() { return self.then(undefined, undefined, true); },
      then(res, rej, single) {
        T[table] = T[table] || [];
        let out, error = null;
        if (op === "insert" || op === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const r of rows) {
            const i = T[table].findIndex((x) => x.line_user_id && x.line_user_id === r.line_user_id);
            if (i >= 0 && op === "upsert") T[table][i] = { ...T[table][i], ...r };
            else T[table].push({ ...r });
          }
          out = rows;
        } else if (op === "update") {
          for (const r of T[table]) if (match(r, filters)) Object.assign(r, payload);
          out = [];
        } else if (op === "delete") {
          T[table] = T[table].filter((r) => !match(r, filters));
          out = [];
        } else {
          out = T[table].filter((r) => match(r, filters)
            && (!nullCol || r[nullCol] == null)
            && (!gtCol || String(r[gtCol]) > String(gtVal)));
        }
        const result = single ? { data: out[0] ?? null, error } : { data: out, error };
        return Promise.resolve(result).then(res, rej);
      },
    };
    return self;
  }
  return { from: (t) => builder(t), _tables: T };
}

/** รูปคำตอบจริงของ /api/bot?q=staff (วัด prod 2026-10-20) */
const WEB = {
  staff: {
    total: 3, activeCount: 2, inactiveCount: 1, error: null,
    rows: [
      { login: "admin_aom", code: "AD012", name: "สรวิชญ์ กัวศรีนนท์", nickname: "ออม",
        department: "Accounting", position: "Admin Accounting", roles: ["ultra"], active: true },
      { login: "admin_ben", code: "AD020", name: "admin Ben", nickname: "เบ็น",
        department: "Logistics", position: "Driver", roles: ["driver"], active: true },
      { login: "admin_gring", code: "AD005", name: "อมินตรา ไกรกิตติวุฒิ", nickname: "กริ๊ง",
        department: "Freight Import", position: "Doc Freight Import", roles: [], active: false },
    ],
  },
};
const webOk = async () => JSON.parse(JSON.stringify(WEB));

(async () => {
  console.log("\n🧪 staff.js\n");

  // ── ค่าเริ่มต้น: ตำแหน่งก่อน แล้วถอยไปแผนก (ภูม 2026-10-27) ────────
  {
    const r = createStaffRegistry(fakeDb(), webOk);
    ok("บัญชีได้ชุดเริ่มต้น แต่ไม่ได้หมวดที่เห็นเรื่องเงินอัตโนมัติ", () => {
      const d = r.defaultNotifyFor("Accounting", "Admin Accounting");
      assert.ok(d.includes("acc_slip"), "ควรได้ acc_slip (คิวตรวจสลิป = งานบัญชีเอง)");
      assert.ok(d.includes("acc_wht"), "ควรได้ acc_wht");
      assert.ok(!d.includes("system"), "system = เสียงรบกวนของ ITDT ต้องให้ภูมติ๊กเอง");
    });
    ok("ไม่รู้จักทั้งตำแหน่งและแผนก = ไม่ได้อะไรเลย (ไม่เดามั่ว)", () => {
      assert.deepEqual(r.defaultNotifyFor("ไม่มีแผนกนี้", "ไม่มีตำแหน่งนี้"), []);
      assert.deepEqual(r.defaultNotifyFor(null, null), []);
    });
    ok("คนขับไม่ได้หมวดที่เห็นต้นทุน/ระบบ", () => {
      const d = r.defaultNotifyFor("Logistics", "Driver");
      for (const k of ["system"]) {
        assert.ok(!d.includes(k), k + " ต้องไม่อยู่ในชุดเริ่มต้นของคนขับ");
      }
    });

    /* 🔑 เหตุผลที่เปลี่ยนมาใช้ตำแหน่ง — แผนกเดียวกันหน้าที่คนละเรื่อง
       📏 ผังจริง prod 27/10: Operations 9 คน = CS 1 · Pricing 2 · Purchasing 1 · Sales 4 */
    ok("👤 Operations แยกตามตำแหน่ง — ไม่ใช่ได้เหมือนกันหมดทั้งแผนก", () => {
      const cs   = r.defaultNotifyFor("Operations", "Customer Service");
      const sale = r.defaultNotifyFor("Operations", "Sales");
      const buy  = r.defaultNotifyFor("Operations", "Purchasing");
      const price= r.defaultNotifyFor("Operations", "Pricing");
      assert.ok(cs.includes("shop_ship"), "CS = แจ้งลูกค้าว่าร้านจีนส่งแล้ว");
      assert.ok(!sale.includes("shop_pay"), "เซลไม่ต้องได้คิวเก็บเงินของ CS");
      assert.deepEqual(buy, ["shop_pay"], "จัดซื้อได้คิวออเดอร์รอสั่งซื้ออย่างเดียว");
      assert.deepEqual(price, [], "ตั้งราคายังไม่มีหมวดของตัวเอง — ต้องไม่แจกของคนอื่นให้");
      assert.notDeepEqual(cs, sale, "CS กับเซลต้องไม่ได้ชุดเดียวกัน");
    });

    ok("🚚 Logistics แยกโกดัง/คนขับ", () => {
      assert.ok(r.defaultNotifyFor("Logistics", "Warehouse").includes("acc_cnt"), "โกดังควรรู้ว่าตู้ไหนยิงครบ");
      assert.deepEqual(r.defaultNotifyFor("Logistics", "Driver"), [], "คนขับยังไม่มีหมวดของตัวเองในบอท");
    });

    ok("🪜 ตำแหน่งที่ยังไม่อยู่ในตาราง = ถอยไปใช้ของแผนก (คนใหม่ไม่เงียบ)", () => {
      const d = r.defaultNotifyFor("Accounting", "ตำแหน่งใหม่ที่เพิ่งตั้ง");
      assert.ok(d.includes("acc_slip"), "ต้องได้ชุดของแผนกบัญชี");
    });

    ok("ตำแหน่งที่ตั้งใจให้ว่างต้องชนะแผนก (ไม่ตกไปรับของแผนกแทน)", () => {
      assert.deepEqual(
        r.defaultNotifyFor("Customs Specialist", "CEO"), [],
        "CEO ตั้งใจให้ว่าง — ห้ามถอยไปหยิบชุดของแผนกมาให้",
      );
    });
  }

  // ── รหัสเชิญ ──────────────────────────────────────────────────────
  {
    const db = fakeDb({ bot_invite: [], bot_staff: [] });
    const r = createStaffRegistry(db, webOk);

    await okA("ออกรหัสได้ · รูปตรง · หัวรหัสบอกว่าของใคร", async () => {
      const inv = await r.issueInvite("admin_aom", "ออม");
      assert.match(inv.code, r.INVITE_RE, "รูปรหัสต้องเป็น ABC-1234");
      assert.ok(inv.code.startsWith("AOM-"), "หัวรหัสควรมาจากชื่อล็อกอิน (ได้ " + inv.code + ")");
      assert.ok(new Date(inv.expiresAt).getTime() > Date.now(), "ต้องมีวันหมดอายุในอนาคต");
    });

    await okA("พิมพ์รหัสแล้วผูกได้ · ได้ชุดเริ่มต้นตามแผนก", async () => {
      const code = db._tables.bot_invite[0].code;
      const res = await r.redeemInvite("U_AOM", code);
      assert.ok(res.ok, "ควรผูกสำเร็จ (ได้: " + res.message + ")");
      assert.equal(res.staff.login, "admin_aom");
      assert.equal(res.staff.department, "Accounting");
      assert.ok(res.staff.notify.includes("acc_slip"), "ควรได้ชุดเริ่มต้นของ Accounting");
    });

    await okA("🔒 รหัสเดิมใช้ซ้ำไม่ได้", async () => {
      const code = db._tables.bot_invite[0].code;
      const res = await r.redeemInvite("U_OTHER", code);
      assert.equal(res.ok, false);
      assert.match(res.message, /ถูกใช้ไปแล้ว/);
    });

    await okA("🔒 รหัสหมดอายุใช้ไม่ได้", async () => {
      db._tables.bot_invite.push({
        code: "OLD-1111", login: "admin_ben",
        expires_at: new Date(Date.now() - 1000).toISOString(), used_at: null,
      });
      const res = await r.redeemInvite("U_BEN", "OLD-1111");
      assert.equal(res.ok, false);
      assert.match(res.message, /หมดอายุ/);
    });

    await okA("🔒 รหัสของคนที่ลาออกแล้ว ผูกไม่ได้", async () => {
      db._tables.bot_invite.push({
        code: "GRI-2222", login: "admin_gring",
        expires_at: new Date(Date.now() + 3600_000).toISOString(), used_at: null,
      });
      const res = await r.redeemInvite("U_GRING", "GRI-2222");
      assert.equal(res.ok, false);
      assert.match(res.message, /ลาออก|ปิดอยู่/);
    });

    await okA("🔒 รูปรหัสมั่วถูกปฏิเสธก่อนแตะฐาน", async () => {
      const res = await r.redeemInvite("U_X", "สวัสดีครับ");
      assert.equal(res.ok, false);
      assert.match(res.message, /รูปรหัสไม่ถูก/);
    });
  }

  // ── ด่านสิทธิ์ ────────────────────────────────────────────────────
  {
    const db = fakeDb({ bot_staff: [
      { line_user_id: "U_OK",   login: "admin_aom", name: "ออม", active: true,  notify: ["hs_pending"] },
      { line_user_id: "U_OUT",  login: "admin_gring", name: "กริ๊ง", active: false, notify: ["hs_pending"] },
    ] });
    const r = createStaffRegistry(db, webOk);

    await okA("คนที่ผูกแล้วและยังทำงานอยู่ = ผ่าน", async () => {
      const g = await r.gate("U_OK");
      assert.equal(g.ok, true);
      assert.equal(g.staff.name, "ออม");
    });
    await okA("🔒 คนที่ลาออกแล้ว = ไม่ผ่าน + บอกเหตุผล resigned", async () => {
      const g = await r.gate("U_OUT");
      assert.equal(g.ok, false);
      assert.equal(g.reason, "resigned");
    });
    await okA("🔒 คนที่ยังไม่ผูก = ไม่ผ่าน + เหตุผล not_linked", async () => {
      const g = await r.gate("U_STRANGER");
      assert.equal(g.ok, false);
      assert.equal(g.reason, "not_linked");
    });

    await okA("📬 ผู้รับแจ้งเตือน = เฉพาะคนที่ติ๊กหมวดนั้น และยังทำงานอยู่", async () => {
      const got = await r.recipientsFor("hs_pending");
      assert.deepEqual(got.map((x) => x.lineUserId), ["U_OK"], "คนที่ลาออกต้องไม่อยู่ในรายชื่อ");
      assert.deepEqual(await r.recipientsFor("acc_slip"), [], "ไม่มีใครติ๊ก = ไม่ส่งใคร");
    });
  }

  // ── ซิงค์กับเว็บ ──────────────────────────────────────────────────
  {
    const seed = () => ({ bot_staff: [
      { line_user_id: "U_AOM",   login: "admin_aom",   name: "เก่า", department: "เก่า", position: "เก่า", active: true, notify: ["arrive_th"] },
      { line_user_id: "U_GRING", login: "admin_gring", name: "กริ๊ง", department: "Freight Import", position: "Doc", active: true, notify: ["arrive_th"] },
      { line_user_id: "U_GHOST", login: "admin_ghost", name: "ผี",   department: null, position: null, active: true, notify: [] },
    ] });

    await okA("🔄 ซิงค์แล้วปิดสิทธิ์คนที่ลาออก + อัปเดตแผนก/ชื่อ", async () => {
      const db = fakeDb(seed());
      const r = createStaffRegistry(db, webOk);
      const out = await r.syncFromPacred();
      assert.equal(out.ok, true);
      const rows = db._tables.bot_staff;
      const aom = rows.find((x) => x.login === "admin_aom");
      assert.equal(aom.department, "Accounting", "ต้องอัปเดตแผนกตามเว็บ");
      assert.equal(aom.active, true);
      const gring = rows.find((x) => x.login === "admin_gring");
      assert.equal(gring.active, false, "คนที่เว็บบอกว่าลาออก ต้องถูกปิดสิทธิ์");
      assert.equal(out.deactivated, 1);
      const ghost = rows.find((x) => x.login === "admin_ghost");
      assert.equal(ghost.active, false, "คนที่หายจากทะเบียนเว็บ = ปิดไว้ก่อน (ไม่ลบ)");
      assert.ok(rows.some((x) => x.login === "admin_ghost"), "🔒 ห้ามลบแถว — ประวัติต้องไม่หาย");
    });

    await okA("🔴 เว็บตอบไม่ได้ = ไม่แตะทะเบียนเลย (เน็ตล่มต้องไม่ตัดสิทธิ์ทั้งบริษัท)", async () => {
      const db = fakeDb(seed());
      const r = createStaffRegistry(db, async () => { throw new Error("ECONNRESET"); });
      const out = await r.syncFromPacred();
      assert.equal(out.ok, false);
      assert.ok(db._tables.bot_staff.every((x) => x.active === true), "ทุกคนต้องยัง active เหมือนเดิม");
    });

    await okA("🔴 เว็บตอบทะเบียนว่าง = ไม่แตะทะเบียนเลย", async () => {
      const db = fakeDb(seed());
      const r = createStaffRegistry(db, async () => ({ staff: { rows: [] } }));
      const out = await r.syncFromPacred();
      assert.equal(out.ok, false);
      assert.match(out.message, /ว่าง/);
      assert.ok(db._tables.bot_staff.every((x) => x.active === true));
    });
  }

  // ── ติ๊กหมวด ──────────────────────────────────────────────────────
  {
    const db = fakeDb({ bot_staff: [{ line_user_id: "U1", login: "a", name: "A", active: true, notify: [] }] });
    const r = createStaffRegistry(db, webOk);
    await okA("ติ๊กหมวดได้ และหมวดมั่วถูกตัดทิ้ง", async () => {
      const saved = await r.setNotify("U1", ["hs_pending", "ของปลอม", "acc_slip", "forwarder"]);
      // "forwarder" = หมวดเก่าที่เลิกใช้แล้ว ⇒ ต้องถูกตัดเหมือนหมวดมั่ว (ของที่ติ๊กไว้เดิมไม่ค้าง)
      assert.deepEqual(saved, ["hs_pending", "acc_slip"], "ต้องเก็บเฉพาะหมวดที่มีจริง");
      assert.deepEqual(db._tables.bot_staff[0].notify, ["hs_pending", "acc_slip"]);
    });
  }

  console.log("\nรวม: " + pass + " ผ่าน" + (fail ? " · " + fail + " ตก" : ""));
  process.exit(fail ? 1 : 0);
})();
