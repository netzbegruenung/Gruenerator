import { describe, it, expect } from 'vitest';

import {
  findEmptySlides,
  parsePresentationStructure,
  PRESENTATION_TOOL_SCHEMA,
} from './PresentationGenerationService.js';

/**
 * B5: a deck shipped with a visually empty comparison slide and reported plain
 * success. The generator KNEW — it wrote the gap into the speaker notes, where
 * nobody looks until they are standing in front of the room.
 *
 * Two layers are pinned here: the tool schema stops the model at the boundary
 * (as the document and sheet schemas already did), and `findEmptySlides` feeds
 * the survivors back as a validation error so the repair attempt fills them.
 */
describe('findEmptySlides', () => {
  const deck = (slides: Array<Record<string, unknown>>): string =>
    JSON.stringify({ title: 'Deck', slides });

  it('names a content slide that was announced and left blank', () => {
    const parsed = parsePresentationStructure(
      deck([
        { layout: 'content', title: 'Ausgangslage', body: '- Punkt eins\n- Punkt zwei' },
        { layout: 'split', title: 'Vergleich DE / AT', body: '', notes: 'Hier fehlen mir Daten.' },
      ])
    );
    expect(parsed).not.toBeNull();
    expect(findEmptySlides(parsed!)).toEqual(['Vergleich DE / AT']);
  });

  it('counts whitespace as empty', () => {
    const parsed = parsePresentationStructure(
      deck([{ layout: 'content', title: 'Leer', body: '   \n  ' }])
    );
    expect(findEmptySlides(parsed!)).toEqual(['Leer']);
  });

  it('leaves layouts alone whose body is legitimately empty', () => {
    // A title slide is a title; an image slide is carried by the picture.
    const parsed = parsePresentationStructure(
      deck([
        { layout: 'title', title: 'Windkraft in Österreich', body: '' },
        { layout: 'image', title: 'Standort Parndorf', body: '' },
      ])
    );
    expect(findEmptySlides(parsed!)).toEqual([]);
  });

  it('treats an empty quote as broken — the body IS the quote', () => {
    const parsed = parsePresentationStructure(
      deck([{ layout: 'quote', title: 'Zitat', body: '' }])
    );
    expect(findEmptySlides(parsed!)).toEqual(['Zitat']);
  });

  it('reports a full deck as clean', () => {
    const parsed = parsePresentationStructure(
      deck([
        { layout: 'title', title: 'Titel', body: '' },
        { layout: 'content', title: 'Inhalt', body: '- etwas' },
        { layout: 'split', title: 'Vergleich', body: 'links | rechts' },
      ])
    );
    expect(findEmptySlides(parsed!)).toEqual([]);
  });
});

describe('PRESENTATION_TOOL_SCHEMA', () => {
  it('requires a non-empty body, like the document and sheet schemas', () => {
    const slides = (PRESENTATION_TOOL_SCHEMA as { properties: Record<string, unknown> }).properties[
      'slides'
    ] as { items: { properties: Record<string, { minLength?: number }> } };
    expect(slides.items.properties['body']?.minLength).toBe(1);
  });
});
