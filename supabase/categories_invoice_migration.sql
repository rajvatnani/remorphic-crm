-- ============================================================
-- Remorphic CRM — Categories and Invoice Migration
-- Run this in Supabase SQL Editor after shop_migration.sql
-- and BEFORE deploying the matching app code.
--
--  1. item_categories, and items.category_id
--  2. businesses.gstin and invoice_note, printed on invoices
--  3. orders.delivered_at, set when an order is marked delivered
--
-- Safe to run more than once.
-- ============================================================

-- 1. Categories
create table if not exists item_categories (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  name        text not null check (btrim(name) <> ''),
  position    integer not null default 0,
  created_at  timestamptz default now() not null
);
create unique index if not exists item_categories_name_idx on item_categories(business_id, lower(btrim(name)));

alter table item_categories enable row level security;
drop policy if exists "biz_all" on item_categories;
create policy "biz_all" on item_categories
  for all using (business_id = get_my_business_id())
  with check (business_id = get_my_business_id());

alter table items add column if not exists category_id uuid references item_categories(id) on delete set null;
create index if not exists items_category_idx on items(category_id);

-- An item may only use its own business's categories
create or replace function items_check_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.item_categories where id = new.category_id and business_id = new.business_id
  ) then
    raise exception 'Category not found';
  end if;
  return new;
end;
$$;
drop trigger if exists items_check_category on items;
create trigger items_check_category before insert or update of category_id, business_id on items
  for each row execute function items_check_category();

-- 2. Invoice details
alter table businesses add column if not exists gstin        text;
alter table businesses add column if not exists invoice_note text;

-- Re-apply the editable-columns rule for the new columns
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

-- 3. When an order was delivered (shown on the invoice)
alter table orders add column if not exists delivered_at timestamptz;

-- Same as in orders_migration.sql, plus delivered_at
create or replace function set_order_status(p_order uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := public.get_my_business_id();
  v_order public.orders%rowtype;
begin
  if p_status not in ('new', 'confirmed', 'ready', 'delivered', 'cancelled') then
    raise exception 'Unknown status';
  end if;

  select * into v_order from public.orders
  where id = p_order and business_id = v_business
  for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status in ('confirmed', 'ready', 'delivered') and not v_order.stock_taken then
    perform public._move_order_stock(p_order, -1);
    v_order.stock_taken := true;
  elsif p_status in ('new', 'cancelled') and v_order.stock_taken then
    perform public._move_order_stock(p_order, 1);
    v_order.stock_taken := false;
  end if;

  update public.orders
  set status = p_status,
      stock_taken = v_order.stock_taken,
      delivered_at = case when p_status = 'delivered' then coalesce(v_order.delivered_at, now()) end,
      updated_at = now()
  where id = p_order;
end;
$$;
revoke all on function set_order_status(uuid, text) from public, anon;
grant execute on function set_order_status(uuid, text) to authenticated;
