// ยามทางเข้าศูนย์จัดการโกดัง — คีย์ต้องไม่ค้างใน URL / ไม่หลุดลงคุกกี้ / ไม่หลุดลงหน้าเว็บ
const assert = require("node:assert/strict");

let pass = 0, fail = 0;
function it(name, fn) {
  try { fn(); pass += 1; console.log("  ✓ " + name); }
  catch (e) { fail += 1; console.error("  ✗ " + name + "\n    " + (e && e.message)); }
}

const KEY = "คีย์ทดสอบ-abc123";
function useKey(k) {
  if (k) process.env.MANAGER_KEY = k; else delete process.env.MANAGER_KEY;
  delete process.env.ADMIN_KEY;
  delete require.cache[require.resolve("./manager-auth")];
  return require("./manager-auth");
}
/** คำขอปลอม */
function req({ key = "", cookie = "", header = "" } = {}) {
  return {
    query: key ? { key } : {},
    body: {},
    headers: cookie ? { cookie } : {},
    get: (n) => (String(n).toLowerCase() === "x-manager-key" ? header : ""),
  };
}
function res() {
  const out = { headers: {} };
  out.setHeader = (n, v) => { out.headers[n] = v; };
  return out;
}

console.log("manager-auth — ทางเข้า (ภูม 2026-11-20 รอบ 2)");

it("ยังไม่ตั้งคีย์ที่ Render = ปิดหน้า (fail-closed)", () => {
  const a = useKey("");
  assert.equal(a.checkKey(req()), "no-key");
  assert.equal(a.activeKey(), "");
});

it("ไม่มีทั้งคีย์และคุกกี้ = เข้าไม่ได้", () => {
  const a = useKey(KEY);
  assert.equal(a.checkKey(req()), "bad-key");
});

it("คีย์ผิด = เข้าไม่ได้", () => {
  const a = useKey(KEY);
  assert.equal(a.checkKey(req({ key: KEY + "x" })), "bad-key");
  assert.equal(a.checkKey(req({ key: KEY.slice(0, -1) })), "bad-key");
});

it("🔑 เข้าด้วย ?key= ถูก = ผ่าน และต้องรู้ว่า 'มากับคีย์' (เพื่อเด้งไป URL สะอาด)", () => {
  const a = useKey(KEY);
  assert.equal(a.checkKey(req({ key: KEY })), "ok");
  assert.equal(a.cameWithKey(req({ key: KEY })), true, "ต้องเด้งไปล้างคีย์ออกจาก URL");
});

it("🔴 คุกกี้ต้องไม่ใช่ตัวคีย์ (คีย์หลุดไปอยู่ในคุกกี้ = เท่ากับไม่ได้แก้)", () => {
  const a = useKey(KEY);
  const r = res();
  a.setSession(r);
  const sc = String(r.headers["Set-Cookie"] || "");
  assert.ok(sc, "ต้องตั้งคุกกี้");
  assert.ok(!sc.includes(KEY), "ห้ามมีตัวคีย์อยู่ในคุกกี้");
});

it("มีคุกกี้ที่ถูก = ผ่าน และ 'ไม่ได้มากับคีย์' (ไม่เด้งวนซ้ำ)", () => {
  const a = useKey(KEY);
  const r = res();
  a.setSession(r);
  const cookie = String(r.headers["Set-Cookie"]).split(";")[0];
  assert.equal(a.checkKey(req({ cookie })), "ok");
  assert.equal(a.cameWithKey(req({ cookie })), false, "มีคุกกี้แล้วต้องไม่เด้งซ้ำ");
});

it("คุกกี้มั่ว = เข้าไม่ได้", () => {
  const a = useKey(KEY);
  assert.equal(a.checkKey(req({ cookie: a.COOKIE + "=ปลอม" })), "bad-key");
});

it("🔑 เปลี่ยนคีย์ที่ Render = คุกกี้เก่าใช้ไม่ได้ทันที (ไม่ต้องมีปุ่มออกจากระบบ)", () => {
  const a1 = useKey(KEY);
  const r = res();
  a1.setSession(r);
  const old = String(r.headers["Set-Cookie"]).split(";")[0];
  const a2 = useKey("คีย์ใหม่-xyz789");
  assert.equal(a2.checkKey(req({ cookie: old })), "bad-key");
});

it("คุกกี้ต้อง HttpOnly + SameSite (สคริปต์ในหน้าอ่านไม่ได้ · เว็บอื่นยิงมาไม่ติด)", () => {
  const a = useKey(KEY);
  const r = res();
  a.setSession(r);
  const sc = String(r.headers["Set-Cookie"]);
  assert.ok(sc.includes("HttpOnly"), "ต้องมี HttpOnly");
  assert.ok(sc.includes("SameSite=Lax"), "ต้องมี SameSite");
  assert.ok(sc.includes("Path=/"), "ต้องมี Path");
});

it("🔴 หน้ากรอกคีย์ต้องไม่มีคีย์อยู่ในหน้า + ห้ามให้ค้นเจอ", () => {
  const a = useKey(KEY);
  for (const wrong of [true, false]) {
    const html = a.signInPage(wrong);
    assert.ok(!html.includes(KEY), "ห้ามพิมพ์คีย์ลงหน้าเว็บ");
    assert.ok(html.includes("noindex"), "ห้ามให้ Google เก็บหน้านี้");
    assert.ok(html.includes("method='post'") || html.includes('method="post"'), "ต้องส่งแบบ POST");
  }
  assert.ok(a.signInPage(true).includes("คีย์ไม่ถูกต้อง"), "ใส่ผิดต้องบอก");
  assert.ok(!a.signInPage(false).includes("คีย์ไม่ถูกต้อง"), "เข้าครั้งแรกไม่ใช่หน้า error");
});

it("หัวคำขอ x-manager-key ยังใช้ได้ (ไว้เรียกจากสคริปต์)", () => {
  const a = useKey(KEY);
  assert.equal(a.checkKey(req({ header: KEY })), "ok");
});

console.log("\n" + (fail ? "❌" : "✅") + " manager-auth: " + pass + " pass, " + fail + " fail");
if (fail) process.exit(1);
