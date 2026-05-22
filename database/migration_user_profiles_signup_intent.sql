-- Add signup_intent to user_profiles so we can route new users to a
-- persona-appropriate landing page after signup, and later personalize
-- the home page. Validation is enforced at the application layer to
-- keep adding new personas cheap.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS signup_intent VARCHAR(20) NULL;
