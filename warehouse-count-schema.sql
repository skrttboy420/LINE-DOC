-- ════════════════════════════════════════════════════════════════════
-- 📋 ตรวจนับสต็อกโกดัง — ตารางของบอท  ภูม 2026-11-27
--
-- วิธีใช้: เปิด Supabase **ของบอท** (blhdxmcmepmmdfmqqvdg)
--          → SQL Editor → วางทั้งไฟล์ → Run
--          (รันซ้ำได้ ไม่พัง · ของเดิมไม่หาย)
--
-- ปัญหาจริงที่ทำให้ต้องมีตารางพวกนี้ (วัดฐาน 27/11 · PR179):
--   ระบบ + MOMO ตรงกันว่ามี 387 กล่อง · ยิงรับเข้าโกดังจริง 422 กล่อง
--   แต่ของบนชั้นเหลือ ~160 ⇒ **~227 กล่องออกจากโกดังโดยไม่มีใครบันทึก**
--   ร่องรอยที่ตามได้: ใบมอบงานคนขับ 0 แถว · รูปตอนส่ง 3 จาก 161 แทรค
--   ⇒ ภูม: *"พนักงานมันส่งกันมั่ว … เราเช็คไม่ได้เลยว่าลูกค้ารับของไปจริงๆ"*
--
-- 🔒 **ไม่แตะฐาน Pacred** — ที่นี่เก็บแค่ "รอบนับ" กับ "สิ่งที่ยิงเจอ"
--    ของที่ควรมี (expected) ถ่ายสำเนาไว้ตอนเปิดรอบ เพื่อให้ผลนับย้อนหลังอ่านได้เหมือนเดิม
--    แม้ของในระบบจะเดินหน้าไปแล้ว
-- 🔒 การตรวจนับ **ไม่แก้อะไรในระบบเลย** — เป็นหลักฐานให้คนตัดสินทีหลัง
--
-- 🔒 เปิด RLS แต่ไม่ใส่ policy ⇒ แตะได้เฉพาะ service_role (แบบเดียวกับ wh_placement)
--    เพราะมีรหัสลูกค้า = ไม่ควรให้ anon อ่าน
-- ════════════════════════════════════════════════════════════════════

-- ── ① รอบนับ ────────────────────────────────────────────────────────
create table if not exists public.wh_count_session (
  id          bigserial primary key,
  wh          text        not null default '1',
  -- 'open' = กำลังเดินนับ · 'closed' = ปิดรอบแล้ว (ผลนับแช่แข็ง)
  status      text        not null default 'open',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  started_by  text        not null default 'warehouse',
  finished_by text,
  note        text,
  -- สรุปตอนปิดรอบ (คิดจาก reconcileCount) — เก็บไว้ให้หน้าประวัติโหลดเร็ว
  summary     jsonb
);

create index if not exists wh_count_session_open_idx
  on public.wh_count_session (wh, status, started_at desc);

-- ── ② ของที่ "ควรมี" ตอนเปิดรอบ ────────────────────────────────────
--
-- 🔑 ทำไมต้องถ่ายสำเนา ไม่อ่านสดตอนดูผล: ของในระบบเดินหน้าตลอดเวลา
--    (ยิงรับเพิ่ม · ลูกค้าจ่าย · ส่งออก) ⇒ ถ้าอ่านสด ผลนับเมื่อวานจะเปลี่ยนไปเรื่อยๆ
--    แล้วเอาไปรายงานใครไม่ได้เลย
create table if not exists public.wh_count_expected (
  id          bigserial primary key,
  session_id  bigint      not null references public.wh_count_session(id) on delete cascade,
  tracking    text        not null,
  -- จำนวนกล่องที่ระบบบอกว่ามี (**กล่อง ไม่ใช่แทรค** — 1 แทรคมีได้หลายกล่อง)
  boxes       integer     not null default 1,
  member_code text,
  slot        text,
  status_th   text,
  baht        numeric(14,2)
);

create index if not exists wh_count_expected_sess_idx
  on public.wh_count_expected (session_id);
create index if not exists wh_count_expected_track_idx
  on public.wh_count_expected (session_id, tracking);

-- ── ③ ทุกครั้งที่ยิง ───────────────────────────────────────────────
--
-- 🔑 **1 แถว = 1 กล่องที่เห็นจริง** — ยิงเลขเดิมซ้ำ = อีกกล่องนึง
--    (กล่องทุกใบในชิปเม้นเดียวกันแปะป้ายเลขเดียวกัน ⇒ ต้องยิงทีละใบ)
--    ห้ามใส่ unique บน (session_id, code) เด็ดขาด ไม่งั้นนับได้ใบเดียวต่อแทรค
create table if not exists public.wh_count_scan (
  id         bigserial primary key,
  session_id bigint      not null references public.wh_count_session(id) on delete cascade,
  code       text        not null,
  slot       text,
  scanned_at timestamptz not null default now(),
  scanned_by text        not null default 'warehouse'
);

create index if not exists wh_count_scan_sess_idx
  on public.wh_count_scan (session_id, scanned_at);

-- ── ④ ความปลอดภัย ─────────────────────────────────────────────────
alter table public.wh_count_session  enable row level security;
alter table public.wh_count_expected enable row level security;
alter table public.wh_count_scan     enable row level security;

-- ── ⑤ กันเปิดรอบซ้อน (1 โกดัง เปิดได้ทีละรอบ) ──────────────────────
-- เปิดซ้อน = พนักงาน 2 คนยิงคนละรอบ แล้วผลนับไม่มีความหมายทั้งคู่
create unique index if not exists wh_count_one_open_per_wh
  on public.wh_count_session (wh) where status = 'open';
