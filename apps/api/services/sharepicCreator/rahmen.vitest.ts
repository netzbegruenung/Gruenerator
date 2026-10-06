import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';

const BRIEF =
  'Karussell: Die Regierung kürzt beim Klimaschutz. Wir fordern von Friedrich Merz, das zu stoppen. Unterschreib unsere Petition, Link in der Bio.';

const slide = (items: object[], extra: object = {}) => ({
  background: { kind: 'farbe', color: 'dunkeltanne' },
  position: 'mitte',
  align: 'links',
  items,
  logo: false,
  ...extra,
});
const absatz = (text: string) => ({ type: 'absatz', text });
const draft = (slides: object[], extra: object = {}) => ({ slides, ...extra });
const errorOf = (input: object, brief = BRIEF) => {
  const result = validateDraft(input, 'de-DE', brief);
  return result.ok ? '' : result.error;
};

describe('validateDraft — Satzbrücke', () => {
  it('takes a sentence the next slide picks up with "…"', () => {
    const input = draft([
      slide([absatz('Die Regierung kürzt beim Klimaschutz …')]),
      slide([absatz('… und das spüren wir alle.')]),
      slide([absatz('Darum fordern wir mehr.')]),
    ]);
    expect(errorOf(input)).toBe('');
  });

  it('lets a teaser "…" lead into a slide that starts fresh', () => {
    const input = draft([
      slide([absatz('Aber nicht nur das …')]),
      slide([absatz('Die Regierung kürzt beim Klimaschutz.')]),
    ]);
    expect(errorOf(input)).toBe('');
  });

  it('sends back a slide that picks up a sentence nobody started', () => {
    const input = draft([
      slide([absatz('Die Regierung kürzt beim Klimaschutz.')]),
      slide([absatz('… und das spüren wir alle.')]),
    ]);
    expect(errorOf(input)).toContain('Slide 2 beginnt mit „…“');
  });

  it('sends back a last slide that trails off', () => {
    const input = draft([
      slide([absatz('Die Regierung kürzt beim Klimaschutz.')]),
      slide([absatz('Und dann …')]),
    ]);
    expect(errorOf(input)).toContain('die letzte Slide endet auf „…“');
  });
});

describe('validateDraft — aufruf', () => {
  const closing = (aufruf: object) =>
    draft([slide([absatz('Die Regierung kürzt beim Klimaschutz.')]), slide([aufruf])]);

  it('takes addressee and hint the brief names', () => {
    const input = closing({
      type: 'aufruf',
      stil: 'ausruf',
      text: 'Stoppen Sie die Kürzungen!',
      adressat: 'Herr Merz',
    });
    expect(errorOf(input)).toBe('');
  });

  it('sends back an addressee the brief does not name', () => {
    const input = closing({
      type: 'aufruf',
      stil: 'ausruf',
      text: 'Stoppen Sie die Kürzungen!',
      adressat: 'Frau Reiche',
    });
    expect(errorOf(input)).toContain('Der adressat "Frau Reiche"');
  });

  it('sends back a hint where the brief names no link or petition', () => {
    const input = closing({
      type: 'aufruf',
      stil: 'petition',
      text: 'Mach mit!',
      hinweis: 'Link in der Bio',
    });
    expect(errorOf(input, 'Karussell: Die Regierung kürzt beim Klimaschutz.')).toContain(
      'Der hinweis "Link in der Bio"'
    );
  });

  it('keeps the call on the last slide, alone', () => {
    const early = draft([
      slide([{ type: 'aufruf', stil: 'kernsatz', text: 'Klimaschutz jetzt.' }]),
      slide([absatz('Die Regierung kürzt beim Klimaschutz.')]),
    ]);
    expect(errorOf(early)).toContain('Ein aufruf steht auf der letzten Slide.');
    const crowded = closing({ type: 'aufruf', stil: 'kernsatz', text: 'Klimaschutz jetzt.' });
    (crowded.slides[1] as { items: object[] }).items.push(absatz('Noch ein Satz.'));
    expect(errorOf(crowded)).toContain('Der aufruf trägt seine Slide allein');
  });
});

describe('validateDraft — Rahmen', () => {
  it('keeps the teaser off the last slide and off a carousel without arrows', () => {
    const lastTeaser = draft([
      slide([absatz('Die Regierung kürzt beim Klimaschutz.')]),
      slide([absatz('Darum fordern wir mehr.')], { weiter: 'Denn →' }),
    ]);
    expect(errorOf(lastTeaser)).toContain('weiter führt zur nächsten Slide');
    const noArrow = draft(
      [
        slide([absatz('Die Regierung kürzt beim Klimaschutz.')], { weiter: 'Denn →' }),
        slide([absatz('Darum fordern wir mehr.')]),
      ],
      { pfeil: false }
    );
    expect(errorOf(noArrow)).toContain('ohne Pfeil kein weiter');
  });

  it('numbers pages only in a carousel', () => {
    const single = draft([slide([absatz('Die Regierung kürzt beim Klimaschutz.')])], {
      seitenzahl: 'bruch',
    });
    expect(errorOf(single)).toContain('seitenzahl nur in einem Karussell');
  });
});
