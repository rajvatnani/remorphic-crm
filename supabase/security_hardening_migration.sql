-- ============================================================
-- Remorphic CRM — Security Hardening Migration
-- Run this in Supabase SQL Editor AFTER online_booking_migration.sql
-- and BEFORE deploying the matching app code.
--
--  1. Locks booking_otps so only the server (service role) can touch it
--  2. Adds rate limiting + attempt limits to booking codes
--  3. Validates and creates online bookings atomically
--  4. Creates a business and its first member atomically (setup page)
--
-- Safe to run more than once.
-- ============================================================

-- ============================================================
-- 1. booking_otps: server-only
-- No RLS policies on purpose: the service role bypasses RLS,
-- every other role gets nothing.
-- ============================================================

alter table booking_otps enable row level security;
revoke all on table booking_otps from public, anon, authenticated;
grant  all on table booking_otps to service_role;

alter table booking_otps add column if not exists attempts    integer not null default 0;
alter table booking_otps add column if not exists consumed_at timestamptz;
alter table booking_otps add column if not exists ip_hash     text;

-- Codes were stored in plain text and live 10 minutes. From now on the
-- app stores a keyed hash in "code", so discard anything outstanding.
delete from booking_otps where length(code) < 64;

create index if not exists booking_otps_phone_created_idx
  on booking_otps(phone, created_at desc);
create index if not exists booking_otps_created_idx
  on booking_otps(created_at);

-- Used to decide whether a slot is already in the past.
alter table businesses add column if not exists timezone text not null default 'Asia/Kolkata';

-- ============================================================
-- 2. Request a booking code
-- Returns: ok | cooldown | limited | not_found
-- ============================================================

create or replace function request_booking_otp(
  p_business_id uuid,
  p_phone       text,
  p_code_hash   text,
  p_ip_hash     text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_hour_ago timestamptz := now() - interval '1 hour';
begin
  if not exists (
    select 1 from public.appointment_config where business_id = p_business_id
  ) then
    return 'not_found';
  end if;

  -- Serialize requests so parallel calls cannot slip past the limits
  perform pg_advisory_xact_lock(hashtext('request_booking_otp'));

  delete from public.booking_otps where created_at < now() - interval '1 day';

  if exists (
    select 1 from public.booking_otps
    where phone = p_phone and created_at > now() - interval '60 seconds'
  ) then
    return 'cooldown';
  end if;

  if (select count(*) from public.booking_otps
      where phone = p_phone and created_at > v_hour_ago) >= 5 then
    return 'limited';
  end if;

  -- Generous, because mobile carriers put many people behind one IP
  if p_ip_hash is not null
     and (select count(*) from public.booking_otps
          where ip_hash = p_ip_hash and created_at > v_hour_ago) >= 30 then
    return 'limited';
  end if;

  if (select count(*) from public.booking_otps
      where business_id = p_business_id and created_at > v_hour_ago) >= 200 then
    return 'limited';
  end if;

  insert into public.booking_otps (business_id, phone, code, ip_hash, expires_at)
  values (p_business_id, p_phone, p_code_hash, p_ip_hash, now() + interval '10 minutes');

  return 'ok';
end;
$$;

-- ============================================================
-- 3. Verify the code and create the booking, in one transaction
-- Returns: ok | no_code | expired | locked | incorrect
--          | closed | past | invalid_slot | full
-- The code is only consumed on success, so a customer whose slot was
-- just taken can pick another one without a new code.
-- ============================================================

create or replace function create_online_booking(
  p_business_id uuid,
  p_phone       text,
  p_code_hash   text,
  p_name        text,
  p_date        date,
  p_slot        time
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_otp         public.booking_otps%rowtype;
  v_config      public.appointment_config%rowtype;
  v_timezone    text;
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

  select timezone into v_timezone from public.businesses where id = p_business_id;
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

  select id, name into v_customer
  from public.customers
  where business_id = p_business_id and phone = p_phone
  order by created_at
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
    (business_id, customer_id, service, appointment_date, slot_time, status, notes)
  values
    (p_business_id, v_customer_id, 'Appointment', p_date, p_slot, 'pending', v_notes);

  update public.booking_otps set consumed_at = now() where id = v_otp.id;

  return 'ok';
end;
$$;

-- ============================================================
-- 4. Create a business together with its first member
-- security definer because business_users deliberately has no insert
-- policy: one would let any signed-in user join any business.
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
    v_slug := trim(both '-' from left(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), 40));
    v_slug := coalesce(nullif(v_slug, ''), 'book')
              || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.businesses
      (user_id, name, type, owner_name, phone, inactive_threshold_days, slug)
    values
      (v_user_id, trim(p_name), p_type, trim(p_owner_name), trim(p_phone),
       greatest(coalesce(p_inactive_threshold_days, 60), 1), v_slug)
    returning id into v_business_id;
  end if;

  insert into public.business_users (business_id, user_id, email)
  values (v_business_id, v_user_id, v_email);

  return v_business_id;
end;
$$;

-- ============================================================
-- Who may call what
-- Supabase grants execute on new functions to anon/authenticated by
-- default, so revoke explicitly.
-- ============================================================

revoke all on function request_booking_otp(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function request_booking_otp(uuid, text, text, text)
  to service_role;

revoke all on function create_online_booking(uuid, text, text, text, date, time)
  from public, anon, authenticated;
grant execute on function create_online_booking(uuid, text, text, text, date, time)
  to service_role;

revoke all on function create_business(text, text, text, text, integer)
  from public, anon;
grant execute on function create_business(text, text, text, text, integer)
  to authenticated;
