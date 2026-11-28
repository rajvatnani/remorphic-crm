-- ============================================================
-- Remorphic CRM — Orders Migration
-- Run this in Supabase SQL Editor after booking_without_code_migration.sql
-- and BEFORE deploying the matching app code.
--
--  1. Module switches on businesses (leads, appointments, visits, orders)
--  2. items: what a business sells
--  3. orders + order_items, linked to customers
--  4. Order functions: create, change status (moves stock), edit
--
-- Safe to run more than once. The app version before this one ignores
-- all of it.
-- ============================================================

-- ============================================================
-- 1. Module switches. Existing businesses keep what they have today.
-- ============================================================

alter table businesses add column if not exists leads_enabled        boolean not null default true;
alter table businesses add column if not exists appointments_enabled boolean not null default true;
alter table businesses add column if not exists visits_enabled       boolean not null default true;
alter table businesses add column if not exists orders_enabled       boolean not null default false;

-- Members may update every column except identity and ownership
-- (same rule as member_removal_migration.sql, re-applied for the new columns)
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

-- ============================================================
-- 2. Items. Money is in paise. stock null = not tracked.
-- ============================================================

create table if not exists items (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  name        text not null,
  code        text,
  description text,
  price_paise integer not null default 0 check (price_paise >= 0),
  cost_paise  integer check (cost_paise >= 0),
  stock       integer,
  active      boolean not null default true,
  created_at  timestamptz default now() not null
);
create index if not exists items_business_idx on items(business_id, name);

alter table items enable row level security;
drop policy if exists "biz_all" on items;
create policy "biz_all" on items
  for all using (business_id = get_my_business_id())
  with check (business_id = get_my_business_id());

-- ============================================================
-- 3. Orders. Lines keep the name and price at the time of the order,
-- so editing an item later never changes past orders.
-- ============================================================

create table if not exists orders (
  id             uuid default gen_random_uuid() primary key,
  business_id    uuid references businesses(id) on delete cascade not null,
  order_no       integer not null,
  customer_id    uuid references customers(id) on delete restrict not null,
  status         text not null default 'new'
                 check (status in ('new', 'confirmed', 'ready', 'delivered', 'cancelled')),
  payment_status text not null default 'pending'
                 check (payment_status in ('pending', 'partial', 'paid')),
  paid_paise     integer not null default 0 check (paid_paise >= 0),
  delivery_paise integer not null default 0 check (delivery_paise >= 0),
  discount_paise integer not null default 0 check (discount_paise >= 0),
  notes          text,
  due_date       date,
  stock_taken    boolean not null default false,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null,
  unique (business_id, order_no)
);
create index if not exists orders_business_created_idx on orders(business_id, created_at desc);
create index if not exists orders_customer_idx on orders(customer_id);

create table if not exists order_items (
  id          uuid default gen_random_uuid() primary key,
  order_id    uuid references orders(id) on delete cascade not null,
  business_id uuid references businesses(id) on delete cascade not null,
  item_id     uuid references items(id) on delete set null,
  name        text not null,
  price_paise integer not null check (price_paise >= 0),
  cost_paise  integer check (cost_paise >= 0),
  qty         integer not null check (qty > 0)
);
create index if not exists order_items_order_idx on order_items(order_id);

-- Members read orders directly; every write goes through the functions
-- below, so order numbers, totals and stock stay consistent.
alter table orders      enable row level security;
alter table order_items enable row level security;
drop policy if exists "biz_select" on orders;
create policy "biz_select" on orders for select using (business_id = get_my_business_id());
drop policy if exists "biz_select" on order_items;
create policy "biz_select" on order_items for select using (business_id = get_my_business_id());
revoke insert, update, delete on table orders, order_items from public, anon, authenticated;

-- ============================================================
-- 4. Functions. Each acts only on the caller's own business.
-- ============================================================

-- p_lines: [{"item_id": uuid|null, "name": text, "price_paise": int, "qty": int}]
create or replace function _write_order_lines(p_business uuid, p_order uuid, p_lines jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_line jsonb;
  v_item public.items%rowtype;
  v_name text;
  v_qty  integer;
  v_price integer;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := null;
    if nullif(v_line->>'item_id', '') is not null then
      select * into v_item from public.items
      where id = (v_line->>'item_id')::uuid and business_id = p_business;
      if not found then raise exception 'Item not found'; end if;
    end if;

    v_name  := left(btrim(coalesce(nullif(v_line->>'name', ''), v_item.name, '')), 200);
    v_qty   := (v_line->>'qty')::integer;
    v_price := coalesce((v_line->>'price_paise')::integer, v_item.price_paise);

    if v_name = '' then raise exception 'Each line needs an item name'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantity must be at least 1'; end if;
    if v_price is null or v_price < 0 then raise exception 'Price cannot be negative'; end if;

    insert into public.order_items (order_id, business_id, item_id, name, price_paise, cost_paise, qty)
    values (p_order, p_business, v_item.id, v_name, v_price, v_item.cost_paise, v_qty);
  end loop;
end;
$$;
revoke all on function _write_order_lines(uuid, uuid, jsonb) from public, anon, authenticated;

-- Takes (p_sign = -1) or returns (p_sign = 1) an order's stock
create or replace function _move_order_stock(p_order uuid, p_sign integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.items i
  set stock = i.stock + p_sign * l.qty
  from (
    select item_id, sum(qty) as qty from public.order_items
    where order_id = p_order and item_id is not null
    group by item_id
  ) l
  where i.id = l.item_id and i.stock is not null;
end;
$$;
revoke all on function _move_order_stock(uuid, integer) from public, anon, authenticated;

create or replace function create_order(
  p_customer_id    uuid,
  p_lines          jsonb,
  p_delivery_paise integer default 0,
  p_discount_paise integer default 0,
  p_notes          text default null,
  p_due_date       date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := public.get_my_business_id();
  v_order uuid;
  v_no integer;
begin
  if v_business is null then raise exception 'Not signed in to a business'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = v_business) then
    raise exception 'Customer not found';
  end if;

  -- One order number at a time per business
  perform pg_advisory_xact_lock(hashtext('order_no:' || v_business::text));
  select coalesce(max(order_no), 0) + 1 into v_no from public.orders where business_id = v_business;

  insert into public.orders (business_id, order_no, customer_id, delivery_paise, discount_paise, notes, due_date)
  values (v_business, v_no, p_customer_id,
          greatest(coalesce(p_delivery_paise, 0), 0), greatest(coalesce(p_discount_paise, 0), 0),
          nullif(btrim(coalesce(p_notes, '')), ''), p_due_date)
  returning id into v_order;

  perform public._write_order_lines(v_business, v_order, p_lines);
  return v_order;
end;
$$;
revoke all on function create_order(uuid, jsonb, integer, integer, text, date) from public, anon;
grant execute on function create_order(uuid, jsonb, integer, integer, text, date) to authenticated;

-- Stock is taken when an order is confirmed (or skips straight past it)
-- and returned when a confirmed order is cancelled.
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
  set status = p_status, stock_taken = v_order.stock_taken, updated_at = now()
  where id = p_order;
end;
$$;
revoke all on function set_order_status(uuid, text) from public, anon;
grant execute on function set_order_status(uuid, text) to authenticated;

create or replace function set_order_payment(p_order uuid, p_paid_paise integer)
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
  select coalesce((select sum(price_paise * qty) from public.order_items where order_id = o.id), 0)
         + o.delivery_paise - o.discount_paise
  into v_total
  from public.orders o
  where o.id = p_order and o.business_id = v_business;
  if not found then raise exception 'Order not found'; end if;

  update public.orders
  set paid_paise = v_paid,
      payment_status = case when v_paid <= 0 then 'pending'
                            when v_paid >= greatest(v_total, 0) then 'paid'
                            else 'partial' end,
      updated_at = now()
  where id = p_order;
end;
$$;
revoke all on function set_order_payment(uuid, integer) from public, anon;
grant execute on function set_order_payment(uuid, integer) to authenticated;

-- Replaces an order's lines and extras. Stock already taken is
-- returned and taken again for the new lines.
create or replace function update_order(
  p_order          uuid,
  p_lines          jsonb,
  p_delivery_paise integer,
  p_discount_paise integer,
  p_notes          text,
  p_due_date       date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := public.get_my_business_id();
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
  where id = p_order and business_id = v_business
  for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'Delivered or cancelled orders cannot be edited';
  end if;

  if v_order.stock_taken then perform public._move_order_stock(p_order, 1); end if;
  delete from public.order_items where order_id = p_order;
  perform public._write_order_lines(v_business, p_order, p_lines);
  if v_order.stock_taken then perform public._move_order_stock(p_order, -1); end if;

  update public.orders
  set delivery_paise = greatest(coalesce(p_delivery_paise, 0), 0),
      discount_paise = greatest(coalesce(p_discount_paise, 0), 0),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      due_date = p_due_date,
      updated_at = now()
  where id = p_order;

  -- The total may have changed, so work out paid / partial again
  perform public.set_order_payment(p_order, v_order.paid_paise);
end;
$$;
revoke all on function update_order(uuid, jsonb, integer, integer, text, date) from public, anon;
grant execute on function update_order(uuid, jsonb, integer, integer, text, date) to authenticated;
