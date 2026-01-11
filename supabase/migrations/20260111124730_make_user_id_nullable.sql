-- Make user_id nullable for testing without authentication
-- WARNING: This is for testing only. In production, user_id should be required and have FK constraint.

-- Drop foreign key constraints
alter table analysis_jobs drop constraint if exists analysis_jobs_user_id_fkey;
alter table product_inputs drop constraint if exists product_inputs_user_id_fkey;

-- Make user_id nullable
alter table analysis_jobs alter column user_id drop not null;
alter table product_inputs alter column user_id drop not null;
