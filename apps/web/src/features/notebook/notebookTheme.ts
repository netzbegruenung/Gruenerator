import { cn } from '@gruenerator/ui';

// Signature notebook gradient — pink radial (light) / dark wine-red radial (dark).
// Lives in its own leaf module so consumers (e.g. the eager WorkplacePage) can
// use the token without pulling the notebook chat surface into their chunk.
export const NOTEBOOK_MAGENTA_BG = cn(
  'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#F3CEE1_0%,#F9E4F0_55%,#FDF5FA_100%)]',
  'dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#4A1626_0%,#301019_55%,#1A0810_100%)]'
);
