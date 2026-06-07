-- ============================================================
-- Remorphic CRM — Leads Module Migration
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- Adds leads + lead_interactions tables (visible to all business types)
-- ============================================================

-- Leads table
create table if not exists leads (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  name        text not null,
  phone       text not null,
  interest    text,
  status      text not null default 'new'
              check (status in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  created_at  timestamptz default now() not null
);

-- Lead interactions table
create table if not exists lead_interactions (
  id                uuid default gen_random_uuid() primary key,
  lead_id           uuid references leads(id) on delete cascade not null,
  business_id       uuid references businesses(id) on delete cascade not null,
  type              text not null
                    check (type in ('call', 'meeting', 'site_visit', 'offer', 'follow_up', 'other')),
  notes             text,
  occurred_at       date not null default current_date,
  duration_minutes  integer,
  location          text,
  amount            numeric,
  follow_up_date    date,
  created_at        timestamptz default now() not null
);

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists leads_business_id_idx              on leads(business_id);
create index if not exists lead_interactions_business_id_idx  on lead_interactions(business_id);
create index if not exists lead_interactions_lead_id_idx      on lead_interactions(lead_id);
create index if not exists lead_interactions_occurred_at_idx  on lead_interactions(occurred_at desc);

-- ============================================================
-- Enable Row Level Security
-- ============================================================

alter table leads             enable row level security;
alter table lead_interactions enable row level security;

-- ============================================================
-- RLS Policies — leads
-- ============================================================

create policy "biz_select" on leads
  for select using (business_id = get_my_business_id());

create policy "biz_insert" on leads
  for insert with check (business_id = get_my_business_id());

create policy "biz_update" on leads
  for update using (business_id = get_my_business_id());

create policy "biz_delete" on leads
  for delete using (business_id = get_my_business_id());

-- ============================================================
-- RLS Policies — lead_interactions
-- ============================================================

create policy "biz_select" on lead_interactions
  for select using (business_id = get_my_business_id());

create policy "biz_insert" on lead_interactions
  for insert with check (business_id = get_my_business_id());

create policy "biz_update" on lead_interactions
  for update using (business_id = get_my_business_id());

create policy "biz_delete" on lead_interactions
  for delete using (business_id = get_my_business_id());
