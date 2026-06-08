-- ============================================================
-- Remorphic CRM — Inactivity Threshold Migration
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- Lets each business configure how many days without a visit
-- before a customer is considered "inactive" (was a fixed
-- per-business-type constant before).
-- ============================================================

alter table businesses add column if not exists inactive_threshold_days integer not null default 60;

update businesses set inactive_threshold_days = case type
  when 'clinic' then 90
  when 'salon' then 45
  when 'gym' then 30
  else 60
end;
