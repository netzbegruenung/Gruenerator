-- Per-member notification mute for groups. When a member toggles "mute" from
-- the group's 3-dot menu, their email + push notifications for that group are
-- suppressed (in-app notifications still appear). Defaults to false so existing
-- members keep receiving notifications unchanged.

ALTER TABLE group_memberships ADD COLUMN IF NOT EXISTS notifications_muted BOOLEAN NOT NULL DEFAULT FALSE;
