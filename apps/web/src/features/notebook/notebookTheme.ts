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

// 2a content card: white, soft green-tinted border, 14px radius. Dark mode
// sits on the wine-red NOTEBOOK_MAGENTA_BG, so it uses the gallery card's wine tones.
export const NOTEBOOK_CARD = cn(
  'rounded-[14px] bg-white dark:bg-[#2A1B24]',
  'border border-[rgba(82,144,122,0.18)] dark:border-[#4A2A3B]',
  'shadow-[0_4px_14px_rgba(31,63,51,0.05)]'
);
export const NOTEBOOK_TEXT_STRONG = 'text-[#22382E] dark:text-[#F3E8EE]';
export const NOTEBOOK_TEXT_MUTED = 'text-[#5C6B63] dark:text-[#C9B3BF]';
/** Data marks — validated for 3:1 against the card surfaces in both modes. */
export const NOTEBOOK_MARK = 'bg-[#D6006E] dark:bg-[#E0418A]';

// Notebook magenta for text and marks on the page itself (not the composer):
// changed search controls and the query-term underline in hit snippets.
// #B4005C on white is 6.9:1, #F2A9CE on the dark surface 9.4:1.
export const NOTEBOOK_ACCENT_TEXT = 'text-[#B4005C] dark:text-[#F2A9CE]';
export const NOTEBOOK_SNIPPET_MARKS =
  '[&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-foreground [&_mark]:shadow-[inset_0_-0.4em_0_#F5CFE2] dark:[&_mark]:shadow-[inset_0_-0.4em_0_#5A2740]';

// Relevant passages in the document reader: a tint behind the sentence, the
// active one deeper. Text stays `foreground` on both (light ≥ 12:1, dark ≥ 9:1).
export const NOTEBOOK_PASSAGE = 'bg-[#FCEAF3] dark:bg-[#3A1828]';
export const NOTEBOOK_PASSAGE_ACTIVE = 'bg-[#F5CFE2] dark:bg-[#5A2740]';
