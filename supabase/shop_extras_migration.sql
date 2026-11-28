-- ============================================================
-- Remorphic CRM — Shop Extras Migration
-- Run this in Supabase SQL Editor after items_details_migration.sql
-- and BEFORE deploying the matching app code.
--
-- Brings the rest of Remorphic Saathi's shop page across:
--  1. businesses: a one-line shop description, UPI ID (for a Pay by
--     UPI button with the amount filled in), delivery charges, and
--     whether sold-out items show in the shop
--  2. orders: city and pincode
--  3. place_shop_order2(): as place_shop_order, plus city, pincode and
--     the delivery charge. place_shop_order is left in place so the
--     app keeps working until the new code is live; it can be dropped
--     after that.
--
-- Safe to run more than once.
-- ============================================================

-- 1. Shop settings
alter table businesses add column if not exists shop_description          text;
alter table businesses add column if not exists upi_id                    text;
alter table businesses add column if not exists delivery_flat_paise       integer not null default 0;
alter table businesses add column if not exists free_delivery_above_paise integer;
alter table businesses add column if not exists show_sold_out             boolean not null default true;

alter table businesses drop constraint if exists businesses_upi_id_check;
alter table businesses add constraint businesses_upi_id_check
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,200}@[A-Za-z]{2,64}$');
alter table businesses drop constraint if exists businesses_delivery_check;
alter table businesses add constraint businesses_delivery_check
  check (delivery_flat_paise >= 0 and (free_delivery_above_paise is null or free_delivery_above_paise >= 0));

-- Re-apply the editable-columns rule for the new columns
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

-- 2. Where shop orders go
alter table orders add column if not exists city    text;
alter table orders add column if not exists pincode text;

-- 3. Placing a shop order, with delivery
create or replace function place_shop_order2(
  p_business_id uuid,
  p_name        text,
  p_phone       text,
  p_address     text,
  p_note        text,
  p_lines       jsonb,
  p_ip_hash     text,
  p_city        text,
  p_pincode     text
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
  v_subtotal integer;
  v_flat     integer;
  v_free     integer;
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

  -- Delivery: the flat charge, unless the order reaches the free-delivery amount.
  -- Orders to be collected (no address) pay no delivery.
  select coalesce(sum(i.price_paise * (v_wanted->>i.id::text)::integer), 0) into v_subtotal
  from public.items i
  where i.id in (select k::uuid from jsonb_object_keys(v_wanted) k);
  select delivery_flat_paise, free_delivery_above_paise into v_flat, v_free
  from public.businesses where id = p_business_id;

  insert into public.orders (business_id, order_no, customer_id, source, address, city, pincode, notes, ip_hash, delivery_paise)
  values (p_business_id, v_no, v_customer, 'shop',
          nullif(btrim(coalesce(p_address, '')), ''),
          nullif(left(btrim(coalesce(p_city, '')), 80), ''),
          nullif(left(regexp_replace(coalesce(p_pincode, ''), '\D', '', 'g'), 6), ''),
          nullif(btrim(coalesce(p_note, '')), ''),
          p_ip_hash,
          case
            when nullif(btrim(coalesce(p_address, '')), '') is null then 0
            when v_free is not null and v_subtotal >= v_free then 0
            else coalesce(v_flat, 0)
          end)
  returning id, public_token into v_order, v_token;

  insert into public.order_items (order_id, business_id, item_id, name, price_paise, cost_paise, qty)
  select v_order, p_business_id, i.id, i.name, i.price_paise, i.cost_paise, (v_wanted->>i.id::text)::integer
  from public.items i
  where i.id in (select k::uuid from jsonb_object_keys(v_wanted) k);

  return jsonb_build_object('result', 'ok', 'order_id', v_order, 'token', v_token, 'order_no', v_no);
end;
$$;

revoke all on function place_shop_order2(uuid, text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function place_shop_order2(uuid, text, text, text, text, jsonb, text, text, text) to service_role;
