-- Give every existing share a deadline for its public /share/<token> link.
--
-- `expires_at` has existed since the (now removed) Wolke transfer feature, and
-- until this release only transfers ever carried a value: sharedMediaService's
-- four INSERTs left it NULL, and shareFileRouter read it behind a
-- `media_type === 'transfer'` guard. Every image and video share was therefore
-- permanent, with no way to revoke a link short of deleting the media.
--
-- `NOW() + 30 days`, deliberately NOT `created_at + 30 days`: backdating would
-- kill every live link the moment this migration runs. Measured on production
-- beforehand, only 369 images and 11 videos of 3051 ready rows had ever been
-- opened through their share page at all -- but "almost nobody" is not "nobody",
-- and a uniform grace period costs nothing and surprises no one.
--
-- This expires LINKS, NOT BYTES. Nothing here or downstream deletes a row or a
-- file; the owner keeps every item in their Mediathek and still opens its share
-- page. Auto-deleting media was removed on purpose in #2980 and stays removed.
--
-- Idempotent: only NULLs are touched, so a re-run cannot push a deadline
-- forward. Rows created after deploy get their value from the INSERT instead.
UPDATE shared_media
   SET expires_at = NOW() + INTERVAL '30 days'
 WHERE expires_at IS NULL;
