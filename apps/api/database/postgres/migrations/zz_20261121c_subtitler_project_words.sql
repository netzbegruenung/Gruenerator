-- Word timings of a subtitler project ([{word,start,end}], seconds from the
-- start of the original video). The video editor splits them into captions
-- when a project is opened there via „Bearbeiten“. NULL for projects saved
-- before this column; the hand-off then spreads each segment's words evenly.
ALTER TABLE subtitler_projects ADD COLUMN IF NOT EXISTS words JSONB;
