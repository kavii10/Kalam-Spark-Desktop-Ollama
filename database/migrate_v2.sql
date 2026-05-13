-- ============================================================
-- Kalam Spark — Migration v2
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- STEP 1: Add missing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS education_level      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_board         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_or_semester    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS college_name         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS study_hours_per_day  INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_year          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city                 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS motivation           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rewards              JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings             JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS file_speaker_data    JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linked_subject TEXT;

-- STEP 2: Fix corrupted rows where onboarding_complete got reset to false
-- This fixes any user who has a dream set (they clearly completed onboarding)
UPDATE users
SET onboarding_complete = TRUE
WHERE dream IS NOT NULL AND dream != '' AND onboarding_complete = FALSE;

-- STEP 3 (optional): Verify the fix worked
-- SELECT id, name, email, dream, onboarding_complete FROM users;
