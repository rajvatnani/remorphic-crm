-- ============================================================
-- Remorphic CRM — Online Booking Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add booking slug to businesses
alter table businesses add column if not exists slug text;

update businesses
set slug = regexp_replace(
    lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g')),
    '\s+', '-', 'g'
  ) || '-' || substr(replace(id::text, '-', ''), 1, 6)
where slug is null;

alter table businesses alter column slug set not null;
create unique index if not exists businesses_slug_idx on businesses(slug);

-- 2. Add 'pending' status for online booking requests
alter table appointments drop constraint if exists appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('pending', 'scheduled', 'confirmed', 'cancelled'));

-- 3. Booking OTPs table for phone verification on the public booking page
create table if not exists booking_otps (
  id          uuid default gen_random_uuid() primary key,
  phone       text not null,
  business_id uuid references businesses(id) on delete cascade not null,
  code        text not null,
  expires_at  timestamptz not null,
  verified    boolean not null default false,
  created_at  timestamptz default now() not null
);

create index if not exists booking_otps_lookup_idx
  on booking_otps(phone, business_id, verified);
