-- ============================================================
-- Remorphic CRM — Customer Fields Migration
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- Adds optional gender and date of birth to customers
-- ============================================================

alter table customers add column if not exists gender text
  check (gender is null or gender in ('male', 'female', 'other'));

alter table customers add column if not exists dob date;
