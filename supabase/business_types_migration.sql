-- Create business_types lookup table
create table if not exists business_types (
  id text primary key,
  label text not null,
  customer_label text not null,
  inactive_threshold_days integer not null default 60,
  emoji text not null default '🏢'
);

-- Seed with the four built-in types
insert into business_types (id, label, customer_label, inactive_threshold_days, emoji) values
  ('clinic', 'Clinic / Healthcare', 'Patient', 90, '🏥'),
  ('salon', 'Salon / Beauty', 'Client', 45, '✂️'),
  ('gym', 'Gym / Fitness', 'Member', 30, '💪'),
  ('other', 'Other', 'Customer', 60, '🏢'),
  ('court', 'Court / Sports', 'Player', 30, '🏸')
on conflict (id) do nothing;

-- Add customer_label column to businesses
alter table businesses add column if not exists customer_label text not null default 'Customer';

-- Backfill customer_label for existing rows
update businesses set customer_label =
  case type
    when 'clinic' then 'Patient'
    when 'salon' then 'Client'
    when 'gym' then 'Member'
    else 'Customer'
  end;

-- Drop the hardcoded CHECK constraint so any type value is accepted
alter table businesses drop constraint if exists businesses_type_check;
