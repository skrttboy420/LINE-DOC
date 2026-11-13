// ============================================================
// 💰 โควตาข้อความ push ของ LINE — กันยิงรัวตอนโควตาหมด (ภูม 2026-11-13)
//
// 🔴 เจอจริง 13/11: แจ้งเตือนเงียบสนิทมาหลายวัน · log เต็มไปด้วย
//    `[notify] ส่งไม่ออก: Request failed with status code 429`
//    ⇒ ถาม LINE ตรงๆ ได้ว่า quota = 300/เดือน · ใช้ไปแล้ว 300 = **หมดเกลี้ยง**
//    (ทักบอทแล้วตอบได้ เพราะ "ตอบกลับ" ไม่กินโควตา · มีแต่ "push" ที่กิน)
//
// ── ทำไมต้องมีตัวนี้ ────────────────────────────────────────────────
//  ① **กันเปลืองเปล่า** — ตอนโควตาหมด บอทยังยิงทุก 5 นาที × ผู้รับ 13 คน
//     = ~3,700 คำขอ/วัน ที่รู้อยู่แล้วว่าจะโดนปฏิเสธ · log ท่วมจนหาของจริงไม่เจอ
//  ② **กันเผาโควตารอบใหม่** — พอขึ้นเดือนใหม่โควตาคืนมา 300
//     ถ้าปล่อยยิงรัวแบบเดิมจะหมดอีกภายใน ~2 ชั่วโมง แล้วเงียบทั้งเดือนเหมือนเดิม
//  ③ **บอกให้รู้ว่าเหลือเท่าไหร่** — ไม่งั้นรู้อีกทีตอนเงียบไปแล้วหลายวัน
//
// 🔒 ไฟล์นี้ไม่ยิง LINE เอง ไม่แตะฐาน — คณิตศาสตร์ + สถานะล้วน (เทสได้เต็ม)
// ============================================================

/** หยุดยิงนานแค่ไหนหลังเจอโควตาหมด แล้วค่อยลองใหม่ที */
const BLOCK_MS = 60 * 60 * 1000;        // 1 ชั่วโมง
/** เหลือน้อยกว่านี้ = เตือน (ยังส่งได้ แต่ควรรีบอัปแพลน) */
const LOW_LEFT = 50;

/** error ก้อนนี้คือ "โควตาหมด / ยิงถี่เกิน" ไหม — axios · line-bot-sdk · fetch เขียนคนละแบบ */
function isQuotaError(err) {
  if (!err) return false;
  const code =
    err.statusCode ??
    (err.response && err.response.status) ??
    err.status ??
    null;
  if (code === 429) return true;
  return /\b429\b/.test(String(err.message || ""));
}

/**
 * ตัวคุมงบข้อความ push
 * @param {() => number} now  นาฬิกา (ฉีดได้เพื่อเทส)
 */
function createLineBudget(now) {
  const clock = typeof now === "function" ? now : () => Date.now();
  let blockedUntil = 0;       // หยุดยิงจนถึงเวลานี้
  let blockedSince = 0;       // เริ่มหยุดเมื่อไหร่
  let skipped = 0;            // ข้ามไปกี่ครั้งระหว่างหยุด
  let lastFailAt = 0;
  let quota = null;           // { limit, used, at }

  /** ตอนนี้ยิงได้ไหม */
  function canPush() {
    return clock() >= blockedUntil;
  }

  /** ยิงไม่ผ่าน — คืน true ถ้าเป็นเพราะโควตา (คนเรียกจะได้ไม่ลองคนถัดไปต่อ) */
  function noteFail(err) {
    if (!isQuotaError(err)) return false;
    const t = clock();
    lastFailAt = t;
    if (t >= blockedUntil) { blockedSince = t; skipped = 0; }  // เริ่มรอบหยุดใหม่
    blockedUntil = t + BLOCK_MS;
    return true;
  }

  /** ยิงผ่าน = โควตากลับมาแล้ว ปลดล็อกทันที */
  function noteOk() {
    blockedUntil = 0;
    blockedSince = 0;
    skipped = 0;
  }

  /** นับว่าข้ามไปอีกรอบ (ไว้บอกว่าเงียบไปแล้วกี่ครั้ง) */
  function noteSkip(n) {
    skipped += Number(n) || 1;
  }

  /** เก็บตัวเลขที่ถาม LINE มา */
  function setQuota(limit, used) {
    const l = Number(limit), u = Number(used);
    quota = {
      limit: Number.isFinite(l) ? l : null,
      used: Number.isFinite(u) ? u : null,
      at: clock(),
    };
  }

  /** เหลือกี่ข้อความ — null = ยังไม่รู้ (ถามไม่ได้/ยังไม่ได้ถาม) */
  function left() {
    if (!quota || quota.limit == null || quota.used == null) return null;
    return Math.max(0, quota.limit - quota.used);
  }

  /** สรุปสถานะเป็นภาษาคน — เอาไปโชว์หน้า /admin หรือ log */
  function status() {
    const n = left();
    const blocked = !canPush();
    return {
      blocked,
      blockedSince: blockedSince || null,
      retryAt: blocked ? blockedUntil : null,
      skipped,
      lastFailAt: lastFailAt || null,
      limit: quota ? quota.limit : null,
      used: quota ? quota.used : null,
      left: n,
      low: n != null && n <= LOW_LEFT,
      text: blocked
        ? "🔴 โควตาข้อความ LINE หมด — หยุดยิงชั่วคราว (ข้ามไปแล้ว " + skipped + " ครั้ง)"
        : n == null
          ? "ยังไม่รู้โควตา"
          : n === 0
            ? "🔴 โควตาหมด (ใช้ " + quota.used + "/" + quota.limit + ")"
            : n <= LOW_LEFT
              ? "⚠️ เหลือ " + n + " ข้อความ (ใช้ " + quota.used + "/" + quota.limit + ")"
              : "✅ เหลือ " + n + " ข้อความ (ใช้ " + quota.used + "/" + quota.limit + ")",
    };
  }

  return { canPush, noteFail, noteOk, noteSkip, setQuota, left, status, isQuotaError };
}

module.exports = { createLineBudget, isQuotaError, BLOCK_MS, LOW_LEFT };
