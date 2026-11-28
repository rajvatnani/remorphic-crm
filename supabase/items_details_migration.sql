-- ============================================================
-- Remorphic CRM — Item Details Migration
-- Run this in Supabase SQL Editor after order_email_migration.sql
-- and BEFORE deploying the matching app code.
--
-- Brings the rest of Remorphic Saathi's item form across:
--  1. items: MRP, wholesaler, low-stock alert level, tags, up to 5
--     photos, archived
--  2. businesses: item code prefix and counter, default low-stock level
--  3. Item codes made automatically (e.g. GS-001) when left blank, and
--     given to existing items that have none
--
-- Safe to run more than once.
-- ============================================================

-- 1. Items
alter table items add column if not exists mrp_paise       integer;
alter table items add column if not exists wholesaler      text;
alter table items add column if not exists low_stock_level integer;
alter table items add column if not exists tags            text[] not null default '{}';
alter table items add column if not exists photos          text[] not null default '{}';
alter table items add column if not exists archived        boolean not null default false;

alter table items drop constraint if exists items_mrp_check;
alter table items add constraint items_mrp_check check (mrp_paise is null or mrp_paise > 0);
alter table items drop constraint if exists items_low_stock_check;
alter table items add constraint items_low_stock_check check (low_stock_level is null or low_stock_level >= 0);
alter table items drop constraint if exists items_photos_check;
alter table items add constraint items_photos_check check (cardinality(photos) <= 5);
-- Keys are stored; the app holds the labels ("Selling fast", ...)
alter table items drop constraint if exists items_tags_allowed;
alter table items add constraint items_tags_allowed check (
  tags <@ array['selling_fast', 'bestseller', 'new_arrival', 'limited_edition', 'handmade', 'gift_pick']::text[]
);

-- The single photo_url so far becomes the first of photos; photo_url
-- stays as the cover (the app keeps it equal to photos[1])
update items set photos = array[photo_url] where photo_url is not null and cardinality(photos) = 0;

-- 2. Business settings for items
alter table businesses add column if not exists item_code_prefix  text not null default 'IT';
alter table businesses add column if not exists next_item_no      integer not null default 1;
alter table businesses add column if not exists default_low_stock integer not null default 2;
alter table businesses drop constraint if exists businesses_item_code_prefix_check;
alter table businesses add constraint businesses_item_code_prefix_check check (item_code_prefix ~ '^[A-Z0-9]{1,6}$');
alter table businesses drop constraint if exists businesses_default_low_stock_check;
alter table businesses add constraint businesses_default_low_stock_check check (default_low_stock >= 0);

-- Members may edit businesses columns except identity, ownership and the
-- item counter (only the trigger below moves that)
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

-- 3. Item codes
create or replace function items_assign_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_no     integer;
begin
  if new.code is null or btrim(new.code) = '' then
    update public.businesses set next_item_no = next_item_no + 1
    where id = new.business_id
    returning item_code_prefix, next_item_no - 1 into v_prefix, v_no;
    new.code := v_prefix || '-' || lpad(v_no::text, 3, '0');
  else
    new.code := upper(btrim(new.code));
  end if;
  return new;
end;
$$;
drop trigger if exists items_assign_code on items;
create trigger items_assign_code before insert on items
  for each row execute function items_assign_code();

-- Existing items without a code get one, oldest first
do $$
declare
  r record;
begin
  for r in select id, business_id from items where code is null or btrim(code) = '' order by created_at loop
    update items i
    set code = b.item_code_prefix || '-' || lpad(b.next_item_no::text, 3, '0')
    from businesses b
    where i.id = r.id and b.id = r.business_id;
    update businesses set next_item_no = next_item_no + 1 where id = r.business_id;
  end loop;
end $$;
