-- ============================================================
-- Remorphic CRM — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Businesses table (one per auth user)
create table if not exists businesses (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  name       text not null,
  type       text not null check (type in ('clinic', 'salon', 'gym', 'other')),
  owner_name text not null,
  phone      text not null,
  created_at timestamptz default now() not null
);

-- Customers table
create table if not exists customers (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  name        text not null,
  phone       text not null,
  created_at  timestamptz default now() not null
);

-- Visits table
create table if not exists visits (
  id          uuid default gen_random_uuid() primary key,
  customer_id uuid references customers(id) on delete cascade not null,
  business_id uuid references businesses(id) on delete cascade not null,
  service     text not null,
  visited_at  date not null default current_date,
  notes       text,
  created_at  timestamptz default now() not null
);

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists customers_business_id_idx on customers(business_id);
create index if not exists visits_business_id_idx    on visits(business_id);
create index if not exists visits_customer_id_idx    on visits(customer_id);
create index if not exists visits_visited_at_idx     on visits(visited_at desc);

-- ============================================================
-- Enable Row Level Security
-- ============================================================

alter table businesses enable row level security;
alter table customers  enable row level security;
alter table visits     enable row level security;

-- ============================================================
-- Helper: get the current user's business_id
-- ============================================================

create or replace function get_my_business_id()
returns uuid
language sql
security definer
stable
as $$
  select id from businesses where user_id = auth.uid() limit 1;
$$;

-- ============================================================
-- RLS Policies — businesses
-- ============================================================

create policy "owner_select" on businesses
  for select using (user_id = auth.uid());

create policy "owner_insert" on businesses
  for insert with check (user_id = auth.uid());

create policy "owner_update" on businesses
  for update using (user_id = auth.uid());

create policy "owner_delete" on businesses
  for delete using (user_id = auth.uid());

-- ============================================================
-- RLS Policies — customers
-- ============================================================

create policy "biz_select" on customers
  for select using (business_id = get_my_business_id());

create policy "biz_insert" on customers
  for insert with check (business_id = get_my_business_id());

create policy "biz_update" on customers
  for update using (business_id = get_my_business_id());

create policy "biz_delete" on customers
  for delete using (business_id = get_my_business_id());

-- ============================================================
-- RLS Policies — visits
-- ============================================================

create policy "biz_select" on visits
  for select using (business_id = get_my_business_id());

create policy "biz_insert" on visits
  for insert with check (business_id = get_my_business_id());

create policy "biz_update" on visits
  for update using (business_id = get_my_business_id());

create policy "biz_delete" on visits
  for delete using (business_id = get_my_business_id());
