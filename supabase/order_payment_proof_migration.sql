-- ============================================================
-- Remorphic CRM — Order Payment Screenshot Migration
-- Run this in Supabase SQL Editor after categories_invoice_migration.sql
-- and BEFORE deploying the matching app code.
--
-- Customers can upload a payment screenshot on their order page.
-- The file goes in the private payment-screenshots bucket, uploaded by
-- the app's server only; this column keeps its path.
--
-- Safe to run more than once.
-- ============================================================

alter table orders add column if not exists payment_screenshot    text;
alter table orders add column if not exists payment_screenshot_at timestamptz;
