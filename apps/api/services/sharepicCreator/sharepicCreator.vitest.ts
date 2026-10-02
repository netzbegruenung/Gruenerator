import { readdirSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  sharepicSpecSchema,
  tightenAccentMarks,
  tightenAccentMarksDeep,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { hasStockPhoto, searchStockPhotos } from './catalog.js';
import { namesSpeaker, validateDraft } from './draftAgent.js';
import { validateReview } from './review.js';
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

  it('returns nothing when only alt texts or word fragments match', () => {
    // "pub" is a fragment of the tag "public-transport", "table" of "vegetables".
    expect(searchStockPhotos('Austrian pub')).toEqual([]);
    expect(searchStockPhotos('people talking table')).toEqual([]);
    // "city" only occurs in alt texts.
    expect(searchStockPhotos('Linz city')).toEqual([]);
  });

  it('keeps tag and plural matches', () => {
    expect(searchStockPhotos('city trees')[0].tags).toContain('trees');
    const bike = searchStockPhotos('bicycle lane city')[0].tags;
    expect(bike.some((t) => /bicycle|bike/.test(t))).toBe(true);
  });

  it('accepts two distinct alt-text words as a fit', () => {
    const hits = searchStockPhotos('dry cracked earth');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].tags).toContain('drought');
    expect(searchStockPhotos('asphalt construction')).toEqual([]);
    expect(searchStockPhotos('Kassel city')).toEqual([]);
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

describe('accent marks', () => {
  it('tightens whitespace inside a pair, on either side or both', () => {
    expect(tightenAccentMarks('Mach mit! ==Jetzt ==')).toBe('Mach mit! ==Jetzt==');
    expect(tightenAccentMarks('== Jetzt==')).toBe('==Jetzt==');
    expect(tightenAccentMarks('==  Jetzt  ==')).toBe('==Jetzt==');
  });

  it('handles several pairs and leaves clean or unmarked text alone', () => {
    expect(tightenAccentMarks('== a == und == b ==')).toBe('==a== und ==b==');
    expect(tightenAccentMarks('==a== b')).toBe('==a== b');
    expect(tightenAccentMarks('Kein Akzent')).toBe('Kein Akzent');
  });

  it('keeps an unpaired == as it is', () => {
    expect(tightenAccentMarks('Nur ==offen')).toBe('Nur ==offen');
    expect(tightenAccentMarks('== a == und ==b')).toBe('==a== und ==b');
  });

  it('walks nested spec fields', () => {
    const out = tightenAccentMarksDeep({
      slides: [{ items: [{ type: 'liste', items: ['== x =='] }], stoerer: { text: '==y ==' } }],
    });
    expect(out.slides[0].items[0]).toEqual({ type: 'liste', items: ['==x=='] });
    expect(out.slides[0].stoerer.text).toBe('==y==');
  });

  const slide = {
    background: { kind: 'farbe', color: 'tanne' },
    position: 'mitte',
    align: 'zentriert',
    logo: true,
  };

  it('repairs a spaced closing mark in a drafted spec', () => {
    const spec = {
      slides: [
        {
          ...slide,
          items: [{ type: 'absatz', text: 'Am Sonntag wählen wir. ==Mach mit! ==' }],
        },
      ],
    };
    const result = validateDraft(spec, 'de-DE', 'x');
    expect(result.ok && result.value.slides[0].items[0]).toMatchObject({
      text: 'Am Sonntag wählen wir. ==Mach mit!==',
    });
  });

  it('rejects an unpaired == with a repair message', () => {
    const result = validateDraft(
      { slides: [{ ...slide, items: [{ type: 'absatz', text: 'Mach ==mit' }] }] },
      'de-DE',
      'x'
    );
    expect(!result.ok && result.error).toContain('==Wort==');
  });

  it('tightens marks in review patch ops', () => {
    const result = validateReview(
      { ok: false, issues: [], patch: [{ op: 'set_text', item: 0, text: 'Los ==jetzt ==' }] },
      [1]
    );
    expect(result.ok && result.value.patch[0]).toMatchObject({ text: 'Los ==jetzt==' });
  });

  it('rejects an unpaired == in review patch ops', () => {
    for (const op of [
      { op: 'set_text', item: 0, text: 'Mach ==mit' },
      { op: 'set_headline', lines: ['Mach', '==mit'] },
    ]) {
      const result = validateReview({ ok: false, issues: [], patch: [op] }, [1]);
      expect(!result.ok && result.error).toContain('==Wort==');
    }
  });
});

describe('quotes keep their speaker', () => {
  const quoteBrief =
    'Zitat unserer Spitzenkandidatin Sabine Moser: „Wer heute beim Klimaschutz spart, zahlt morgen doppelt.“';
  const base = {
    background: { kind: 'farbe', color: 'tanne' },
    position: 'mitte',
    align: 'links',
    logo: true,
  };
  const headlineDraft = {
    slides: [
      {
        ...base,
        items: [{ type: 'headline', lines: ['Wer heute spart,', 'zahlt morgen doppelt'] }],
      },
    ],
  };
  const quoteDraft = (name: string) => ({
    slides: [
      {
        ...base,
        items: [
          {
            type: 'zitat',
            text: 'Wer heute beim **Klimaschutz** spart, zahlt morgen doppelt.',
            name,
          },
        ],
      },
    ],
  });

  it('rejects a headline draft when the brief is a quote', () => {
    const result = validateDraft(headlineDraft, 'de-DE', quoteBrief);
    expect(!result.ok && result.error).toContain('zitat');
    const at = validateDraft(
      {
        slides: [
          { ...headlineDraft.slides[0], background: { kind: 'farbe', color: 'dunkelgruen' } },
        ],
      },
      'de-AT',
      quoteBrief
    );
    expect(!at.ok && at.error).toContain('zitat');
  });

  it('accepts a zitat with the named speaker and rejects an invented name', () => {
    expect(validateDraft(quoteDraft('Sabine Moser'), 'de-DE', quoteBrief).ok).toBe(true);
    const invented = validateDraft(quoteDraft('Anna Muster'), 'de-DE', quoteBrief);
    expect(!invented.ok && invented.error).toContain('Anna Muster');
  });

  it('does not demand a zitat when the quote has no named speaker', () => {
    for (const brief of [
      'Zitat: „Klimaschutz ist Heimatschutz.“',
      'Zitat unserer Bürgermeisterin: „Klimaschutz ist Heimatschutz.“',
    ]) {
      expect(validateDraft(headlineDraft, 'de-DE', brief).ok).toBe(true);
    }
  });

  it('does not mistake German nouns for a speaker', () => {
    for (const brief of [
      'Neues Sharepic mit Zitat: „Klimaschutz ist Heimatschutz, jeden Tag.“',
      'Zitat zur Grünen Woche: „Klimaschutz ist Heimatschutz, jeden Tag.“',
    ]) {
      expect(namesSpeaker(brief)).toBe(false);
      expect(validateDraft(headlineDraft, 'de-DE', brief).ok).toBe(true);
    }
  });

  it('finds a speaker before the colon or after "von"', () => {
    expect(namesSpeaker('Sabine Moser: „Klimaschutz ist Heimatschutz, jeden Tag.“')).toBe(true);
    expect(namesSpeaker(quoteBrief)).toBe(true);
    expect(namesSpeaker('Zitat von Lena Hoffmann: „Klimaschutz ist Heimatschutz.“')).toBe(true);
  });

  describe('quelle', () => {
    const withQuelle = (quelle: string) => ({
      slides: [
        {
          ...base,
          items: [
            {
              type: 'zitat',
              text: 'Wer heute beim **Klimaschutz** spart, zahlt morgen doppelt.',
              name: 'Sabine Moser',
              quelle,
            },
          ],
        },
      ],
    });
    const brief = `${quoteBrief} (aus dem Interview mit dem Kasseler Boten)`;

    it('accepts a medium the brief names', () => {
      expect(
        validateDraft(withQuelle('im Interview mit dem Kasseler Boten'), 'de-DE', brief).ok
      ).toBe(true);
    });

    it('rejects an invented medium', () => {
      const result = validateDraft(withQuelle('im FAZ-Interview'), 'de-DE', quoteBrief);
      expect(!result.ok && result.error).toContain('Quelle nur angeben');
      expect(validateDraft(withQuelle('im Interview'), 'de-DE', quoteBrief).ok).toBe(false);
    });
  });

  it('does not force a zitat on briefs that are not quotes', () => {
    expect(validateDraft(headlineDraft, 'de-DE', 'Mehr Bäume für Graz').ok).toBe(true);
    expect(validateDraft(headlineDraft, 'de-DE', 'Zitat-Karte gewünscht, Text offen').ok).toBe(
      true
    );
  });

  it('accepts quelle and frage within their limits and rejects longer ones', () => {
    const slide = (items: unknown[]) => ({
      locale: 'de-DE',
      slides: [{ ...base, items }],
    });
    const ok = sharepicSpecSchema.safeParse(
      slide([
        { type: 'zitat', text: 'x', name: 'A', quelle: 'im FAZ-Interview' },
        { type: 'frage', text: 'Warum?', von: 'SZ' },
      ])
    );
    expect(ok.success).toBe(true);
    const longQuelle = sharepicSpecSchema.safeParse(
      slide([{ type: 'zitat', text: 'x', name: 'A', quelle: 'q'.repeat(81) }])
    );
    const longFrage = sharepicSpecSchema.safeParse(
      slide([{ type: 'frage', text: 'q'.repeat(161) }])
    );
    expect(longQuelle.success).toBe(false);
    expect(longFrage.success).toBe(false);
  });

  it('rejects an unpaired accent mark in quelle and frage', () => {
    const slides = [
      {
        ...base,
        items: [
          { type: 'frage', text: 'Ist ==das so?', von: 'SZ' },
          { type: 'absatz', text: 'Ja.' },
        ],
      },
    ] as never;
    const result = validateDraft({ slides }, 'de-DE', 'Interview');
    expect(result.ok).toBe(false);
  });

  it('drops review ops that would turn a zitat into a headline or remove it', () => {
    const slides = [
      { ...base, items: [{ type: 'zitat', text: 'x', name: 'Sabine Moser' }] },
    ] as never;
    const patch = [
      { op: 'set_headline', item: 0, lines: ['Wer heute', 'spart'] },
      { op: 'remove_item', item: 0 },
      { op: 'set_position', position: 'unten' },
    ];
    const result = validateReview({ ok: false, issues: [], patch }, [1], slides);
    expect(result.ok && result.value.patch).toEqual([{ op: 'set_position', position: 'unten' }]);
  });

  it('keeps removals of other items and of a second zitat', () => {
    const slides = [
      {
        ...base,
        items: [
          { type: 'zitat', text: 'x', name: 'A' },
          { type: 'text', text: 'y' },
          { type: 'zitat', text: 'z', name: 'B' },
        ],
      },
    ] as never;
    const patch = [
      { op: 'remove_item', item: 1 },
      { op: 'remove_item', item: 2 },
    ];
    const result = validateReview({ ok: false, issues: [], patch }, [3], slides);
    expect(result.ok && result.value.patch).toHaveLength(2);
  });
});
