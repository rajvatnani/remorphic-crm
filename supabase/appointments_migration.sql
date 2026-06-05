-- ============================================================
-- Remorphic CRM — Appointments Migration
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- ============================================================

-- Appointment configuration per business
create table if not exists appointment_config (
  id             uuid default gen_random_uuid() primary key,
  business_id    uuid references businesses(id) on delete cascade not null unique,
  slot_duration  integer not null default 30,       -- minutes per slot
  max_per_slot   integer not null default 1,         -- bookings allowed per slot
  start_time     time not null default '09:00',
  end_time       time not null default '17:00',
  open_days      integer[] not null default '{1,2,3,4,5}',  -- 0=Sun … 6=Sat
  created_at     timestamptz default now() not null
);

-- Individual appointments
create table if not exists appointments (
  id                uuid default gen_random_uuid() primary key,
  business_id       uuid references businesses(id) on delete cascade not null,
  customer_id       uuid references customers(id) on delete cascade not null,
  service           text not null,
  appointment_date  date not null,
  slot_time         time not null,
  status            text not null default 'scheduled'
                    check (status in ('scheduled', 'confirmed', 'cancelled')),
  notes             text,
  visit_id          uuid references visits(id) on delete set null,
  created_at        timestamptz default now() not null
);

-- Indexes
create index if not exists appointments_business_date_idx
  on appointments(business_id, appointment_date);
create index if not exists appointments_customer_id_idx
  on appointments(customer_id);
create index if not exists appointments_status_idx
  on appointments(status);

-- Enable RLS
alter table appointment_config enable row level security;
alter table appointments       enable row level security;

-- appointment_config policies
create policy "biz_select" on appointment_config
  for select using (business_id = get_my_business_id());
create policy "biz_insert" on appointment_config
  for insert with check (business_id = get_my_business_id());
create policy "biz_update" on appointment_config
  for update using (business_id = get_my_business_id());

-- appointments policies
create policy "biz_select" on appointments
  for select using (business_id = get_my_business_id());
create policy "biz_insert" on appointments
  for insert with check (business_id = get_my_business_id());
create policy "biz_update" on appointments
  for update using (business_id = get_my_business_id());
create policy "biz_delete" on appointments
  for delete using (business_id = get_my_business_id());
