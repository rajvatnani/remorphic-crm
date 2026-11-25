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
-- Everything except the identity and ownership columns stays editable.
-- Run this again after adding a column to businesses.
revoke update on table businesses from public, anon, authenticated;

do $$
begin
  execute (
    select 'grant update (' || string_agg(quote_ident(column_name), ', ') || ') on table public.businesses to authenticated'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses'
      and column_name not in ('id', 'user_id', 'created_at')
  );
end $$;
