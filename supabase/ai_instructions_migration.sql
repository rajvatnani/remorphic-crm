-- ============================================================
-- Remorphic CRM — AI Instructions Migration
-- Run this in Supabase SQL Editor after order_steps_migration.sql
-- and BEFORE deploying the matching app code.
--
-- businesses.ai_instructions: the business's own instructions for
-- "Fill details from photo with AI" (tone, language, what to mention).
-- Private to the business; the shop never reads it.
--
-- Safe to run more than once.
-- ============================================================

alter table businesses add column if not exists ai_instructions text;
alter table businesses drop constraint if exists businesses_ai_instructions_length;
alter table businesses add constraint businesses_ai_instructions_length
  check (ai_instructions is null or char_length(ai_instructions) <= 2000);

-- Re-apply the editable-columns rule for the new column
revoke update on table businesses from public, anon, authenticated;
do $$
begin
  execute (
    select 'grant update (' || string_agg(quote_ident(column_name), ', ') || ') on table public.businesses to authenticated'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses'
      and column_name not in ('id', 'user_id', 'created_at', 'next_item_no')
  );
end $$;
