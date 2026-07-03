-- Tracks which login announcements each user has already received.
-- Lives separately from `notifications` because dismissing a notification
-- deletes its row — the delivery record must survive that, otherwise the
-- announcement is re-created on every login after a dismiss.
CREATE TABLE IF NOT EXISTS login_announcement_deliveries (
  user_id UUID NOT NULL,
  announcement_type TEXT NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_type)
);

-- Backfill users who still hold the (undismissed) notification so they are
-- not delivered again. Users who already dismissed it get it exactly one
-- more time, then never again.
INSERT INTO login_announcement_deliveries (user_id, announcement_type)
SELECT user_id, type FROM notifications WHERE type = 'new_avatars'
ON CONFLICT DO NOTHING;
