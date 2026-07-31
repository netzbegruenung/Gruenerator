-- Measured environmental footprint per usage bucket.
--
-- Only GreenPT reports this (an `impact` object on every chat/embeddings
-- response); the other providers leave both columns at 0 and the read path
-- estimates from the token counts instead. Units are GreenPT's own so the
-- stored value stays an exact integer copy of what the API returned:
--   energy_wms   watt-milliseconds  (1 Wh = 3_600_000 Wms)
--   emissions_ug micrograms CO2e    (1 g  = 1_000_000 ug)
--
-- Named to sort after create_user_usage_daily.sql so the ALTERs always land on
-- an existing table on a fresh database.

ALTER TABLE user_usage_daily ADD COLUMN IF NOT EXISTS energy_wms BIGINT NOT NULL DEFAULT 0;

ALTER TABLE user_usage_daily ADD COLUMN IF NOT EXISTS emissions_ug BIGINT NOT NULL DEFAULT 0;
