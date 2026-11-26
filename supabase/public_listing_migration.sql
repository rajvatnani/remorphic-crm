-- ============================================================
-- Remorphic CRM — Public Listing Migration
-- Run this in Supabase SQL Editor after live_features_migration.sql
--
-- The IndorePickleball website (remorphic-website) lists pickleball
-- businesses using the public (anon) key. This keeps that working, and:
--
--  1. Stops signed-in CRM users also seeing every pickleball business,
--     which made the app pick the wrong business or send them to /setup
--  2. Lets the public key read only the columns the website shows
--
-- Safe to run more than once.
-- ============================================================

-- 1. The website reads as anon, which "public_pickleball_read" covers
drop policy if exists "Public can read pickleball businesses" on businesses;

-- 2. Column-level: RLS decides which rows, this decides which columns.
-- If the website starts showing another column, add it here.
revoke select on table businesses from anon;
grant  select (id, name, type, slug, address, phone, photo, price_per_slot, services_offered, maps_url)
  on table businesses to anon;
