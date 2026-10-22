-- =====================================================================
--  WL Academic — ระบบจัดการงานวิชาการ บ้านวังลึก (ย.น.)
--  ฐานข้อมูลส่วนเพิ่ม (ใช้ Supabase project เดียวกับ WL Admin)
--
--  วิธีใช้: Supabase > SQL Editor > วางไฟล์นี้ทั้งไฟล์ > Run
--  - ต้องรัน supabase/schema.sql ของ WL Admin ก่อน (ใช้ตาราง profiles, school_settings, terms
--    และฟังก์ชัน is_admin / is_staff ของ WL Admin)
--  - รันซ้ำได้ ข้อมูลไม่หาย
--  - ไฟล์นี้ "ไม่แก้" ตารางเดิมของ WL Admin เลย สร้างเฉพาะตารางใหม่
-- =====================================================================

do $$ begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.profiles') is null then
    raise exception 'ยังไม่พบฐานข้อมูลของ WL Admin กรุณารัน supabase/schema.sql ของ WL Admin ก่อน แล้วจึงรันไฟล์นี้';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) บุคลากร — ตารางกลางของทุกแอปในเครือ WL (WL Admin, WL Scheduler, ระบบสอนแทน, WL Academic)
--    มีชื่อได้แม้ยังไม่มีบัญชีผู้ใช้ · ผูกกับบัญชีภายหลังที่ profile_id
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  id             uuid primary key default gen_random_uuid(),
  prefix         text not null default '',            -- นาย / นาง / นางสาว / ว่าที่ร้อยตรี ...
  first_name     text not null,
  last_name      text not null default '',
  position       text not null default 'ครู',         -- ผู้อำนวยการโรงเรียน / ครู / ครูผู้ช่วย / พนักงานราชการ / ครูอัตราจ้าง / เจ้าหน้าที่ธุรการ ...
  academic_rank  text not null default '',            -- ชำนาญการ / ชำนาญการพิเศษ / เชี่ยวชาญ / (ว่าง = ไม่มีวิทยฐานะ)
  levels         text not null default '',            -- ระดับชั้นที่รับผิดชอบ เช่น "ป.4–ป.6"
  subject_area   text not null default '',            -- กลุ่มสาระ/งานหลัก
  profile_id     uuid unique references public.profiles(id) on delete set null,
  sort_order     int not null default 0,
  active         boolean not null default true,       -- false = ย้าย/ลาออกแล้ว (เก็บไว้เพื่อคำสั่งเก่า)
  note           text not null default '',
  updated_at     timestamptz not null default now()
);
comment on table public.staff is 'บุคลากรทั้งโรงเรียน ใช้ร่วมกันทุกแอปในเครือ WL';

-- ---------------------------------------------------------------------
-- 2) ตั้งค่า WL Academic (มีแถวเดียว)
-- ---------------------------------------------------------------------
create table if not exists public.ac_settings (
  id                 int primary key default 1 check (id = 1),
  teachers_enabled   boolean not null default false,   -- เปิดให้ครูทุกคนเข้าใช้ (ตอนเริ่ม = เฉพาะผู้ดูแล/ฝ่ายวิชาการ)
  numerals           text not null default 'thai' check (numerals in ('thai','arabic')),
  order_reason       text not null default '',          -- ย่อหน้าเหตุผลตั้งต้นของคำสั่งประจำปี
  order_legal        text not null default '',          -- ย่อหน้าข้อกฎหมายตั้งต้น
  order_closing      text not null default '',          -- ย่อหน้าปิดท้ายตั้งต้น
  updated_at         timestamptz not null default now()
);
insert into public.ac_settings (id) values (1) on conflict do nothing;

-- ไฟล์ภาพเล็ก ๆ ของแอป (เช่น ตราครุฑ) เก็บเป็น data URL
create table if not exists public.ac_assets (
  key         text primary key,                        -- 'garuda'
  data_url    text not null,
  name        text not null default '',
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) คลังงานวิชาการ (แยกตามปีการศึกษา — แก้ปีใหม่ไม่กระทบคำสั่งปีเก่า)
-- ---------------------------------------------------------------------
create table if not exists public.ac_tasks (
  id             uuid primary key default gen_random_uuid(),
  academic_year  int not null check (academic_year between 2500 and 2700),
  group_name     text not null default '',              -- กลุ่มงาน (ว่างได้)
  name           text not null,
  duties         text not null default '',              -- ขอบข่ายหน้าที่ บรรทัดละ 1 ข้อ
  sort_order     int not null default 0,
  source         text not null default 'custom' check (source in ('official','practical','custom')),
  updated_at     timestamptz not null default now()
);
create index if not exists ac_tasks_year on public.ac_tasks (academic_year, sort_order);

-- ---------------------------------------------------------------------
-- 4) การมอบหมายภาระงาน: ใครอยู่งานไหน บทบาทอะไร
-- ---------------------------------------------------------------------
create table if not exists public.ac_assignments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.ac_tasks(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  role        text not null check (role in ('head','member','secretary')),
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  unique (task_id, staff_id)
);
comment on column public.ac_assignments.role is 'head = หัวหน้างาน, member = กรรมการ, secretary = กรรมการและเลขานุการ';

-- ---------------------------------------------------------------------
-- 5) คำสั่งราชการ
--    kind = annual  : คำสั่งมอบหมายงานวิชาการประจำปี (ดึงจากการจัดภาระงาน)
--    kind = special : คำสั่งเฉพาะกิจ (คณะกรรมการกำหนดเองใน body)
--    status = issued : ล็อกฉบับแล้ว (snapshot เก็บข้อมูล ณ วันออกคำสั่ง ไม่เปลี่ยนตามการแก้ภายหลัง)
-- ---------------------------------------------------------------------
create table if not exists public.ac_orders (
  id             uuid primary key default gen_random_uuid(),
  academic_year  int not null,
  kind           text not null check (kind in ('annual','special')),
  number         text not null default '',               -- เช่น 15/2569
  title          text not null default '',               -- เรื่อง
  reason         text not null default '',
  legal          text not null default '',
  closing        text not null default '',
  body           jsonb not null default '{}'::jsonb,      -- คำสั่งเฉพาะกิจ: { committees:[{name,duties,members:[{staff_id|name,position,role}]}] }
  effective_text text not null default '',               -- ทั้งนี้ ตั้งแต่...
  signed_date    date,
  signer_name    text not null default '',
  signer_title   text not null default '',
  options        jsonb not null default '{}'::jsonb,      -- { numerals:'thai', show_duties:true }
  status         text not null default 'draft' check (status in ('draft','issued')),
  snapshot       jsonb,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at     timestamptz not null default now()
);
create index if not exists ac_orders_year on public.ac_orders (academic_year);

-- ---------------------------------------------------------------------
-- updated_at อัตโนมัติ (ใช้ฟังก์ชัน touch_updated_at ของ WL Admin)
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['staff','ac_settings','ac_assets','ac_tasks','ac_assignments','ac_orders'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- สิทธิ์
--   ตอนเริ่ม: ผู้ดูแล (admin = ฝ่ายวิชาการ) อ่าน/แก้ได้ทั้งหมด
--   เปิด "ให้ครูทุกคนใช้งาน" แล้ว: ครูที่อนุมัติแล้วอ่านได้ (สิทธิ์แก้ของครูจะเพิ่มในระยะถัดไป)
--   บุคลากร (staff): ครูที่อนุมัติแล้วอ่านได้เสมอ เพราะใช้ร่วมกันทุกแอป
-- ---------------------------------------------------------------------
create or replace function public.ac_can_read() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.is_staff() and coalesce((select teachers_enabled from public.ac_settings where id = 1), false))
$$;

alter table public.staff          enable row level security;
alter table public.ac_settings    enable row level security;
alter table public.ac_assets      enable row level security;
alter table public.ac_tasks       enable row level security;
alter table public.ac_assignments enable row level security;
alter table public.ac_orders      enable row level security;

drop policy if exists staff_read  on public.staff;
drop policy if exists staff_admin on public.staff;
create policy staff_read  on public.staff for select using (public.is_staff());
create policy staff_admin on public.staff for all using (public.is_admin()) with check (public.is_admin());

-- ตั้งค่าอ่านได้ทุกคนที่อนุมัติแล้ว (แอปต้องรู้ว่าเปิดให้ครูใช้หรือยัง)
drop policy if exists ac_settings_read  on public.ac_settings;
drop policy if exists ac_settings_admin on public.ac_settings;
create policy ac_settings_read  on public.ac_settings for select using (public.is_staff());
create policy ac_settings_admin on public.ac_settings for all using (public.is_admin()) with check (public.is_admin());

do $$ declare t text; begin
  foreach t in array array['ac_assets','ac_tasks','ac_assignments','ac_orders'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (public.ac_can_read())', t, t);
    execute format('create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- คัดลอกคลังงานและการจัดภาระงานจากปีหนึ่งไปอีกปี (เฉพาะผู้ดูแล)
-- ---------------------------------------------------------------------
create or replace function public.ac_copy_year(from_year int, to_year int, with_assignments boolean default true)
returns int
language plpgsql security definer set search_path = public as $$
declare r record; new_id uuid; n int := 0;
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น'; end if;
  if exists (select 1 from public.ac_tasks where academic_year = to_year) then
    raise exception 'ปีการศึกษา % มีรายการงานอยู่แล้ว', to_year;
  end if;
  for r in select * from public.ac_tasks where academic_year = from_year order by sort_order loop
    insert into public.ac_tasks (academic_year, group_name, name, duties, sort_order, source)
    values (to_year, r.group_name, r.name, r.duties, r.sort_order, r.source) returning id into new_id;
    n := n + 1;
    if with_assignments then
      insert into public.ac_assignments (task_id, staff_id, role, sort_order)
      select new_id, a.staff_id, a.role, a.sort_order
      from public.ac_assignments a join public.staff s on s.id = a.staff_id
      where a.task_id = r.id and s.active;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['staff','ac_settings','ac_assets','ac_tasks','ac_assignments','ac_orders'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null; end;
    end loop;
  end if;
end $$;
