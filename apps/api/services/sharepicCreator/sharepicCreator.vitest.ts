import { readdirSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sharepicSpecSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { hasStockPhoto, searchStockPhotos } from './catalog.js';
import { validateDraft } from './draftAgent.js';
import {
  basicsText,
  chapterText,
  examplesText,
  loadExamples,
  STYLEGUIDE_CHAPTERS,
  systemPrompt,
} from './styleguide.js';

describe('catalog', () => {
  it('finds stock photos by English tags', () => {
    const hits = searchStockPhotos('train travel');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].tags).toContain('train');
    expect(hasStockPhoto(hits[0].filename)).toBe(true);
    expect(hasStockPhoto('nope.jpg')).toBe(false);
  });
});

describe('styleguide', () => {
  const dir = path.join(
    dirname(fileURLToPath(import.meta.url)),
    '../../prompts/sharepic-creator/kapitel'
  );

  it('has a file for every catalog chapter and no orphans', () => {
    const files = readdirSync(dir).map((f) => f.replace(/\.md$/, ''));
    for (const chapter of Object.keys(STYLEGUIDE_CHAPTERS)) {
      expect(files).toContain(chapter);
      expect(chapterText(chapter as keyof typeof STYLEGUIDE_CHAPTERS).length).toBeGreaterThan(50);
    }
    const known = [...Object.keys(STYLEGUIDE_CHAPTERS), 'grundlagen-de', 'grundlagen-at'];
    expect(files.filter((f) => !known.includes(f))).toEqual([]);
  });

  it('fills every placeholder and forks for Austria', () => {
    for (const locale of ['de-DE', 'de-AT'] as const) {
      expect(systemPrompt(locale)).not.toMatch(/\{\{/);
    }
    expect(systemPrompt('de-AT')).toContain('Österreich');
    expect(basicsText('de-AT')).toContain('Keine Balken');
  });

  it('ships examples that are valid specs once a photo is filled in', () => {
    const photo = searchStockPhotos('nature')[0].filename;
    for (const example of loadExamples()) {
      const spec = JSON.parse(JSON.stringify(example.spec).replaceAll('<foto>', photo)) as object;
      const parsed = sharepicSpecSchema.safeParse({ ...spec, locale: example.land });
      expect(parsed.success, `${example.id}: ${parsed.success ? '' : parsed.error.message}`).toBe(
        true
      );
    }
  });

  it('picks examples of the own country first', () => {
    const at = examplesText('de-AT', ['zitat']);
    expect(at).toContain('@diegruenen');
    expect(at).not.toContain('@die_gruenen');
    expect(examplesText('de-DE', [])).toBe('');
  });
});

describe('validateDraft', () => {
  const slide = {
    background: { kind: 'farbe', color: 'tanne' },
    position: 'mitte',
    align: 'zentriert',
    items: [{ type: 'headline', lines: ['Mehr Bus', 'für alle'], akzent: 1 }],
    logo: true,
  };
  const ok = { slides: [slide] };
  const withSlide = (patch: object) => ({ slides: [{ ...slide, ...patch }] });

  it('accepts a valid draft and sets the locale', () => {
    const result = validateDraft(ok, 'de-DE', 'Bus');
    expect(result.ok && result.value.locale).toBe('de-DE');
  });

  it('rejects colours of the other country and photos that do not exist', () => {
    expect(validateDraft(ok, 'de-AT', 'x').ok).toBe(false);
    const photo = validateDraft(
      withSlide({ background: { kind: 'foto', filename: 'erfunden.jpg', textSeite: 'unten' } }),
      'de-DE',
      'x'
    );
    expect(!photo.ok && photo.error).toContain('erfunden.jpg');
  });

  it('rejects a second headline and an accent outside the lines', () => {
    expect(
      validateDraft(withSlide({ items: [slide.items[0], slide.items[0]] }), 'de-DE', 'x').ok
    ).toBe(false);
    const accent = withSlide({ items: [{ type: 'headline', lines: ['Bus'], akzent: 3 }] });
    expect(validateDraft(accent, 'de-DE', 'x').ok).toBe(false);
  });

  it('rejects contact data the request never mentioned', () => {
    const withUrl = withSlide({
      items: [...slide.items, { type: 'button', text: 'www.gruene.de' }],
    });
    expect(validateDraft(withUrl, 'de-DE', 'Mitglieder').ok).toBe(false);
    expect(validateDraft(withUrl, 'de-DE', 'Link: www.gruene.de').ok).toBe(true);
  });

  it('rejects numbers the request never gave, on any slide', () => {
    const deck = {
      slides: [
        slide,
        {
          ...slide,
          items: [{ type: 'absatz', text: 'Ein Platz kostet über 3.300 Euro im Monat.' }],
        },
      ],
    };
    const invented = validateDraft(deck, 'de-DE', 'Pflege ist zu teuer');
    expect(!invented.ok && invented.error).toContain('Slide 2');
    expect(validateDraft(deck, 'de-DE', 'Pflegeheim: 3300 € im Monat').ok).toBe(true);
  });

  it('wants figures large in a carousel, not in small text', () => {
    const deck = {
      slides: [slide, { ...slide, items: [{ type: 'text', text: '33 % beim Obst' }] }],
    };
    const small = validateDraft(deck, 'de-DE', 'Ausfälle: 33 % beim Obst');
    expect(!small.ok && small.error).toContain('zu klein');
    expect(validateDraft({ slides: [deck.slides[1]] }, 'de-DE', '33 % beim Obst').ok).toBe(true);
  });

  it('keeps line boxes to Germany', () => {
    expect(validateDraft(withSlide({ zeilenboxen: true }), 'de-DE', 'x').ok).toBe(true);
    expect(
      validateDraft(
        {
          slides: [
            { ...slide, background: { kind: 'farbe', color: 'dunkelgruen' }, zeilenboxen: true },
          ],
        },
        'de-AT',
        'x'
      ).ok
    ).toBe(false);
  });
});
