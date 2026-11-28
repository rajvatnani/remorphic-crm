-- ============================================================
-- Remorphic CRM — Stock Log Migration
-- Run this in Supabase SQL Editor after order_payment_proof_migration.sql
-- and BEFORE deploying the matching app code.
--
--  1. stock_moves: one row per change to an item's stock
--  2. A trigger on items writes it, so no change goes unlogged. The
--     reason comes from whichever function made the change; a plain
--     edit of the item is logged as 'edit'.
--  3. adjust_stock(): add or remove stock with a reason and a note
--
-- Safe to run more than once.
-- ============================================================

-- 1. The log
create table if not exists stock_moves (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  item_id     uuid references items(id) on delete cascade not null,
  change      integer not null,
  stock_after integer not null,
  reason      text not null check (reason in
                ('order', 'order_return', 'edit', 'restock', 'damaged', 'correction', 'other')),
  order_id    uuid references orders(id) on delete set null,
  note        text,
  created_by  uuid,
  -- clock_timestamp: several moves in one transaction (an order edit
  -- returns stock, then takes it again) still list in the order made
  created_at  timestamptz default clock_timestamp() not null
);
alter table stock_moves alter column created_at set default clock_timestamp();
create index if not exists stock_moves_item_idx on stock_moves(item_id, created_at desc);

-- Members read it; only the trigger writes it
alter table stock_moves enable row level security;
drop policy if exists "biz_select" on stock_moves;
create policy "biz_select" on stock_moves for select using (business_id = get_my_business_id());
revoke insert, update, delete on table stock_moves from public, anon, authenticated;

-- 2. Log every change to items.stock
create or replace function items_log_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    integer := case when tg_op = 'UPDATE' then old.stock end;
  v_reason text := coalesce(nullif(current_setting('app.stock_reason', true), ''), 'edit');
  v_order  text := nullif(current_setting('app.stock_order', true), '');
  v_note   text := nullif(current_setting('app.stock_note', true), '');
begin
  -- Turning tracking off is not a stock movement
  if new.stock is null or new.stock is not distinct from v_old then
    return new;
  end if;

  insert into public.stock_moves (business_id, item_id, change, stock_after, reason, order_id, note, created_by)
  values (new.business_id, new.id, new.stock - coalesce(v_old, 0), new.stock,
          v_reason, v_order::uuid, v_note, auth.uid());
  return new;
end;
$$;
drop trigger if exists items_log_stock on items;
create trigger items_log_stock after insert or update of stock on items
  for each row execute function items_log_stock();

-- Orders: same as before, now tagging the change for the log
create or replace function _move_order_stock(p_order uuid, p_sign integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.stock_reason', case when p_sign < 0 then 'order' else 'order_return' end, true);
  perform set_config('app.stock_order', p_order::text, true);

  update public.items i
  set stock = i.stock + p_sign * l.qty
  from (
    select item_id, sum(qty) as qty from public.order_items
    where order_id = p_order and item_id is not null
    group by item_id
  ) l
  where i.id = l.item_id and i.stock is not null;

  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_order', '', true);
end;
$$;
revoke all on function _move_order_stock(uuid, integer) from public, anon, authenticated;

-- 3. Quick adjustments from the Items page
create or replace function adjust_stock(p_item uuid, p_change integer, p_reason text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := public.get_my_business_id();
  v_stock integer;
begin
  if p_reason not in ('restock', 'damaged', 'correction', 'other') then
    raise exception 'Unknown reason';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Enter how many to add or remove';
  end if;

  select stock into v_stock from public.items
  where id = p_item and business_id = v_business
  for update;
  if not found then raise exception 'Item not found'; end if;
  if v_stock is null then raise exception 'Stock is not tracked for this item'; end if;
  if v_stock + p_change < 0 then
    raise exception 'Only % in stock', v_stock;
  end if;

  perform set_config('app.stock_reason', p_reason, true);
  perform set_config('app.stock_note', left(btrim(coalesce(p_note, '')), 200), true);
  update public.items set stock = stock + p_change where id = p_item;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_note', '', true);

  return v_stock + p_change;
end;
$$;
revoke all on function adjust_stock(uuid, integer, text, text) from public, anon;
grant execute on function adjust_stock(uuid, integer, text, text) to authenticated;
