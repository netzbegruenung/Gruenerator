-- Drop app_push_devices: push notifications were removed.
--
-- The rows are Expo push tokens — per-device identifiers of natural persons
-- that no code path reads any more. Keeping them would be storage without a
-- purpose, so the table goes rather than sitting inert.
--
-- create_app_push_devices.sql stays in place; the runner applies files in
-- name order and records them, so the CREATE runs before this DROP on a fresh
-- database and both are recorded on an existing one.

DROP TABLE IF EXISTS app_push_devices;
