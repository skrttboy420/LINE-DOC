-- ============================================================
-- ✏️ ข้อความแจ้งเตือนที่แก้ไขได้ — ภูม 2026-10-21
--
-- รันครั้งเดียวที่ Supabase ของ "บอท" (SQL Editor → วาง → Run)
-- โปรเจกต์เดียวกับที่รัน staff-schema.sql
--
-- 🔒 ปิด RLS เหมือน bot_staff/bot_invite — ตารางนี้ไม่มีใครเข้าถึงนอกจากบอท
--    (SUPABASE_KEY ของบอทต้องเป็น service_role อยู่แล้ว · ดูเหตุผลใน staff-schema.sql)
--
-- ℹ️ ไม่รันก็ใช้บอทได้ปกติ — ข้อความจะใช้ตัวสำรองในโค้ด (notify-template.js)
--    แค่แก้ข้อความไม่ได้เท่านั้น (หน้าจัดการจะบอกว่ายังไม่ได้สร้างตาราง)
-- ============================================================

create table if not exists bot_notify_template (
  -- คีย์หมวด เช่น arrive_th · acc_slip (ดู CATEGORIES ใน staff.js)
  key         text primary key,
  -- หัวข้อ เช่น "🇹🇭 ถึงไทยแล้ว — {จำนวน} ชิ้น · {ลูกค้า} ลูกค้า"
  head        text not null,
  -- บรรทัดรายการ เช่น "• {รหัสลูกค้า} {ชื่อลูกค้า} — {ชิ้น} ชิ้น"
  line        text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table bot_notify_template disable row level security;

comment on table bot_notify_template is
  'ข้อความแจ้งเตือนที่ผู้ดูแลบอทแก้เอง · ไม่มีแถว = ใช้ข้อความตั้งต้นในโค้ด (notify-template.js)';
