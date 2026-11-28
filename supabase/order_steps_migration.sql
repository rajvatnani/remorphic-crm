-- ============================================================
-- Remorphic CRM — Order Steps Migration
-- Run this in Supabase SQL Editor after shop_extras_migration.sql
-- and BEFORE deploying the matching app code.
--
-- Brings the rest of Remorphic Saathi's order handling across:
--  1. A 'shipped' step (courier, tracking number, what delivery cost),
--     cash on delivery and refunded payments, the UPI reference, a
--     cancel reason, and when the business first opened the order
--  2. order_status_history: every status change, written by a trigger
--  3. set_order_status() now handles 'shipped'; change_order_status()
--     also saves the shipping details or cancel reason;
--     record_order_payment() handles COD, refunds and the UPI reference;
--     mark_orders_seen() clears the "new" marker
--
-- Safe to run more than once. The app version before this one keeps
-- working: its functions keep their names and arguments.
-- ============================================================

-- 1. Order columns
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('new', 'confirmed', 'ready', 'shipped', 'delivered', 'cancelled'));
alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'partial', 'paid', 'cod', 'refunded'));

alter table orders add column if not exists courier             text;
alter table orders add column if not exists tracking_no         text;
alter table orders add column if not exists delivery_cost_paise integer not null default 0;
alter table orders add column if not exists upi_ref             text;
alter table orders add column if not exists cancel_reason       text;
alter table orders add column if not exists seen_at             timestamptz;
alter table orders drop constraint if exists orders_delivery_cost_check;
alter table orders add constraint orders_delivery_cost_check check (delivery_cost_paise >= 0);

-- Orders that already exist count as seen; only new ones get the marker
update orders set seen_at = coalesce(seen_at, updated_at, now()) where seen_at is null;

-- 2. Status history
create table if not exists order_status_history (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  order_id    uuid references orders(id) on delete cascade not null,
  from_status text,
  to_status   text not null,
  created_by  uuid,
  created_at  timestamptz default clock_timestamp() not null
);
create index if not exists order_status_history_order_idx on order_status_history(order_id, created_at);

alter table order_status_history enable row level security;
drop policy if exists "biz_select" on order_status_history;
create policy "biz_select" on order_status_history for select using (business_id = get_my_business_id());
revoke insert, update, delete on table order_status_history from public, anon, authenticated;

create or replace function orders_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (business_id, order_id, from_status, to_status, created_by)
    values (new.business_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists orders_log_status on orders;
create trigger orders_log_status after insert or update of status on orders
  for each row execute function orders_log_status();

-- Existing orders start their history with where they are now
insert into order_status_history (business_id, order_id, from_status, to_status, created_at)
select o.business_id, o.id, null, o.status, o.created_at
from orders o
where not exists (select 1 from order_status_history h where h.order_id = o.id);

-- 3. Functions

-- Same as before, with 'shipped' (stock stays taken)
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
  if p_status not in ('new', 'confirmed', 'ready', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Unknown status';
  end if;

  select * into v_order from public.orders
  where id = p_order and business_id = v_business
  for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status in ('confirmed', 'ready', 'shipped', 'delivered') and not v_order.stock_taken then
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
      seen_at = coalesce(seen_at, now()),
      updated_at = now()
  where id = p_order;
end;
$$;
revoke all on function set_order_status(uuid, text) from public, anon;
grant execute on function set_order_status(uuid, text) to authenticated;

-- A status change with its details: courier, tracking and delivery cost
-- when shipping; a reason when cancelling
create or replace function change_order_status(
  p_order               uuid,
  p_status              text,
  p_courier             text default null,
  p_tracking            text default null,
  p_delivery_cost_paise integer default null,
  p_cancel_reason       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_order_status(p_order, p_status);

  if p_status = 'shipped' then
    update public.orders
    set courier = nullif(left(btrim(coalesce(p_courier, '')), 80), ''),
        tracking_no = nullif(left(btrim(coalesce(p_tracking, '')), 80), ''),
        delivery_cost_paise = greatest(coalesce(p_delivery_cost_paise, delivery_cost_paise), 0)
    where id = p_order;
  elsif p_status = 'cancelled' then
    update public.orders
    set cancel_reason = nullif(left(btrim(coalesce(p_cancel_reason, '')), 300), '')
    where id = p_order;
  elsif p_status = 'new' then
    update public.orders set cancel_reason = null where id = p_order;
  end if;
end;
$$;
revoke all on function change_order_status(uuid, text, text, text, integer, text) from public, anon;
grant execute on function change_order_status(uuid, text, text, text, integer, text) to authenticated;

-- Payment: 'auto' works out pending / partial / paid from the amount;
-- 'cod' marks it to be collected on delivery; 'refunded' after a refund
create or replace function record_order_payment(
  p_order      uuid,
  p_paid_paise integer,
  p_method     text default 'auto',
  p_upi_ref    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := public.get_my_business_id();
  v_total integer;
  v_paid integer := greatest(coalesce(p_paid_paise, 0), 0);
begin
  if p_method not in ('auto', 'cod', 'refunded') then
    raise exception 'Unknown payment method';
  end if;

  select coalesce((select sum(price_paise * qty) from public.order_items where order_id = o.id), 0)
         + o.delivery_paise - o.discount_paise
  into v_total
  from public.orders o
  where o.id = p_order and o.business_id = v_business;
  if not found then raise exception 'Order not found'; end if;

  update public.orders
  set paid_paise = v_paid,
      payment_status = case
        when p_method = 'cod' and v_paid < greatest(v_total, 0) then 'cod'
        when p_method = 'refunded' then 'refunded'
        when v_paid <= 0 then 'pending'
        when v_paid >= greatest(v_total, 0) then 'paid'
        else 'partial'
      end,
      upi_ref = case when p_upi_ref is null then upi_ref else nullif(left(btrim(p_upi_ref), 60), '') end,
      updated_at = now()
  where id = p_order;
end;
$$;
revoke all on function record_order_payment(uuid, integer, text, text) from public, anon;
grant execute on function record_order_payment(uuid, integer, text, text) to authenticated;

-- An edit changes the total; keep COD and refunded as they are
create or replace function set_order_payment(p_order uuid, p_paid_paise integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select payment_status into v_status from public.orders
  where id = p_order and business_id = public.get_my_business_id();
  perform public.record_order_payment(
    p_order, p_paid_paise,
    case when v_status in ('cod', 'refunded') then v_status else 'auto' end,
    null);
end;
$$;
revoke all on function set_order_payment(uuid, integer) from public, anon;
grant execute on function set_order_payment(uuid, integer) to authenticated;

-- The "new" marker goes once the business has opened the order
create or replace function mark_orders_seen(p_orders uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set seen_at = now()
  where id = any (p_orders) and business_id = public.get_my_business_id() and seen_at is null;
$$;
revoke all on function mark_orders_seen(uuid[]) from public, anon;
grant execute on function mark_orders_seen(uuid[]) to authenticated;
