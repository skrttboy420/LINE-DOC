-- ════════════════════════════════════════════════════════════════════
-- 🏭 โกดัง 3D (Digital Twin) — ตารางของบอท ภูม 2026-11-12
--
-- วิธีใช้: เปิด Supabase **ของบอท** (blhdxmcmepmmdfmqqvdg)
--          → SQL Editor → วางทั้งไฟล์ → Run
--          (รันซ้ำได้ ไม่พัง · ของเดิมไม่หาย)
--
-- 🔒 **ไม่แตะฐานของ Pacred เลย** — ภูม: *"อย่าไปยุ่งกับระบบ pacred นะ"*
--    ตำแหน่งของกล่องเก็บที่นี่ที่เดียว · ข้อมูลงาน/สถานะอ่านสดจากเว็บผ่าน /api/bot
--    ⇒ ถ้าระบบนี้ใช้ได้จริง เดี๋ยวค่อยคุยกันว่าจะย้ายเข้า Pacred ไหม
--
-- 🔑 ตาราง 2 ตัว:
--   wh_placement = กล่อง/แทรคนี้ อยู่ช่องไหน **ตอนนี้** (ของจริงในโกดัง)
--   wh_move_log  = ประวัติทุกครั้งที่ย้าย/เอาออก (ไว้ไล่ว่าใครย้ายตอนไหน)
--
-- 🔒 เปิด RLS แต่ **ไม่ใส่ policy** ⇒ แตะได้เฉพาะ service_role (แบบเดียวกับ bot_staff)
--    เพราะบอทรันบน Render = เซิร์ฟเวอร์ · และตารางนี้มีรหัสลูกค้า = ไม่ควรให้ anon อ่าน
-- ════════════════════════════════════════════════════════════════════

-- ── ① ของอยู่ช่องไหนตอนนี้ ─────────────────────────────────────────
--
-- 1 แถว = 1 แทรค (กล่อง) ที่ถูกวางไว้ในชั้นวาง
-- 🔑 คีย์หลักเป็น "แทรค" ไม่ใช่ "ช่อง" เพราะ 1 ช่องวางได้หลายกล่อง
--    แต่ 1 กล่องอยู่ได้ช่องเดียว ⇒ วางซ้ำ = อัปเดตแถวเดิม (ไม่เกิดผี 2 ที่)
create table if not exists public.wh_placement (
  tracking    text primary key,                      -- เลขแทรค (ตัวเดียวกับที่เว็บ Pacred ใช้)
  slot        text not null,                         -- ช่องวาง เช่น A0101-L
  location    text not null,                         -- โลเคชั่น เช่น A0101 (ไว้ค้น/จัดกอง)
  zone        text not null,                         -- A · B · C
  bay         smallint not null,                     -- ล็อกที่
  lvl         smallint not null,                     -- ชั้นที่
  side        text not null,                         -- L · R
  member_code text,                                  -- รหัสลูกค้า (ถ่ายจากเว็บตอนคีย์ · ไว้โชว์เร็ว)
  boxes       smallint not null default 1,           -- กี่กล่องของแทรคนี้ที่วางช่องนี้
  note        text,
  placed_by   text not null,                         -- ไลน์ไอดี/ชื่อ คนที่คีย์
  placed_at   timestamptz not null default now(),
  constraint wh_placement_slot_fmt  check (slot ~ '^[A-Z][0-9]{4}-[LR]$'),
  constraint wh_placement_lvl_rng   check (lvl between 1 and 4),
  constraint wh_placement_bay_rng   check (bay between 1 and 10),
  constraint wh_placement_zone_rng  check (zone in ('A','B','C')),
  constraint wh_placement_side_rng  check (side in ('L','R')),
  constraint wh_placement_boxes_pos check (boxes >= 1)
);

comment on table public.wh_placement is
  'โกดัง 3D: แทรคนี้อยู่ช่องไหนตอนนี้ (ฐานของบอท — ไม่ใช่ของ Pacred)';

-- ค้นตามช่อง (หน้า 3D ถามทีละช่อง) + ตามโลเคชั่น (ช่องค้นหา)
create index if not exists wh_placement_slot_idx     on public.wh_placement (slot);
create index if not exists wh_placement_location_idx on public.wh_placement (location);
create index if not exists wh_placement_member_idx   on public.wh_placement (member_code);

alter table public.wh_placement enable row level security;

-- ── ② ประวัติการย้าย ───────────────────────────────────────────────
--
-- ภูม: *"พนักงานแม่งเอาของที่ลูกค้ายังไม่ชำระ ไปส่งลูกค้า"*
-- ⇒ ต้องตามได้ว่า "กล่องนี้หายจากช่องไปเมื่อไหร่ ใครเอาออก" ไม่ใช่แค่รู้ว่าหายแล้ว
create table if not exists public.wh_move_log (
  id         bigserial primary key,
  tracking   text not null,
  action     text not null,                          -- place · move · remove
  from_slot  text,                                   -- ว่าง = วางครั้งแรก
  to_slot    text,                                   -- ว่าง = เอาออกจากชั้น
  by_who     text not null,
  note       text,
  at         timestamptz not null default now(),
  constraint wh_move_action_rng check (action in ('place','move','remove'))
);

comment on table public.wh_move_log is
  'โกดัง 3D: ประวัติวาง/ย้าย/เอาออก ทุกครั้ง (ไล่ย้อนได้ว่าใครทำตอนไหน)';

create index if not exists wh_move_log_tracking_idx on public.wh_move_log (tracking, at desc);
create index if not exists wh_move_log_at_idx       on public.wh_move_log (at desc);

alter table public.wh_move_log enable row level security;

-- ── ③ เช็คว่าลงครบ ─────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('wh_placement','wh_move_log')) as "ตารางที่ลงแล้ว (ต้องได้ 2)",
  (select count(*) from public.wh_placement) as "กล่องที่วางอยู่",
  (select count(*) from public.wh_move_log)  as "ประวัติการย้าย";
