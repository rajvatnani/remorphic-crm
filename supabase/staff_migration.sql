-- ============================================================
-- Remorphic CRM — Staff Migration
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- ============================================================

-- Staff table: links multiple auth users to one business
create table if not exists staff (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null unique,
  email       text not null,
  invited_by  uuid references auth.users(id),
  created_at  timestamptz default now() not null
);

create index if not exists staff_business_id_idx on staff(business_id);

alter table staff enable row level security;

-- Staff can view other staff in their business
create policy "biz_select" on staff
  for select using (business_id = get_my_business_id());

-- Anyone in the business can remove staff
create policy "biz_delete" on staff
  for delete using (business_id = get_my_business_id());

-- ============================================================
-- Update get_my_business_id() to include staff members
-- ============================================================
create or replace function get_my_business_id()
returns uuid
language sql
security definer
stable
as $$
  select id from businesses where user_id = auth.uid()
  union
  select business_id from staff where user_id = auth.uid()
  limit 1;
$$;

-- ============================================================
-- Update businesses RLS so staff can read business info
-- ============================================================
drop policy if exists "owner_select" on businesses;

create policy "owner_or_staff_select" on businesses
  for select using (
    user_id = auth.uid()
    or id in (select business_id from staff where user_id = auth.uid())
  );
