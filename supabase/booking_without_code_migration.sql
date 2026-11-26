-- ============================================================
-- Remorphic CRM — Booking Without Code Migration
-- Run this in Supabase SQL Editor after public_listing_migration.sql
-- and BEFORE deploying the matching app code.
--
-- Online booking no longer needs a WhatsApp code, and the phone number
-- is optional. Bookings still arrive as 'pending' for the business to
-- approve, so a wrong or missing number does no harm beyond that.
--
--  1. booking_requests: server-only log used to rate-limit bookings
--  2. book_online(): checks the slot and creates the booking
--
-- Safe to run more than once. The app version before this one keeps
-- calling create_online_booking, which is left in place, so bookings
-- keep working between running this file and deploying the code.
-- create_online_booking, request_booking_otp and booking_otps can be
-- dropped once the new code is live.
-- ============================================================

-- ============================================================
-- 1. Rate-limit log (replaces the limits the code request used to give)
-- ============================================================

create table if not exists booking_requests (
  id          uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  ip_hash     text,
  created_at  timestamptz default now() not null
);

alter table booking_requests enable row level security;
revoke all on table booking_requests from public, anon, authenticated;
grant  all on table booking_requests to service_role;

create index if not exists booking_requests_ip_created_idx
  on booking_requests(ip_hash, created_at desc);
create index if not exists booking_requests_business_created_idx
  on booking_requests(business_id, created_at desc);

-- ============================================================
-- 2. Create a booking
-- p_phone is '' when the customer gave no number. customers.phone is
-- not null, so '' is stored for them and nothing is sent to it.
-- Returns: ok | limited | closed | past | invalid_slot | full
-- ============================================================

create or replace function book_online(
  p_business_id        uuid,
  p_phone              text,
  p_name               text,
  p_date               date,
  p_slot               time,
  p_services           text[],
  p_payment_screenshot text,
  p_ip_hash            text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_config      public.appointment_config%rowtype;
  v_timezone    text;
  v_offered     text;
  v_service     text;
  v_offset_mins integer;
  v_customer    record;
  v_customer_id uuid;
  v_notes       text;
  v_hour_ago    timestamptz := now() - interval '1 hour';
begin
  p_phone := coalesce(p_phone, '');

  -- Serialize requests so parallel calls cannot slip past the limits
  perform pg_advisory_xact_lock(hashtext('book_online'));

  delete from public.booking_requests where created_at < now() - interval '1 day';

  -- Generous, because mobile carriers put many people behind one IP
  if p_ip_hash is not null
     and (select count(*) from public.booking_requests
          where ip_hash = p_ip_hash and created_at > v_hour_ago) >= 10 then
    return 'limited';
  end if;

  if (select count(*) from public.booking_requests
      where business_id = p_business_id and created_at > v_hour_ago) >= 100 then
    return 'limited';
  end if;

  select * into v_config from public.appointment_config where business_id = p_business_id;
  if not found then return 'closed'; end if;

  if not (extract(dow from p_date)::integer = any (v_config.open_days)) then
    return 'closed';
  end if;

  -- The slot must be one the booking page would actually offer
  v_offset_mins := (extract(epoch from p_slot) - extract(epoch from v_config.start_time))::integer / 60;
  if v_config.slot_duration <= 0
     or extract(second from p_slot) <> 0
     or p_slot <  v_config.start_time
     or p_slot >= v_config.end_time
     or v_offset_mins % v_config.slot_duration <> 0 then
    return 'invalid_slot';
  end if;

  select timezone, services_offered into v_timezone, v_offered
  from public.businesses where id = p_business_id;

  if p_date + p_slot <= (now() at time zone v_timezone) then
    return 'past';
  end if;

  -- Serialize bookings for this slot so it cannot be oversold
  perform pg_advisory_xact_lock(
    hashtext(p_business_id::text || p_date::text || p_slot::text)
  );

  if (select count(*) from public.appointments
      where business_id = p_business_id
        and appointment_date = p_date
        and slot_time = p_slot
        and status <> 'cancelled') >= v_config.max_per_slot then
    return 'full';
  end if;

  -- Keep only services the business really offers, in its own order
  select string_agg(trim(o.name), ', ' order by o.pos) into v_service
  from unnest(string_to_array(coalesce(v_offered, ''), ',')) with ordinality as o(name, pos)
  where trim(o.name) <> '' and trim(o.name) = any (coalesce(p_services, '{}'));

  -- With a number, reuse the customer who has it (older rows may lack a
  -- country code, so match on the last 10 digits). Without one, always
  -- add a new customer: names alone are not reliable enough to match.
  if p_phone <> '' then
    select id, name into v_customer
    from public.customers
    where business_id = p_business_id
      and right(regexp_replace(phone, '\D', '', 'g'), 10)
        = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
    order by (phone = p_phone) desc, created_at
    limit 1;
  end if;

  if p_phone <> '' and found then
    v_customer_id := v_customer.id;
    if lower(v_customer.name) <> lower(p_name) then
      v_notes := 'Booked online as: ' || p_name;
    end if;
  else
    insert into public.customers (business_id, name, phone)
    values (p_business_id, p_name, p_phone)
    returning id into v_customer_id;
  end if;

  insert into public.appointments
    (business_id, customer_id, service, appointment_date, slot_time, status, notes, payment_screenshot)
  values
    (p_business_id, v_customer_id, coalesce(v_service, 'Appointment'), p_date, p_slot,
     'pending', v_notes, p_payment_screenshot);

  insert into public.booking_requests (business_id, ip_hash)
  values (p_business_id, p_ip_hash);

  return 'ok';
end;
$$;

revoke all on function book_online(uuid, text, text, date, time, text[], text, text)
  from public, anon, authenticated;
grant execute on function book_online(uuid, text, text, date, time, text[], text, text)
  to service_role;
