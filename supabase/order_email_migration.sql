-- ============================================================
-- Remorphic CRM — Order Email Alerts Migration
-- Run this in Supabase SQL Editor after stock_log_migration.sql
-- and BEFORE deploying the matching app code.
--
-- businesses.order_alert_email: where to email each new shop order.
-- Blank means no emails. Sending also needs RESEND_API_KEY and
-- RESEND_FROM set in Vercel.
--
-- Safe to run more than once.
-- ============================================================

alter table businesses add column if not exists order_alert_email text;

-- Re-apply the editable-columns rule for the new column
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
