/**
 * One grid for every section of the Arbeiten tab, so card edges line up from
 * „Zuletzt" down to the tool cards: 2 columns on phones, 3 on tablets, 5 on desktop.
 */
export const ARBEITEN_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 lg:gap-4';

/** The quiet text action beside a section title („Ganzes Briefing", „Neu erstellen" …). */
export const SECTION_LINK =
  // `touch-target`: the text is 20 px tall, a finger gets the 44 px it needs.
  'touch-target text-sm font-semibold text-primary-600 no-underline hover:underline dark:text-primary-400';
