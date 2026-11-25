-- ============================================================
-- Remorphic CRM — Member Removal Migration
-- Run this in Supabase SQL Editor AFTER security_hardening_migration.sql
--
--  1. Nobody can remove the owner, or themselves, from a business
--  2. Members can edit the business profile but not who owns it
--     (otherwise staff could make themselves owner to get around 1)
--
-- Safe to run more than once.
-- ============================================================

drop policy if exists "biz_delete" on business_users;

create policy "biz_delete" on business_users
  for delete using (
    business_id = get_my_business_id()
    and user_id <> auth.uid()
    and user_id <> (
      select b.user_id from businesses b where b.id = business_users.business_id
    )
  );

-- Column-level: RLS decides which rows, this decides which columns.
-- Add new editable profile columns here when they get a settings field.
revoke update on table businesses from public, anon, authenticated;
grant  update (name, type, owner_name, phone, inactive_threshold_days, timezone)
  on table businesses to authenticated;
