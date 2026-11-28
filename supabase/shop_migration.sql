-- ============================================================
-- Remorphic CRM — Shop Link Migration
-- Run this in Supabase SQL Editor after orders_migration.sql
-- and BEFORE deploying the matching app code.
--
-- A public shop page at /shop/<slug> where customers see items and
-- order without logging in. Orders arrive as 'new' for the business
-- to confirm; stock is taken only when it does.
--
--  1. businesses.shop_enabled: the shop link is off until switched on
--  2. items.photo_url
--  3. orders: link token, source, delivery address
--  4. place_shop_order(): server-only, checks stock and limits
--
-- Safe to run more than once.
-- ============================================================

-- 1. Shop switch
alter table businesses add column if not exists shop_enabled boolean not null default false;

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

-- 2. One photo per item (public URL in the business-photos bucket)
alter table items add column if not exists photo_url text;

-- 3. Orders placed from the shop
alter table orders add column if not exists public_token text;
update orders set public_token = replace(gen_random_uuid()::text, '-', '') where public_token is null;
alter table orders alter column public_token set default replace(gen_random_uuid()::text, '-', '');
alter table orders alter column public_token set not null;
create unique index if not exists orders_public_token_idx on orders(public_token);

alter table orders add column if not exists source  text not null default 'staff';
alter table orders add column if not exists address text;
alter table orders add column if not exists ip_hash text;
alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check check (source in ('staff', 'shop'));

create index if not exists orders_shop_limit_idx on orders(business_id, created_at desc) where source = 'shop';

-- ============================================================
-- 4. Place an order from the shop. Service role only: the app's
-- server calls it after checking the request.
-- p_lines: [{"item_id": uuid, "qty": int}] — prices come from items.
-- Returns {"result": "ok", "order_id", "token", "order_no"} or
-- {"result": <code>, ...} with code one of:
--   closed | limited | empty | unavailable | stock (+ "item", "available")
-- ============================================================

create or replace function place_shop_order(
  p_business_id uuid,
  p_name        text,
  p_phone       text,
  p_address     text,
  p_note        text,
  p_lines       jsonb,
  p_ip_hash     text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_line     jsonb;
  v_item     public.items%rowtype;
  v_qty      integer;
  v_customer uuid;
  v_order    uuid;
  v_no       integer;
  v_token    text;
  v_wanted   jsonb := '{}'::jsonb;
  v_id       text;
begin
  if not exists (select 1 from public.businesses
                 where id = p_business_id and orders_enabled and shop_enabled) then
    return jsonb_build_object('result', 'closed');
  end if;

  -- Serialize per business so limits and stock checks hold
  perform pg_advisory_xact_lock(hashtext('order_no:' || p_business_id::text));

  if (select count(*) from public.orders o join public.customers c on c.id = o.customer_id
      where o.business_id = p_business_id and o.source = 'shop'
        and right(regexp_replace(c.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
        and o.created_at > now() - interval '10 minutes') >= 5
     or (p_ip_hash is not null and (select count(*) from public.orders
         where business_id = p_business_id and source = 'shop' and ip_hash = p_ip_hash
           and created_at > now() - interval '1 hour') >= 20)
     or (select count(*) from public.orders
         where business_id = p_business_id and source = 'shop'
           and created_at > now() - interval '1 hour') >= 200 then
    return jsonb_build_object('result', 'limited');
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 50 then
    return jsonb_build_object('result', 'empty');
  end if;

  -- Add up quantities per item (the same item may appear twice)
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'qty')::integer;
    v_id := v_line->>'item_id';
    if v_qty is null or v_qty <= 0 or v_qty > 1000 or v_id is null then
      return jsonb_build_object('result', 'empty');
    end if;
    v_wanted := jsonb_set(v_wanted, array[v_id], to_jsonb(coalesce((v_wanted->>v_id)::integer, 0) + v_qty));
  end loop;

  -- Every item must be on sale here, with enough stock
  for v_id in select jsonb_object_keys(v_wanted) loop
    select * into v_item from public.items
    where id = v_id::uuid and business_id = p_business_id and active;
    if not found then
      return jsonb_build_object('result', 'unavailable');
    end if;
    if v_item.stock is not null and v_item.stock < (v_wanted->>v_id)::integer then
      return jsonb_build_object('result', 'stock', 'item', v_item.name, 'available', greatest(v_item.stock, 0));
    end if;
  end loop;

  -- Customers don't log in: the mobile number (last 10 digits) identifies them
  select id into v_customer from public.customers
  where business_id = p_business_id
    and right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  order by (phone = p_phone) desc, created_at
  limit 1;
  if not found then
    insert into public.customers (business_id, name, phone)
    values (p_business_id, p_name, p_phone)
    returning id into v_customer;
  end if;

  select coalesce(max(order_no), 0) + 1 into v_no from public.orders where business_id = p_business_id;

  insert into public.orders (business_id, order_no, customer_id, source, address, notes, ip_hash)
  values (p_business_id, v_no, v_customer, 'shop',
          nullif(btrim(coalesce(p_address, '')), ''),
          nullif(btrim(coalesce(p_note, '')), ''),
          p_ip_hash)
  returning id, public_token into v_order, v_token;

  insert into public.order_items (order_id, business_id, item_id, name, price_paise, cost_paise, qty)
  select v_order, p_business_id, i.id, i.name, i.price_paise, i.cost_paise, (v_wanted->>i.id::text)::integer
  from public.items i
  where i.id in (select k::uuid from jsonb_object_keys(v_wanted) k);

  return jsonb_build_object('result', 'ok', 'order_id', v_order, 'token', v_token, 'order_no', v_no);
end;
$$;

revoke all on function place_shop_order(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function place_shop_order(uuid, text, text, text, text, jsonb, text) to service_role;
