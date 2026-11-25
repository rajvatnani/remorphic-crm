-- ============================================================
-- Remorphic CRM — Live Features Migration
-- Run this in Supabase SQL Editor AFTER member_removal_migration.sql
-- and BEFORE deploying the matching app code.
--
--  1. Online bookings keep services and payment screenshots
--  2. Customers are matched by the last 10 digits of their phone
--  3. New businesses get their label from business_types
--
-- Safe to run more than once. The version of the app that was live on
-- 2026-11-25 does not call these functions, so it keeps working.
-- ============================================================

-- Already present on the live database; here for new installs
alter table appointments add column if not exists payment_screenshot text;
alter table businesses   add column if not exists services_offered   text;
alter table businesses   add column if not exists customer_label     text not null default 'Customer';

-- ============================================================
-- 1 + 2. Verify the code and create the booking, in one transaction
-- Replaces the 6-argument version from security_hardening_migration.sql
-- Returns: ok | no_code | expired | locked | incorrect
--          | closed | past | invalid_slot | full
-- ============================================================

drop function if exists create_online_booking(uuid, text, text, text, date, time);

create or replace function create_online_booking(
  p_business_id        uuid,
  p_phone              text,
  p_code_hash          text,
  p_name               text,
  p_date               date,
  p_slot               time,
  p_services           text[],
  p_payment_screenshot text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_otp         public.booking_otps%rowtype;
  v_config      public.appointment_config%rowtype;
  v_timezone    text;
  v_offered     text;
  v_service     text;
  v_offset_mins integer;
  v_customer    record;
  v_customer_id uuid;
  v_notes       text;
begin
  -- Only the most recent code for this phone + business is valid
  select * into v_otp
  from public.booking_otps
  where phone = p_phone and business_id = p_business_id
  order by created_at desc
  limit 1
  for update;

  if not found or v_otp.consumed_at is not null then return 'no_code'; end if;
  if v_otp.expires_at < now()                   then return 'expired'; end if;
  if v_otp.attempts >= 5                        then return 'locked';  end if;

  if v_otp.code <> p_code_hash then
    update public.booking_otps set attempts = attempts + 1 where id = v_otp.id;
    return case when v_otp.attempts + 1 >= 5 then 'locked' else 'incorrect' end;
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

  -- Older rows may lack a country code, so match on the last 10 digits
  select id, name into v_customer
  from public.customers
  where business_id = p_business_id
    and right(regexp_replace(phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  order by (phone = p_phone) desc, created_at
  limit 1;

  if found then
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

  update public.booking_otps set consumed_at = now() where id = v_otp.id;

  return 'ok';
end;
$$;

revoke all on function create_online_booking(uuid, text, text, text, date, time, text[], text)
  from public, anon, authenticated;
grant execute on function create_online_booking(uuid, text, text, text, date, time, text[], text)
  to service_role;

-- ============================================================
-- 3. Create a business together with its first member
-- Same signature as before; now also sets customer_label.
-- ============================================================

create or replace function create_business(
  p_name                    text,
  p_type                    text,
  p_owner_name              text,
  p_phone                   text,
  p_inactive_threshold_days integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_email       text;
  v_business_id uuid;
  v_label       text;
  v_slug        text;
begin
  if v_user_id is null then
    raise exception 'Not signed in';
  end if;

  -- Already a member (e.g. double submit): nothing to create
  select business_id into v_business_id
  from public.business_users where user_id = v_user_id;
  if found then return v_business_id; end if;

  if trim(coalesce(p_name, '')) = ''
     or trim(coalesce(p_owner_name, '')) = ''
     or trim(coalesce(p_phone, '')) = '' then
    raise exception 'Business name, owner name and phone are required';
  end if;

  select lower(coalesce(email, '')) into v_email from auth.users where id = v_user_id;

  -- A business left over from an earlier failed setup: just link it
  select id into v_business_id from public.businesses where user_id = v_user_id;

  if not found then
    select customer_label into v_label from public.business_types where id = p_type;
    if not found then raise exception 'Unknown business type'; end if;

    v_slug := trim(both '-' from left(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), 40));
    v_slug := coalesce(nullif(v_slug, ''), 'book')
              || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.businesses
      (user_id, name, type, owner_name, phone, inactive_threshold_days, customer_label, slug)
    values
      (v_user_id, trim(p_name), p_type, trim(p_owner_name), trim(p_phone),
       greatest(coalesce(p_inactive_threshold_days, 60), 1), v_label, v_slug)
    returning id into v_business_id;
  end if;

  insert into public.business_users (business_id, user_id, email)
  values (v_business_id, v_user_id, v_email);

  return v_business_id;
end;
$$;
