-- How much of a usage bucket its measured footprint actually covers.
--
-- A bucket sums every call of one user/day/feature/model, but only some calls
-- report an impact: Melious drops `environment_impact` on streamed responses.
-- Without these counts the read path had to treat a bucket with any measured
-- energy as fully measured, booking the unmeasured calls at zero energy (#3544).
-- Now it counts the measured part as measured and estimates only the rest.
--
-- Backfill: existing measured buckets keep the reading they had so far (fully
-- measured). Estimating their remainder now would double-count, since history
-- cannot tell which of its tokens the measurement covered.

ALTER TABLE user_usage_daily ADD COLUMN IF NOT EXISTS measured_requests INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_usage_daily ADD COLUMN IF NOT EXISTS measured_input_tokens BIGINT NOT NULL DEFAULT 0;

ALTER TABLE user_usage_daily ADD COLUMN IF NOT EXISTS measured_output_tokens BIGINT NOT NULL DEFAULT 0;

UPDATE user_usage_daily
SET measured_requests = requests,
    measured_input_tokens = input_tokens,
    measured_output_tokens = output_tokens
WHERE energy_wms > 0 AND measured_requests = 0;
