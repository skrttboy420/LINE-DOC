-- ════════════════════════════════════════════════════════════════════
-- 🚚 Delivery Planner — ระบบวางแผนจัดส่ง (ภูม 2026-11-22)
--
-- วิธีใช้: เปิด Supabase **ของบอท** (blhdxmcmepmmdfmqqvdg)
--          → SQL Editor → วางทั้งไฟล์ → Run  (รันซ้ำได้ ไม่พัง · ของเดิมไม่หาย)
--
-- 🔒 **แค่ "วางแผน" เท่านั้น — ไม่ใช่สั่งงานจริง**
--    มอบหมายงานคนขับจริง / ปิดงาน / อัปสถานะส่ง / แนบรูปหลักฐาน = ทำใน pacred เท่านั้น
--    ที่นี่เก็บแค่ "แผนที่ภูมจัดไว้" (งานไหน-รถคันไหน-ลำดับไหน) ในฐานของบอท ไม่เขียนกลับ pacred
--
-- 🔗 ออกแบบให้ล้อตามของจริงใน pacred (ยก port ง่าย):
--    dp_trip  ≈ tb_forwarder_driver        (1 เที่ยว/รอบส่ง)
--    dp_stop  ≈ tb_forwarder_driver_item   (1 จุดส่ง · เรียงด้วย seq)
--    ประเภทรถ = รถกระบะ · 6 ล้อเล็ก · 6 ล้อใหญ่ (ตรงกับ hr.driver_vehicle_types)
--    พิกัด = จากหมุด PR ของภูม (pacred ยังไม่ส่งพิกัดมาในท่อ bot)
--
-- 🔒 เปิด RLS ไม่ใส่ policy ⇒ แตะได้เฉพาะ service_role (แบบเดียวกับ wh_placement/mgr_*)
-- ════════════════════════════════════════════════════════════════════

-- ── ① ตั้งค่า (จุดโกดัง PACRED ฯลฯ) ───────────────────────────────────
-- key 'warehouse_origin' → { "lat":..., "lng":..., "label":"โกดัง PACRED" }
create table if not exists public.dp_setting (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
comment on table public.dp_setting is 'Delivery Planner: ค่าตั้งต้น เช่น จุดโกดัง PACRED (ของบอท)';
alter table public.dp_setting enable row level security;

-- ── ② รถ (mirror ประเภท+ความจุของ pacred) ────────────────────────────
create table if not exists public.dp_truck (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                         -- ชื่อ/ทะเบียนที่เรียกเอง เช่น "กระบะ 1"
  vehicle_type text not null default 'รถกระบะ',       -- รถกระบะ · 6 ล้อเล็ก · 6 ล้อใหญ่ · อื่นๆ
  cap_kg       numeric(10,2),                         -- ความจุน้ำหนัก (กก.)
  cap_cbm      numeric(10,3),                         -- ความจุปริมาตร (คิว)
  driver_name  text default '',                       -- ชื่อคนขับ (พิมพ์เอง · คนขับจริงอยู่ใน pacred)
  driver_code  text default '',                       -- รหัสคนขับ AD### ถ้ามี
  plate        text default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint dp_truck_type_rng check (vehicle_type in ('รถกระบะ','6 ล้อเล็ก','6 ล้อใหญ่','อื่นๆ'))
);
comment on table public.dp_truck is 'Delivery Planner: รถที่ใช้วางแผน (ความจุตามสูตร pacred)';
alter table public.dp_truck enable row level security;

-- ── ③ เที่ยวส่ง (≈ tb_forwarder_driver) ───────────────────────────────
create table if not exists public.dp_trip (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'เที่ยวใหม่',
  plan_date  date,                                    -- วางแผนสำหรับวันไหน
  truck_id   uuid references public.dp_truck(id) on delete set null,
  status     text not null default 'draft',           -- draft (ร่าง) · planned (วางเสร็จ พร้อมไปสั่งใน pacred)
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dp_trip_status_rng check (status in ('draft','planned'))
);
comment on table public.dp_trip is 'Delivery Planner: 1 เที่ยวส่ง (แผน) ≈ tb_forwarder_driver — ไม่ใช่งานจริงใน pacred';
create index if not exists dp_trip_date_idx on public.dp_trip (plan_date desc, created_at desc);
alter table public.dp_trip enable row level security;

-- ── ④ จุดส่งในเที่ยว (≈ tb_forwarder_driver_item) ─────────────────────
-- 1 แถว = 1 งาน/Tracking ที่ใส่เข้าเที่ยว · seq = ลำดับเส้นทาง
create table if not exists public.dp_stop (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.dp_trip(id) on delete cascade,
  seq        integer not null default 0,              -- ลำดับหยุด (0,1,2… จากโกดัง)
  pr         text,                                    -- รหัสลูกค้า PR (จับคู่กับหมุด)
  tracking   text,                                    -- เลขแทรค (งานจาก pacred)
  customer   text,
  address    text,
  lat        numeric(10,7),                           -- จากหมุด PR (หรือปักเอง)
  lng        numeric(10,7),
  boxes      integer,
  weight_kg  numeric(10,2),                           -- กรอกเอง (ท่อ bot ยังไม่ส่งน้ำหนัก)
  cbm        numeric(10,3),
  note       text,
  created_at timestamptz not null default now()
);
comment on table public.dp_stop is 'Delivery Planner: จุดส่งในเที่ยว ≈ tb_forwarder_driver_item (แผนเท่านั้น)';
create index if not exists dp_stop_trip_idx on public.dp_stop (trip_id, seq);
alter table public.dp_stop enable row level security;

-- ── ⑤ หน้าคนขับ + ติดตามรถ (ภูม 2026-11-23) ──────────────────────────
-- share_token = โทเคนของเที่ยว (ลิงก์ให้คนขับเปิดมือถือดูเส้นทาง — ไม่ใช้คีย์แอดมิน)
-- last_lat/lng/ping = ตำแหน่ง GPS ล่าสุดจากมือถือคนขับ (ยังไม่มี car-track ⇒ ใช้มือถือไปก่อน)
alter table public.dp_trip add column if not exists share_token  text;
alter table public.dp_trip add column if not exists last_lat     numeric(10,7);
alter table public.dp_trip add column if not exists last_lng     numeric(10,7);
alter table public.dp_trip add column if not exists last_ping_at timestamptz;

-- ── ⑥ เช็คว่าลงครบ ──────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('dp_setting','dp_truck','dp_trip','dp_stop'))
                                               as "ตารางที่ลงแล้ว (ต้องได้ 4)",
  (select count(*) from public.dp_truck)  as "รถ",
  (select count(*) from public.dp_trip)   as "เที่ยวส่ง",
  (select count(*) from public.dp_stop)   as "จุดส่ง",
  (select count(*) from public.dp_setting where key='warehouse_origin') as "ตั้งจุดโกดังแล้ว (0/1)";
