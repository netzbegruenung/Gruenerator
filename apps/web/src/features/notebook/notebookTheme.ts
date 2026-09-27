import { cn } from '@gruenerator/ui';

import '../workplace/workplace-sunrise.css';

// Signature notebook gradient — pink radial (light) / dark wine-red radial (dark).
// Lives in its own leaf module so consumers (e.g. the eager WorkplacePage) can
// use the token without pulling the notebook chat surface into their chunk.
export const NOTEBOOK_MAGENTA_BG = cn(
  'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#FBEDF4_0%,#FDF6FA_55%,#FFFFFF_100%)]',
  'dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#281019_0%,#1C0C12_55%,#14090E_100%)]'
);

// Re-points the primary token inside the notebook composer to the notebook
// magenta (same colours as the omni composer's submit), via the accent scope the
// Workplace and chat surfaces already use — see `.workplace-chat-accent`.
export const NOTEBOOK_COMPOSER_ACCENT =
  'workplace-chat-accent [--wp-accent:#D6006E] [--wp-accent-hover:#B4005C]';
