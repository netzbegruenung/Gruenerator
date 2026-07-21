import { type Slide } from '@gruenerator/contracts';

import { newSlideId } from './ydocSchema.js';

/**
 * The two slides a fresh deck is seeded with (title + one content slide). Kept
 * tiny on purpose — the user builds from here, or the chat "create presentation"
 * flow seeds a full deck server-side instead.
 */
export function buildBlankDeckSlides(): Slide[] {
  return [
    {
      id: newSlideId(),
      layout: 'title',
      title: 'Neue Präsentation',
      body: '',
      notes: '',
      background: null,
      transition: null,
      fragments: false,
    },
    {
      id: newSlideId(),
      layout: 'content',
      title: 'Folie 2',
      body: '- Erster Punkt\n- Zweiter Punkt',
      notes: '',
      background: null,
      transition: null,
      fragments: false,
    },
  ];
}
