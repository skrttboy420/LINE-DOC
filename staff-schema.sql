-- ════════════════════════════════════════════════════════════════════
-- 👥 ทะเบียนพนักงานของบอท — ภูม 2026-10-20
--
-- วิธีใช้: เปิด Supabase ของบอท (blhdxmcmepmmdfmqqvdg)
--          → SQL Editor → วางทั้งไฟล์ → Run
--          (รันซ้ำได้ ไม่พัง · ของเดิมไม่หาย)
--
-- 🔑 ตาราง 2 ตัว:
--   bot_staff   = ไลน์ไอดีนี้ คือพนักงานคนไหน + ได้รับแจ้งเตือนหมวดไหนบ้าง
--   bot_invite  = รหัสเชิญ (ภูมออกให้ · ใช้ได้ครั้งเดียว · หมดอายุ 24 ชม.)
--
-- 🔒 เปิด RLS แต่ **ไม่ใส่ policy** ⇒ แตะได้เฉพาะ service_role
--    ⇒ **ต้องเปลี่ยน SUPABASE_KEY ของบอทเป็น service_role key**
--       (Supabase → Project Settings → API → service_role · ตัว secret)
--    ทำไม: บอทรันบน Render ซึ่งเป็นเซิร์ฟเวอร์ ไม่ใช่เบราว์เซอร์
--          ⇒ ใช้ anon key ไม่ได้ช่วยอะไร แต่บังคับให้ต้องเปิดตารางกว้าง
--          และตารางนี้เก็บ **ชื่อพนักงาน + ไลน์ไอดี** = ไม่ควรให้ anon อ่านได้
-- ════════════════════════════════════════════════════════════════════

-- ── ① ทะเบียนพนักงานที่ผูกไลน์แล้ว ──────────────────────────────────
create table if not exists public.bot_staff (
  line_user_id text primary key,                    -- U… จาก LINE
  login        text not null unique,                -- admin_login_id ของเว็บ Pacred
  code         text,                                -- รหัสพนักงาน AD###
  name         text not null,
  nickname     text,
  department   text,                                -- ซิงค์จากเว็บ
  position     text,                                -- ซิงค์จากเว็บ
  roles        text[] not null default '{}',        -- สิทธิ์ในเว็บ (ไว้ตั้งค่าเริ่มต้น)
  -- 🔑 false = ลาออก/ล็อก (ซิงค์จาก profiles.is_active ของเว็บ)
  --    ⇒ ไม่ส่งแจ้งเตือน + พิมพ์ในบอทขึ้น "ไม่มีสิทธิ์ใช้งานบอท"
  active       boolean not null default true,
  -- 📬 หมวดแจ้งเตือนที่อนุญาตให้คนนี้ได้รับ (ภูมติ๊กเองในหน้าจัดการ)
  notify       text[] not null default '{}',
  linked_at    timestamptz not null default now(),  -- ผูกไลน์เมื่อไหร่
  synced_at    timestamptz,                         -- ซิงค์กับเว็บครั้งล่าสุด
  note         text
);

comment on table public.bot_staff is
  'ไลน์ไอดี ↔ พนักงาน Pacred · active ซิงค์จาก profiles.is_active (แท็บ "ลาออก · ล็อก" ของหน้า HR)';

create index if not exists idx_bot_staff_login  on public.bot_staff (login);
create index if not exists idx_bot_staff_active on public.bot_staff (active) where active;

-- ── ② รหัสเชิญ (ใช้ครั้งเดียว) ──────────────────────────────────────
create table if not exists public.bot_invite (
  code        text primary key,                     -- เช่น BAM-7421
  login       text not null,                        -- ออกให้พนักงานคนไหน
  name        text,                                 -- ชื่อ ณ ตอนออกรหัส (ไว้โชว์)
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     text                                  -- ไลน์ไอดีที่เอาไปใช้
);

comment on table public.bot_invite is
  'รหัสเชิญผูกไลน์ · ใช้ได้ครั้งเดียว · หมดอายุตาม expires_at';

create index if not exists idx_bot_invite_login on public.bot_invite (login);

-- ── ③ ปิดประตู: เปิด RLS ไม่ใส่ policy = เฉพาะ service_role ─────────
alter table public.bot_staff  enable row level security;
alter table public.bot_invite enable row level security;

-- 🧹 เผื่อเคยเปิด policy ไว้ตอนลองของ — ถอดออกให้หมด
drop policy if exists bot_staff_anon  on public.bot_staff;
drop policy if exists bot_invite_anon on public.bot_invite;
