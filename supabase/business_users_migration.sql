-- ============================================================
-- Remorphic CRM — Simplify to business_users
-- Run in Supabase SQL Editor
-- ============================================================

-- Single table: every user associated with a business
create table if not exists business_users (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null unique,
  email       text not null,
  created_at  timestamptz default now() not null
);

create index if not exists business_users_business_id_idx on business_users(business_id);

alter table business_users enable row level security;

create policy "biz_select" on business_users
  for select using (business_id = get_my_business_id());

create policy "biz_delete" on business_users
  for delete using (business_id = get_my_business_id());

-- Migrate existing owners into business_users
insert into business_users (business_id, user_id, email)
select b.id, b.user_id, u.email
from businesses b
join auth.users u on u.id = b.user_id
where b.user_id is not null
on conflict (user_id) do nothing;

-- Migrate existing staff (if that table exists) into business_users
insert into business_users (business_id, user_id, email, created_at)
select business_id, user_id, email, created_at
from staff
on conflict (user_id) do nothing;

-- Drop businesses policies that reference staff BEFORE dropping the table
-- (Postgres refuses to drop a table while a policy on another table depends on it)
drop policy if exists "owner_select" on businesses;
drop policy if exists "owner_or_staff_select" on businesses;
drop policy if exists "owner_update" on businesses;

-- Drop the old staff table
drop table if exists staff;

-- Update get_my_business_id to use business_users only
create or replace function get_my_business_id()
returns uuid language sql security definer stable as $$
  select business_id from business_users where user_id = auth.uid() limit 1;
$$;

-- Update businesses RLS: any member can read/update
create policy "members_select" on businesses
  for select using (id = get_my_business_id());

create policy "members_update" on businesses
  for update using (id = get_my_business_id());
