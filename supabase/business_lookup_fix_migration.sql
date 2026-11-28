-- ============================================================
-- Remorphic CRM — Business Lookup Fix
-- Run this in Supabase SQL Editor after ai_instructions_migration.sql.
-- No app code change depends on it; it fixes saving an item with a
-- category ("relation "business_users" does not exist").
--
-- get_my_business_id() named business_users without its schema and
-- had no fixed search_path, so it failed when called from code that
-- runs with an empty search_path (such as the category check on
-- items). It now names public.business_users and fixes its own
-- search_path, as Supabase recommends for security definer functions.
-- What it returns is unchanged.
--
-- Safe to run more than once.
-- ============================================================

create or replace function public.get_my_business_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select business_id from public.business_users where user_id = auth.uid() limit 1;
$$;
