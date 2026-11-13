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
  constraint wh_move_action_rng check (action in ('place','move','remove','load','cage_put','cage_del'))
);

-- 🔄 ของเดิมที่ลงไปแล้วก่อน 2026-11-12 ยังไม่มีชนิด 'load' (เอาขึ้นรถ)
--    2 บรรทัดล่างอัปเดตด่านให้ — รันซ้ำได้ ไม่พัง (drop if exists แล้วค่อย add)
alter table public.wh_move_log drop constraint if exists wh_move_action_rng;
alter table public.wh_move_log
  add constraint wh_move_action_rng check (action in ('place','move','remove','load','cage_put','cage_del'));

comment on table public.wh_move_log is
  'โกดัง 3D: ประวัติวาง/ย้าย/เอาออก ทุกครั้ง (ไล่ย้อนได้ว่าใครทำตอนไหน)';

create index if not exists wh_move_log_tracking_idx on public.wh_move_log (tracking, at desc);
create index if not exists wh_move_log_at_idx       on public.wh_move_log (at desc);

alter table public.wh_move_log enable row level security;

-- ── ③ แยกโกดัง (ภูม 2026-11-13: *"ตอนนี้เรามีมากกว่า 1 โกดังแล้ว"*) ──────
--
-- 🔑 ภูมเคาะ: **รหัสช่องเหมือนกันทั้ง 2 โกดัง** (A0101-L มีทั้ง 2 ที่) แยกด้วยช่อง wh
--    ⇒ ป้ายสติกเกอร์ชุดเดิมเอาไปติดโกดัง 2 ได้เลย ไม่ต้องพิมพ์ใหม่
-- 🔒 แถวเก่าทั้งหมด = โกดัง 1 (ค่าตั้งต้น) ⇒ ของที่วางอยู่ตอนนี้ไม่ขยับไปไหน
alter table public.wh_placement add column if not exists wh text not null default 'WH1';
alter table public.wh_move_log  add column if not exists wh text not null default 'WH1';

alter table public.wh_placement drop constraint if exists wh_placement_wh_rng;
alter table public.wh_placement add constraint wh_placement_wh_rng check (wh in ('WH1','WH2'));
alter table public.wh_move_log  drop constraint if exists wh_move_log_wh_rng;
alter table public.wh_move_log  add constraint wh_move_log_wh_rng  check (wh in ('WH1','WH2'));

-- ค้น "ช่องนี้ของโกดังไหน" เร็ว (จอ 3D ถามทีละโกดัง)
create index if not exists wh_placement_wh_slot_idx on public.wh_placement (wh, slot);

comment on column public.wh_placement.wh is
  'โกดังที่ของอยู่ — WH1 · WH2 (รหัสช่องซ้ำกันได้ระหว่างโกดัง ภูมเคาะ 13/11)';

-- ── ④ กรงเหล็ก (Wire Mesh Cage) — ภูม 2026-11-13 ──────────────────
--
-- ภูม: *"เรามีกรงเหล็กที่ไว้ให้พวกสินค้าชิ้นเล็กๆและพวกสินค้าที่เป็น nocode"*
--      *"กรงมันขนาดเท่า[ช่อง] มันไม่ได้กินทั้งล็อก ซ้ายขวานะ
--        ของในกรงมันก็กล่องนะ แต่กล่องเล็กไง"*
--
-- 🔑 ดังนั้น **กรงไม่ใช่ที่เก็บของอีกชุด** — มันคือ "ช่องนี้มีกรงวางอยู่"
--    ของที่อยู่ในกรง = แถว wh_placement ที่ slot เดียวกันนี่แหละ (ไม่ต้องมีตารางของในกรง)
--    ⇒ ยิงของเข้ากรง = ยิงเข้าช่องตามปกติ · นับจำนวนในกรง = นับแถวในช่อง
create table if not exists public.wh_cage (
  id       text primary key,                        -- '<wh>-<slot>' เช่น WH1-A0101-L (1 ช่อง 1 กรง)
  wh       text not null default 'WH1',
  slot     text not null,                           -- ช่องที่กรงวางอยู่ เช่น A0101-L
  kind     text not null,                           -- small = กรงชิ้นเล็ก · nocode = กรงไม่มีรหัสลูกค้า
  name     text not null,                           -- ชื่อกรงที่พนักงานตั้ง เช่น "กรงชิ้นเล็ก A1"
  note     text,
  made_by  text not null,
  made_at  timestamptz not null default now(),
  constraint wh_cage_kind_rng check (kind in ('small','nocode')),
  constraint wh_cage_wh_rng   check (wh in ('WH1','WH2')),
  constraint wh_cage_slot_fmt check (slot ~ '^[A-Z][0-9]{4}-[LR]$'),
  constraint wh_cage_one_per_slot unique (wh, slot)
);

comment on table public.wh_cage is
  'โกดัง 3D: ช่องไหนมีกรงเหล็กวางอยู่ (ของในกรง = แถว wh_placement ช่องเดียวกัน)';

create index if not exists wh_cage_wh_idx   on public.wh_cage (wh);
create index if not exists wh_cage_name_idx on public.wh_cage (name);

alter table public.wh_cage enable row level security;

-- ── ⑤ เช็คว่าลงครบ ─────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('wh_placement','wh_move_log','wh_cage')) as "ตารางที่ลงแล้ว (ต้องได้ 3)",
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='wh_placement' and column_name='wh')         as "ช่องโกดังใน wh_placement (ต้องได้ 1)",
  (select count(*) from public.wh_placement) as "กล่องที่วางอยู่",
  (select count(*) from public.wh_placement where wh='WH2') as "ของที่อยู่โกดัง 2",
  (select count(*) from public.wh_cage)      as "กรงเหล็ก",
  (select count(*) from public.wh_move_log)  as "ประวัติการย้าย";
