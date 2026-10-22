// ============================================================
// 🧪 เทสเมนู + คำสั่งของบอท — ภูม 2026-10-21
//
// รัน:  node menu.test.js
//
// 🔑 ทำไมต้องมี: เมนูของบอทอยู่ 2 ที่ (ปุ่มลัดแถวล่าง + การ์ด "เมนู") เคยเพี้ยนกัน
//    (ปุ่มลัด 5 ปุ่ม · การ์ด 2 ปุ่ม) ⇒ กดเมนูแล้วได้ของน้อยกว่าแถวล่าง
//    ตอนนี้ทั้ง 2 ที่สร้างจาก MENU_ITEMS ตัวเดียว — ยามที่นี่ล็อกไว้ว่าต้องไม่กลับไปเขียนแยก
//
// 🚫 ไม่ต่อไลน์/Supabase/เว็บ Pacred — อ่านซอร์สกับเทียบกติกาเท่านั้น
// ============================================================

const assert = require("node:assert/strict");
const fs = require("node:fs");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name); console.error("    " + (e.message || e)); }
}

// 🔑 index.js เป็น CRLF — ทำให้เป็น LF ก่อนเทียบ ไม่งั้นการตัดก้อนด้วย "\n}\n" พลาดเงียบ
//    (เจอจริง: ยามตัดไม่ได้ ⇒ อ่านทั้งไฟล์ ⇒ แดงใส่โค้ดที่ถูกอยู่แล้ว)
const SRC = fs.readFileSync("index.js", "utf8").split("\r\n").join("\n");

/** ตัดเอาแค่ตัวฟังก์ชันนั้น (จบที่ `}` ชิดซ้ายตัวแรก) */
function fnBody(startMarker) {
  const i = SRC.indexOf(startMarker);
  assert.ok(i >= 0, "หา " + startMarker + " ไม่เจอ");
  const rest = SRC.slice(i);
  const end = rest.indexOf("\n}\n");
  return end > 0 ? rest.slice(0, end) : rest;
}

/** ดึงรายการปุ่มออกมาเป็นข้อมูลจริง (ไม่ต้องโหลด index.js ที่ต่อไลน์)
 *  ภูม 2026-10-22 แยกเป็น 2 ชุด: CORE_MENU (ทุกแผนก) · TOOL_MENU (เจ้าของบอท) */
function readMenuGroup(name) {
  const re = new RegExp("const " + name + " = \\[([\\s\\S]*?)\\n\\];");
  const m = SRC.match(re);
  assert.ok(m, "หา " + name + " ไม่เจอ");
  const PR_RED = "#B30000";
  // eslint-disable-next-line no-new-func
  return new Function("PR_RED", "return [" + m[1] + "];")(PR_RED);
}
function readMenuItems() { return readMenuGroup("CORE_MENU").concat(readMenuGroup("TOOL_MENU")); }

console.log("\n🧭 เมนู");

ok("ปุ่มลัด + การ์ดเมนู สร้างจากรายการเดียว (ห้ามเขียนแยก)", () => {
  assert.match(SRC, /const QUICK = \{ items: CORE_MENU\.map/, "ปุ่มลัดต้องมาจาก CORE_MENU");
  assert.match(SRC, /\.\.\.CORE_MENU\.map\(btn\)/, "การ์ดเมนูต้องมาจาก CORE_MENU");
  assert.match(SRC, /\.\.\.TOOL_MENU\.map\(btn\)/, "เครื่องมือต้องมาจาก TOOL_MENU");
  // ถ้ามีใครกลับไปเขียนปุ่มมือในการ์ด จะโผล่เป็น action ที่ไม่ได้มาจาก m.*
  const card = SRC.slice(SRC.indexOf("function buildMenuFlex"), SRC.indexOf("function staffAdminLink") + 1);
  assert.ok(!/label: "📦/.test(card), "ห้ามเขียน label ปุ่มด้วยมือในการ์ดเมนู");
});

ok("ทุกปุ่มมีครบ 4 ช่อง + label ไม่เกิน 20 ตัวอักษร (เพดานของไลน์)", () => {
  const items = readMenuItems();
  assert.ok(items.length >= 6, "ควรมีอย่างน้อย 6 ปุ่ม · เจอ " + items.length);
  assert.ok(items.length <= 13, "ไลน์รับปุ่มลัดได้ไม่เกิน 13 ปุ่ม · เจอ " + items.length);
  /* 🏢 ภูม 2026-10-22 *"ให้ทุกแผนกมีแค่ แจ้งเตือน กับ สรุปงานวันนี้ไปก่อน"* —
        เมนูที่ทุกคนเห็นต้องเป็น 2 ปุ่มนี้เท่านั้น (เพิ่มปุ่มให้ทุกแผนก = ต้องถามภูมก่อน) */
  const core = readMenuGroup("CORE_MENU");
  assert.equal(core.length, 2, "เมนูหลักต้องมี 2 ปุ่ม · เจอ " + core.length + " = " + core.map((m) => m.text).join(","));
  assert.deepEqual(core.map((m) => m.text), ["แจ้งเตือน", "สรุปงานวันนี้"], "เมนูหลัก = แจ้งเตือน + สรุปงานวันนี้");
  for (const m of items) {
    for (const k of ["label", "menuLabel", "text", "color"]) {
      assert.ok(m[k] && String(m[k]).trim(), "ปุ่ม " + JSON.stringify(m) + " ขาดช่อง " + k);
    }
    // 🔑 ไลน์ตัดทิ้งเงียบๆ ถ้า label ยาวเกิน 20 ⇒ ปุ่มกลายเป็นคำที่อ่านไม่รู้เรื่อง
    assert.ok([...m.label].length <= 20, 'label "' + m.label + '" ยาว ' + [...m.label].length + " ตัว (เกิน 20)");
  }
});

ok("ทุกปุ่มส่งคำที่บอทจับได้จริง (ไม่มีปุ่มกดแล้วเงียบ)", () => {
  /* 🔴 กับดักที่เคยเจอ: เพิ่มปุ่มแล้วลืมเติมคำใน isWorkCommand ⇒ กดแล้วบอทไปเข้าโหมด
        "ค้นพิกัดสินค้า" แล้วตอบว่าไม่เจอสินค้าชื่อนั้น (ดูเหมือนบอทพัง) */
  const items = readMenuItems();
  const reSrc = SRC.match(/function isWorkCommand\(text\) \{[\s\S]*?return (\/.*?\/)\.test\(t\);/);
  assert.ok(reSrc, "หา isWorkCommand ไม่เจอ");
  // eslint-disable-next-line no-new-func
  const re = new Function("return " + reSrc[1])();

  // ปุ่มที่มีตัวจับคำของตัวเองอยู่ก่อน isWorkCommand (ไม่ต้องอยู่ในนั้น)
  const HANDLED_EARLIER = { Gemini: /\^\(gemini\|/ };

  for (const m of items) {
    if (HANDLED_EARLIER[m.text]) {
      assert.match(SRC, /\(gemini\|เจมิไน\|เจมินาย\)/, "ปุ่ม Gemini ต้องมีตัวจับคำของตัวเอง");
      continue;
    }
    assert.ok(re.test(m.text.toLowerCase()), 'กดปุ่ม "' + m.label + '" ส่งคำ "' + m.text + '" แต่ isWorkCommand จับไม่ได้');
  }
});

ok("ทุกปุ่มมีคนรับงานจริงใน handleWorkAssistant", () => {
  const fn = fnBody("async function handleWorkAssistant");
  const CLAIMED = {
    "แจ้งเตือน": /handleNotifyNow\(/,
    "อัพล่าสุด": /pacredGet\("uploads"\)/,
    "แทรคค้าง": /แทรคค้าง\|ยังไม่เข้า/,
    "รอตอบพิกัด": /รอตอบพิกัด\|รอพิกัด/,
    "สรุปงานวันนี้": /handleMyDay\(/,
    "ค้นพิกัด": /handleHsSearch\(/,
  };
  for (const m of readMenuItems()) {
    if (m.text === "Gemini") continue;  // จับก่อนถึง handleWorkAssistant
    const re = CLAIMED[m.text];
    assert.ok(re, 'ปุ่ม "' + m.text + '" ยังไม่มีใครรับงาน — เติมใน handleWorkAssistant + ที่นี่');
    assert.match(fn, re, 'ปุ่ม "' + m.text + '" ไม่มีสายรับงานใน handleWorkAssistant');
  }
});

console.log("\n⚙️ ปุ่มจัดการสิทธิ์");

ok("โชว์เฉพาะเจ้าของบอท + ต้องมี ADMIN_KEY", () => {
  /* 🔒 ลิงก์พากุญแจของหน้าจัดการไปด้วย (ออกรหัสเชิญ/ตัดสิทธิ์คนอื่นได้)
        ⇒ หลุดถึงพนักงานทั่วไป = ยกสิทธิ์ผู้ดูแลให้ทั้งทีม */
  /* 🔑 2026-10-22 การ์ดเมนูถอด `isOwner` ไว้ตัวแปรเดียวตั้งแต่ต้นฟังก์ชัน (ใช้เลือกชุดปุ่มด้วย)
        ⇒ ยามตามไปดูที่ตัวนั้น · ของเดิม `opts && opts.isOwner` ก็ยังผ่าน (รับทั้ง 2 รูป) */
  assert.match(SRC, /const isOwner = !!\(opts && opts\.isOwner\)|if \(opts && opts\.isOwner && adminUrl\)/,
    "ต้องรู้ว่าใครเป็นเจ้าของบอทก่อนโชว์ลิงก์");
  assert.match(SRC, /if \(isOwner && adminUrl\)|if \(opts && opts\.isOwner && adminUrl\)/,
    "ต้องเช็คทั้งเจ้าของบอทและมีลิงก์");
  const link = SRC.slice(SRC.indexOf("function staffAdminLink"), SRC.indexOf("function buildMenuFlex"));
  assert.ok(link.includes("if (!base || !key) return \"\";"), "ไม่มีคีย์/ที่อยู่ = ต้องคืนค่าว่าง (ไม่โชว์ปุ่ม)");
  assert.ok(link.includes("encodeURIComponent(key)"), "คีย์ต้องถูก encode ก่อนต่อใน URL");
  assert.ok(!/ADMIN_KEY\s*=\s*"/.test(SRC), "ห้ามเขียนคีย์ลงโค้ด — ต้องอ่านจาก env เท่านั้น");
});

ok("การ์ดเมนูต้องรู้ว่าใครกด (ไม่งั้นปุ่มนี้ไม่มีวันโผล่)", () => {
  assert.match(SRC, /buildMenuFlex\(\{ isOwner: ctx && ctx\.isOwner \}\)/, "ต้องส่ง isOwner เข้าการ์ด");
  assert.match(SRC, /handleWorkAssistant\(event, keyword, await botCallerContext\(userId\)\)/,
    "ต้องส่งตัวตนคนกดเข้า handleWorkAssistant");
});

console.log("\n📊 สรุปงานวันนี้");

ok("ถามเว็บด้วยรหัสล็อกอินของคนที่ผูกไลน์ไว้", () => {
  assert.match(SRC, /pacredGet\("my-day", \{ login \}\)/, "ต้องยิง ?q=my-day พร้อม login");
  assert.match(SRC, /ctx && ctx\.me && ctx\.me\.login/, "รหัสล็อกอินต้องมาจากทะเบียนที่ผูกไลน์");
});

ok("🔒 คนอื่นดูงานของคนอื่นไม่ได้ — เฉพาะเจ้าของบอท", () => {
  /* งานรายคนเป็นข้อมูลผลงานของพนักงาน ⇒ เปิดให้ใครดูก็ได้ = ข้อมูลภายในหลุด */
  assert.match(SRC, /if \(wanted && isOwner\) login = wanted;/, "เจ้าของบอทระบุคนอื่นได้");
  assert.match(SRC, /else if \(wanted && !isOwner\)/, "คนอื่นระบุชื่อคนอื่น = ต้องปฏิเสธ");
  assert.ok(SRC.includes("ดูได้แค่งานของตัวเองครับ"), "ต้องมีข้อความปฏิเสธที่คนอ่านรู้เรื่อง");
});

ok("ยังไม่ผูกบัญชี = บอกให้ขอรหัสเชิญ (ไม่ใช่โชว์ 0)", () => {
  /* โชว์ 0 = คนคิดว่าตัวเองไม่ได้ทำงาน หรือคิดว่าบอทพัง · ต้องบอกสาเหตุจริง */
  assert.match(SRC, /if \(!login\) \{/, "ต้องเช็คว่ารู้รหัสล็อกอินหรือยัง");
  assert.ok(SRC.includes("ยังไม่รู้ว่าคุณคือใครในระบบ Pacred"), "ต้องบอกว่ายังไม่ผูกบัญชี");
});

ok("แยกงานของคน ออกจากงานของตัวนำเข้าอัตโนมัติ", () => {
  /* 📏 prod 2026-10-21: ประทับทั้งวัน 34 แทรค แต่ภูมกดเอง 11 · ที่เหลือเป็นของ cron
        ⇒ ถ้าไม่บอก คนเอาไปเทียบกับจอ /admin แล้วคิดว่าบอทนับขาด */
  assert.ok(SRC.includes("i.autoTracks"), "ต้องโชว์จำนวนของอัตโนมัติด้วย");
  assert.ok(SRC.includes("ไม่นับเป็นของใคร"), "ต้องบอกชัดว่าไม่ใช่ผลงานคนนี้");
});

console.log("\n✨ Gemini + 🔍 ค้นพิกัด");

ok("กดปุ่ม Gemini = บอทถามชื่อ (ไม่ต้องพิมพ์คำว่า Gemini)", () => {
  /* ภูม: *"ต้องมาพิมพ์ gemini: ตามด้วยชื่อสินค้า … ยุ่งยากเสียเวลา"* */
  assert.match(SRC, /\{ label: "✨ Gemini",\s+menuLabel: [^,]+,\s+text: "Gemini"/,
    'ปุ่มต้องส่งคำว่า "Gemini" เฉยๆ (ไม่มี ":" ต่อท้าย)');
  assert.ok(SRC.includes('setState(userId, "gemini_wait", {})'), "กดเปล่าๆ ต้องเข้าโหมดรอชื่อ");
  assert.ok(SRC.includes("askGeminiName()"), "ต้องมีกรอบถามชื่อสินค้า");
  assert.ok(SRC.includes('state.state === "gemini_wait"'), "ต้องมีสายรับข้อความถัดไปเป็นชื่อสินค้า");
});

ok("พิมพ์ Gemini: <ชื่อ> แบบเดิมยังใช้ได้", () => {
  // คนที่ชินแล้วไม่ต้องเปลี่ยนวิธี — เปลี่ยนกติกาแล้วห้ามทำของเดิมพัง
  const re = SRC.match(/\/\^\(gemini\|เจมิไน\|เจมินาย\)(.*?)\/i\.test\(keyword\)/);
  assert.ok(re, "หาตัวจับคำ Gemini ไม่เจอ");
  // eslint-disable-next-line no-new-func
  const rx = new Function("return /^(gemini|เจมิไน|เจมินาย)" + re[1] + "/i")();
  assert.ok(rx.test("Gemini: ปั๊มลม"), "รูปเดิมต้องยังจับได้");
  assert.ok(rx.test("Gemini ปั๊มลม"), "เว้นวรรคก็ต้องได้");
  assert.ok(rx.test("Gemini"), "กดปุ่มเปล่าๆ ต้องเข้าโหมดถามชื่อ");
  assert.ok(!rx.test("geminiฟันเฟือง"), "คำที่ติดกันไม่ใช่คำสั่ง");
});

ok("🔴 คำใบ้ของ Gemini ต้องมาจากคลังพิกัด Pacred ไม่ใช่คลังเล็กของบอท", () => {
  /* 📏 วัด 2026-10-21: "ถุงมือยาง" คลังบอท 0 รายการ · คลัง Pacred 7
        "ปั๊มลม" คลังบอท 0 · คลัง Pacred 25 ⇒ Gemini เคยเดาโดยไม่มีคำใบ้ทั้งที่ของมีอยู่ */
  const fn = fnBody("async function handleGeminiAnalysis");
  assert.match(fn, /pacredGet\("hs-search"/, "ต้องถามคลัง Pacred");
  assert.ok(!/await searchHS\(/.test(fn), "ห้ามกลับไปใช้คลังของบอทเป็นคำใบ้");
  assert.ok(fn.includes("nearbyNames"), "ต้องเอาชื่อที่ทีมสอนคลังไว้ไปเป็นคำใบ้ด้วย");
});

ok("🔴 พิมพ์ชื่อสินค้าเฉยๆ ต้องได้คำตอบเดียวกับกดปุ่มค้นพิกัด", () => {
  /* ต้นเหตุที่ภูมบอก "ใช้งานจริงไม่ได้" — คำตอบขึ้นกับว่าถามยังไง
        (พิมพ์เฉยๆ = คลังบอท 749 · กดปุ่ม = คลัง Pacred 1,826) */
  const tail = SRC.slice(SRC.indexOf("const isAddCmd"));
  const block = tail.slice(0, tail.indexOf("buildNoResultFlex(keyword, riskInfo)") + 40);
  assert.match(block, /pacredGet\("hs-search"/, "ต้องถามคลัง Pacred ก่อน");
  assert.ok(
    block.indexOf('pacredGet("hs-search"') < block.indexOf("await searchHS(keyword)"),
    "ต้องถามคลัง Pacred **ก่อน** คลังของบอท",
  );
  assert.ok(block.includes("buildHsSearchText(keyword, hs)"), "ต้องตอบด้วยรูปเดียวกับปุ่มค้นพิกัด");
  assert.ok(block.includes("await searchHS(keyword)"), "ไม่เจอในคลัง Pacred ต้องถอยไปคลังบอท (ของที่ทีมเพิ่มเองไม่หาย)");
  assert.match(block, /catch \(err\)/, "เว็บ Pacred ล่มต้องไม่ทำให้ค้นไม่ได้เลย");
});

ok("🔙 กดปุ่มเมนูอื่นระหว่างรอพิมพ์ชื่อ = เปลี่ยนใจ ไม่ใช่ชื่อสินค้า", () => {
  /* เดิม: กด 🔍 ค้นพิกัด → เปลี่ยนใจกด ✨ Gemini ⇒ ไปค้นสินค้าชื่อ "Gemini" (ทางตัน) */
  assert.ok(SRC.includes('const WAIT_STATES = ["hs_search_wait", "gemini_wait"]'), "ต้องรู้ว่าโหมดรอพิมพ์มีอันไหน");
  /* 🔴 ต้องเทียบ **ทั้ง 2 ชุด** — เทียบแค่เมนูหลัก = กดปุ่มเครื่องมือระหว่างรอพิมพ์
        จะถูกอ่านเป็นชื่อสินค้า (ทางตันเดิมกลับมา) */
  assert.match(SRC, /ALL_MENU\.some\(\(m\) => m\.text === keyword\)/, "ต้องเทียบกับปุ่มทั้งหมด (CORE + TOOL)");
  assert.match(SRC, /const ALL_MENU = CORE_MENU\.concat\(TOOL_MENU\)/, "ALL_MENU ต้องรวม 2 ชุด ไม่เขียนรายการซ้ำ");
  assert.ok(
    SRC.indexOf("WAIT_STATES.includes(state.state)") < SRC.indexOf('state.state === "hs_search_wait"'),
    "ต้องล้างสถานะ **ก่อน** สายที่ถือว่าข้อความคือชื่อสินค้า",
  );
  assert.match(SRC, /let state = await getState\(userId\);/, "state ต้องเป็น let (ต้องเขียนทับได้)");
});

console.log("\nรวม: " + pass + " ผ่าน" + (fail ? " · " + fail + " ตก" : ""));
process.exit(fail ? 1 : 0);
