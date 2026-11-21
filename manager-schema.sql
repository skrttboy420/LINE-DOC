-- ════════════════════════════════════════════════════════════════════
-- 🧑‍💼 ศูนย์จัดการโกดัง — ตารางของบอท (ภูม 2026-11-20)
--
-- วิธีใช้: เปิด Supabase **ของบอท** (blhdxmcmepmmdfmqqvdg)
--          → SQL Editor → วางทั้งไฟล์ → Run
--          (รันซ้ำได้ ไม่พัง · ของเดิมไม่หาย)
--
-- 🔒 **ไม่แตะฐานของ Pacred เลย** — แอปหัวหน้าโกดังเป็นของภูมล้วนๆ
--    เก็บแค่สิ่งที่ภูมกรอกเอง: เช็คลิสต์ความปลอดภัย · ประเมินทีม · ทะเบียนรถ · สมุดงาน
--    (เหมือนตารางกรงเหล็กของโกดัง — ข้อมูลของบอท ไม่ใช่ข้อมูลบริษัท)
--
-- 🔒 เปิด RLS แต่ **ไม่ใส่ policy** ⇒ แตะได้เฉพาะ service_role (แบบเดียวกับ wh_placement / bot_staff)
--    เพราะบอทรันบน Render = เซิร์ฟเวอร์ · และมีข้อมูลประเมินพนักงาน = ห้าม anon อ่านเด็ดขาด
--
-- 🔑 ตาราง 5 ตัว (ขึ้นต้น mgr_ ทุกตัว ไม่ชนกับตารางอื่นของบอท):
--   mgr_checklist  = เช็คลิสต์ความปลอดภัย 1 แถว/วัน (ติ๊กอะไรไปบ้าง + จำนวนพาเลท)
--   mgr_team       = รายชื่อทีมที่ประเมิน (+ ดาวภาพรวม)
--   mgr_team_note  = ประวัติการประเมินรายวัน (ผูกกับคนในทีม · ลบคน = ลบโน้ตตาม)
--   mgr_truck      = ทะเบียนรถ/โฟล์คลิฟท์ + รูปใบขับขี่
--   mgr_task       = สมุดงาน/ประชุมของหัวหน้า (กันตกหล่น)
-- ════════════════════════════════════════════════════════════════════

-- ── ① เช็คลิสต์ความปลอดภัย (1 แถว = 1 วัน) ────────────────────────────
--
-- 🔑 เก็บเป็น "ติ๊กข้อไหนไปบ้าง" (checks) ไม่ใช่เก็บตัวข้อความ — ตัวข้อความเช็คลิสต์
--    อยู่ในหน้าเว็บ (คงที่) ⇒ วันไหนแก้คำในเช็คลิสต์ ของเก่าก็ยังอ่านออก
--    checks = { "shelf": true, "fork": true, ... }  ·  pallet = จำนวนพาเลทที่นับได้ (ข้อความ)
create table if not exists public.mgr_checklist (
  day        date primary key,                       -- วันของเช็คลิสต์ (เปิดวันใหม่ = แถวใหม่)
  checks     jsonb not null default '{}'::jsonb,      -- ข้อที่ติ๊กแล้ว { key: true }
  pallet     text,                                    -- จำนวนพาเลทที่นับได้ (เก็บเป็นข้อความ เผื่อใส่ "42+")
  updated_by text,                                    -- คนที่บันทึกล่าสุด
  updated_at timestamptz not null default now()
);
comment on table public.mgr_checklist is
  'ศูนย์จัดการโกดัง: เช็คลิสต์ความปลอดภัย 1 แถว/วัน (ของบอท ไม่ใช่ Pacred)';

-- 📸 รูปหลักฐานของวันนั้น (ภูม 2026-11-21) — เดิมหน้าเว็บให้แนบรูปได้ แต่ไม่มีที่เก็บ
--    ⇒ รีหน้าแล้วรูปหาย (จอเขียนไว้เองว่า "ไม่ได้เก็บถาวร"). เก็บเป็น data URL ที่เว็บบีบแล้ว
--    เพดาน 3 รูป/วัน (ตัวเขียนบังคับ) ⇒ แถวละไม่เกิน ~1 MB · โตเกินค่อยย้ายไป storage bucket
alter table public.mgr_checklist add column if not exists photos jsonb not null default '[]'::jsonb;

-- 📝 หมายเหตุรายข้อ (ภูม 2026-11-21) — *"ถ้าสมมุติมันเกิดปัญหาหละ คือไม่ต้องติ๊กหรือไง
--    … ให้ทำเป็นหมายเหตุไว้ได้ไหม อย่างวันนี้มีคนขับรถชนตัวกั้นชั้นวางบุบ
--    ตรงช่องติ๊กชั้นวาง มันควรมีให้ใส่หมายเหตุด้วย"*
-- รูปร่าง { "shelf": "คนขับชนตัวกั้น ชั้นวางบุบ 1 ช่อง แจ้งช่างแล้ว" } — คีย์เดียวกับ checks
-- 🔑 กติกาที่โค้ดคุม: มีหมายเหตุ = "ตรวจแล้ว เจอปัญหา" (ไม่ใช่ลืมตรวจ) · เขียนได้ทั้งที่ติ๊กและไม่ติ๊ก
alter table public.mgr_checklist add column if not exists notes jsonb not null default '{}'::jsonb;

-- 🔗 ลิงก์ส่งเจ้านาย (ภูม 2026-11-21) — *"กดออกลิงค์ฟอร์มลิสที่ตรวจไปส่งพี่ป๊อปได้
--    พี่ป๊อปสามารถกดดูรูปที่แนบเป็นหลักฐานได้ด้วย"*
-- โทเคนสุ่ม 24 ตัวอักษร = ทางเข้าหน้า /manager/r/<โทเคน> (ดูอย่างเดียว · ไม่ต้องใส่คีย์)
-- 🔒 **ไม่ใช่คีย์หัวหน้า** — เปิดได้แค่เช็คลิสต์ของวันนั้นวันเดียว ไม่เห็นคะแนนประเมินทีม
-- 🔑 1 วัน = 1 โทเคน · กด "ออกลิงก์ใหม่" = เขียนทับ ⇒ ลิงก์เดิมใช้ไม่ได้ทันที (= ปุ่มปิดลิงก์)
-- 🔑 unique index: ตัวอ่านใช้ .eq("share_token", …).maybeSingle() ⇒ ซ้ำกัน 2 แถวจะอ่านพัง
alter table public.mgr_checklist add column if not exists share_token text;
create unique index if not exists mgr_checklist_share_token_idx
  on public.mgr_checklist (share_token) where share_token is not null;

alter table public.mgr_checklist enable row level security;

-- ── ② ทีมที่ประเมิน ──────────────────────────────────────────────────
create table if not exists public.mgr_team (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                           -- ชื่อ + ตำแหน่ง เช่น "สมชาย · หัวหน้าโกดัง"
  stars      smallint not null default 0,             -- ดาวภาพรวม 0–5
  created_at timestamptz not null default now(),
  constraint mgr_team_stars_rng check (stars between 0 and 5)
);
comment on table public.mgr_team is
  'ศูนย์จัดการโกดัง: รายชื่อทีมที่หัวหน้าประเมิน (ของบอท)';
alter table public.mgr_team enable row level security;

-- ── ③ ประวัติการประเมินรายวัน ────────────────────────────────────────
--
-- ภูม: *"ในส่วนประเมินทีม ต้องบันทึกด้วยว่าทีโน๊ตวันไหนยังไงไปบ้าง"*
-- ⇒ 1 แถว = 1 บันทึก มีวันเวลา ⇒ เรียงย้อนหลังดูได้ว่าจดอะไรวันไหน
-- 🔑 on delete cascade: ลบพนักงานออกจากทีม = โน้ตของคนนั้นหายตาม (ไม่เหลือโน้ตลอย)
create table if not exists public.mgr_team_note (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.mgr_team(id) on delete cascade,
  body       text not null,                           -- ข้อความประเมิน/สิ่งที่เห็น
  created_at timestamptz not null default now()
);
comment on table public.mgr_team_note is
  'ศูนย์จัดการโกดัง: โน้ตประเมินรายวันของแต่ละคน (ลบคน = ลบตาม)';
create index if not exists mgr_team_note_member_idx on public.mgr_team_note (member_id, created_at desc);
alter table public.mgr_team_note enable row level security;

-- ── ④ ทะเบียนรถ / ใบขับขี่ ───────────────────────────────────────────
--
-- ภูม: *"รถ 2 คัน...อัพรูปใบขับขี่...กดแก้ไขได้มั้ย"*
-- 🔑 รูปใบขับขี่เก็บเป็น data URL (บีบเล็กฝั่งเว็บก่อนส่ง) — รถไม่กี่คัน ไม่ต้องตั้ง bucket แยก
create table if not exists public.mgr_truck (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                        -- ชื่อ/ทะเบียนรถ เช่น "FL-01"
  person        text default '',                      -- ผู้รับผิดชอบรถ
  license_photo text,                                 -- รูปใบขับขี่ (data URL บีบแล้ว) · null = ยังไม่ลง
  created_at    timestamptz not null default now()
);
comment on table public.mgr_truck is
  'ศูนย์จัดการโกดัง: ทะเบียนรถ/โฟล์คลิฟท์ + รูปใบขับขี่ (ของบอท)';
alter table public.mgr_truck enable row level security;

-- ── ⑤ สมุดงานหัวหน้า ─────────────────────────────────────────────────
--
-- ภูม: *"งานผม...ควรเป็นหน้าที่ภูมิไว้บันทึก และ ช่วยเเจ้งเตือน"*
create table if not exists public.mgr_task (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,                           -- งาน/ประชุม
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
comment on table public.mgr_task is
  'ศูนย์จัดการโกดัง: สมุดงาน/ประชุมของหัวหน้า (ของบอท)';
create index if not exists mgr_task_open_idx on public.mgr_task (done, created_at desc);
alter table public.mgr_task enable row level security;

-- ── ⑥ เช็คว่าลงครบ ──────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema='public'
      and table_name in ('mgr_checklist','mgr_team','mgr_team_note','mgr_truck','mgr_task'))
                                                      as "ตารางที่ลงแล้ว (ต้องได้ 5)",
  (select count(*) from public.mgr_team)       as "คนในทีม",
  (select count(*) from public.mgr_team_note)  as "โน้ตประเมิน",
  (select count(*) from public.mgr_truck)      as "รถที่ลงทะเบียน",
  (select count(*) from public.mgr_task where not done) as "งานค้าง",
  (select count(*) from public.mgr_checklist)  as "วันที่มีเช็คลิสต์",
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='mgr_checklist'
      and column_name in ('photos','notes','share_token'))
                                                      as "ช่องรูป+หมายเหตุ+ลิงก์ (ต้องได้ 3)",
  (select count(*) from public.mgr_checklist where notes <> '{}'::jsonb)
                                                      as "วันที่มีหมายเหตุ",
  (select count(*) from public.mgr_checklist where share_token is not null)
                                                      as "วันที่ออกลิงก์ให้เจ้านายแล้ว";
