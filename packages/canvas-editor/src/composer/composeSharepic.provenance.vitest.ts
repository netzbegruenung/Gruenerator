import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic, type ComposedSlide } from './composeSharepic';
import { invertLiftedText } from './sharepicProvenance';
import { at, cover, deBoxed, deCarousel, farbe, options, SPECS } from './sharepicSpecFixtures';

import { type SharepicProvenance } from './index';

/** Every id a composed slide carries, in any collection. */
const emittedIds = (slide: ComposedSlide) =>
  new Set([
    ...slide.additionalTexts.map((t) => t.id),
    ...slide.pillBadgeInstances.map((p) => p.id),
    ...slide.circleBadgeInstances.map((c) => c.id),
    ...slide.shapeInstances.map((s) => s.id),
    ...slide.assetInstances.map((a) => a.id),
    ...slide.chartInstances.map((c) => c.id),
    ...slide.userImageInstances.map((u) => u.id),
    ...slide.selectedIcons,
    ...Object.keys(slide.iconStates),
    ...slide.layerOrder,
  ]);

const textOf = (slide: ComposedSlide, id: string) =>
  slide.additionalTexts.find((t) => t.id === id)?.text ??
  slide.pillBadgeInstances.find((p) => p.id === id)?.text ??
  null;

const fieldValue = (source: unknown, field: string): unknown =>
  field.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return null;
    return (value as Record<string, unknown>)[key] ?? null;
  }, source);

const provenanceOf = (spec: SharepicSpec) => {
  const composed = composeSharepic(spec, { ...options, provenance: true });
  return { composed, provenance: composed.provenance ?? [] };
};

describe('composeSharepic provenance', () => {
  it.each(Object.entries(SPECS))('gives every emitted id of %s an entry', (_name, spec) => {
    const { composed, provenance } = provenanceOf(spec);
    expect(provenance).toHaveLength(composed.slides.length);
    composed.slides.forEach((slide, s) => {
      const ids = emittedIds(slide);
      expect(new Set(Object.keys(provenance[s]!))).toEqual(ids);
      for (const [id, prov] of Object.entries(provenance[s]!)) {
        if (prov.kind !== 'item') continue;
        const item = spec.slides[s]!.items[prov.item!]!;
        expect(
          id.startsWith(`sc-${prov.item}-${item.type}`) || id.startsWith(`chart-sc-${prov.item}-`)
        ).toBe(true);
      }
    });
  });

  it.each(Object.entries(SPECS))(
    'inverts every liftable text of %s back to its spec field exactly',
    (_name, spec) => {
      const { composed, provenance } = provenanceOf(spec);
      composed.slides.forEach((slide, s) => {
        for (const [id, prov] of Object.entries(provenance[s]!)) {
          if (prov.lift === 'opaque') continue;
          const text = textOf(slide, id);
          expect(text, id).not.toBeNull();
          expect(prov.field, id).toBeTruthy();
          const source = prov.kind === 'item' ? spec.slides[s]!.items[prov.item!] : spec.slides[s];
          const value = fieldValue(source, prov.field!);
          const expected =
            prov.range && Array.isArray(value)
              ? value.slice(prov.range.start, prov.range.end)
              : value;
          expect(invertLiftedText(prov.lift, text!), id).toEqual(expected);
        }
      });
    }
  );

  it('lifts what is reversible and keeps every rewrite it cannot undo opaque', () => {
    const lifts = (spec: SharepicSpec, s: number): Record<string, SharepicProvenance> =>
      provenanceOf(spec).provenance[s]!;
    const first = lifts(deCarousel, 0);
    expect(first['sc-0-dachzeile']).toEqual({
      kind: 'item',
      item: 0,
      field: 'text',
      lift: 'verbatim',
    });
    expect(first['sc-1-headline-0']).toEqual({
      kind: 'item',
      item: 1,
      field: 'lines.0',
      lift: 'verbatim',
    });
    expect(first['sc-1-headline-1-box']).toMatchObject({ kind: 'item', item: 1, lift: 'opaque' });
    expect(first['sc-quelle']).toEqual({ kind: 'chrome', field: 'quelle', lift: 'prefix' });
    expect(first['sc-weiter']).toEqual({ kind: 'chrome', field: 'weiter', lift: 'verbatim' });
    expect(first['sc-scrim']).toEqual({ kind: 'plane', lift: 'opaque' });
    expect(first['sc-stoerer']).toMatchObject({ kind: 'chrome', lift: 'opaque' });
    expect(first['sc-ki-label']).toEqual({ kind: 'chrome', lift: 'opaque' });
    // Three plain lines share one text element: it stands for all of them.
    expect(lifts(deCarousel, 1)['sc-0-headline-0']).toEqual({
      kind: 'item',
      item: 0,
      field: 'lines',
      lift: 'lines',
      range: { start: 0, end: 3 },
    });
    expect(lifts(deCarousel, 1)['sc-1-liste']).toEqual({
      kind: 'item',
      item: 1,
      field: 'items',
      lift: 'bullets',
    });
    expect(lifts(deCarousel, 2)['sc-0-liste-1']).toMatchObject({
      field: 'items.1',
      lift: 'verbatim',
    });
    expect(lifts(deCarousel, 2)['chart-sc-1-diagramm']).toMatchObject({
      kind: 'item',
      lift: 'opaque',
    });
    // The medium credit and the role join the name; the medium's prefix joins the question.
    expect(lifts(deCarousel, 10)['sc-0-zitat-name']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 11)['sc-0-frage']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 11)['sc-1-frage']?.lift).toBe('verbatim');
    // Date appended to the medium.
    expect(lifts(deCarousel, 7)['sc-0-schlagzeile-medium']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 7)['sc-1-schlagzeile-medium']?.lift).toBe('verbatim');
    // A source that already says "Quelle:" would not come back as written.
    expect(lifts(deCarousel, 13)['sc-quelle']?.lift).toBe('opaque');
    expect(lifts(deCarousel, 13)['sc-ort']).toEqual({
      kind: 'chrome',
      field: 'ort.lines',
      lift: 'lines',
    });
    expect(lifts(deCarousel, 12)['sc-nummer']).toEqual({ kind: 'chrome', lift: 'opaque' });
    // Boxed lines are rewrapped; boxed headline lines lose their marks.
    const boxed = lifts(deBoxed, 0);
    expect(boxed['sc-0-headline-0']?.lift).toBe('verbatim');
    expect(boxed['sc-0-headline-1']?.lift).toBe('opaque');
    expect(boxed['sc-1-absatz-0']?.lift).toBe('opaque');
    // The cover split its line: none of its pieces is a spec line any more.
    expect(
      Object.entries(lifts(cover, 0)).filter(
        ([id, p]) => id.includes('headline') && p.lift !== 'opaque'
      )
    ).toEqual([]);
    // AT reads ++marker++ as ==accent==: changed text, not liftable.
    const atSlide = lifts(at, 1);
    expect(atSlide['sc-0-headline-0']?.lift).toBe('opaque');
    expect(atSlide['sc-0-headline-1']?.lift).toBe('verbatim');
    expect(atSlide['sc-1-liste']?.lift).toBe('bullets');
    expect(atSlide['sc-2-absatz']?.lift).toBe('opaque');
    expect(lifts(at, 0)['sc-0-zitat-name']?.lift).toBe('verbatim');
  });

  it.each([
    ['two', ['Mehr Wind', 'für alle'], undefined, { start: 0, end: 2 }],
    ['three', ['Mehr Wind', 'mehr Sonne', 'für alle'], undefined, { start: 0, end: 3 }],
    ['three behind an accent', ['Jetzt', 'mehr Wind', 'für alle'], 0, { start: 1, end: 3 }],
  ] as const)('round-trips a %s-line headline segment', (_name, lines, akzent, range) => {
    const spec: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        farbe('tanne', [
          { type: 'headline', lines: [...lines], ...(akzent === undefined ? {} : { akzent }) },
          { type: 'text', text: 'Gemeinsam vor Ort.' },
        ]),
      ],
    };
    const { composed, provenance } = provenanceOf(spec);
    const id = `sc-0-headline-${akzent === undefined ? 0 : 1}`;
    const prov = provenance[0]![id]!;
    expect(prov).toEqual({ kind: 'item', item: 0, field: 'lines', lift: 'lines', range });
    const text = textOf(composed.slides[0]!, id)!;
    expect(invertLiftedText(prov.lift, text)).toEqual(lines.slice(range.start, range.end));
  });

  it('changes nothing without the flag', () => {
    for (const spec of Object.values(SPECS)) {
      const plain = composeSharepic(spec, options);
      expect('provenance' in plain).toBe(false);
      const { provenance: _provenance, ...rest } = composeSharepic(spec, {
        ...options,
        provenance: true,
      });
      expect(rest).toEqual(plain);
    }
  });

  it('inverts the reversible rewrites strictly', () => {
    expect(invertLiftedText('verbatim', 'a **b**')).toBe('a **b**');
    expect(invertLiftedText('bullets', '• a\n• b')).toEqual(['a', 'b']);
    expect(invertLiftedText('bullets', '• a\nb')).toBeNull();
    expect(invertLiftedText('prefix', 'Quelle: UBA')).toBe('UBA');
    expect(invertLiftedText('prefix', 'UBA')).toBeNull();
    expect(invertLiftedText('lines', 'a\nb')).toEqual(['a', 'b']);
    expect(invertLiftedText('opaque', 'x')).toBeNull();
  });
});
