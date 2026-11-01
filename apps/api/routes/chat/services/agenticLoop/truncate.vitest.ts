import { describe, it, expect } from 'vitest';

import { truncateResultForModel, wasShortened } from './truncate.js';

describe('truncateResultForModel', () => {
  it('passes primitives through untouched', () => {
    expect(truncateResultForModel('hi', 100)).toBe('hi');
    expect(truncateResultForModel(42, 100)).toBe(42);
    expect(truncateResultForModel(null, 100)).toBeNull();
  });

  it('passes small objects through untouched (same reference)', () => {
    const value = { results: [{ title: 'a' }] };
    expect(truncateResultForModel(value, 10_000)).toBe(value);
  });

  it('truncates long string leaves and marks the result', () => {
    const value = { content: 'x'.repeat(50_000) };
    const out = truncateResultForModel(value, 2000) as { content: string; _gekuerzt?: unknown };
    expect(out._gekuerzt).toMatchObject({ feld: 'content', gesamtZeichen: 50_000 });
    expect(out.content.length).toBeLessThan(50_000);
    expect(out.content.endsWith('…[gekürzt]')).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(2000);
  });

  it('caps long arrays', () => {
    const value = { results: Array.from({ length: 100 }, (_, i) => ({ i, t: `item ${i}` })) };
    const out = truncateResultForModel(value, 1500) as { results: unknown[]; _gekuerzt?: unknown };
    expect(out._gekuerzt).toMatchObject({ feld: 'results', gesamtEintraege: 100 });
    expect(out.results.length).toBeLessThan(100);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(1500);
  });

  it('falls back to a bounded preview when nothing else fits', () => {
    // One giant key name / structure that resists field-level truncation.
    const value = { ['k'.repeat(5000)]: 'v'.repeat(5000) };
    const out = truncateResultForModel(value, 500) as { _truncated?: boolean; preview?: string };
    expect(out._truncated).toBe(true);
    expect(wasShortened(out)).toBe(true);
    expect(typeof out.preview).toBe('string');
    expect((out.preview as string).length).toBeLessThanOrEqual(500);
  });

  describe('pre-budgeted fields', () => {
    /** 10 sources x 900 chars — what a `gruendlich` web_search now returns. */
    const sourceBlock = Array.from(
      { length: 10 },
      (_, i) => `[${i + 1}] Titel ${i} <https://example.org/${i}> — ${'inhalt '.repeat(128)}`
    ).join('\n');

    it('passes `sources` through whole even far past maxChars', () => {
      const value = { resultCount: 10, sources: sourceBlock };
      const out = truncateResultForModel(value, 6000) as { sources: string };
      expect(sourceBlock.length).toBeGreaterThan(6000);
      expect(out.sources).toBe(sourceBlock);
      expect(out.sources).not.toContain('…[gekürzt]');
    });

    it('does not claim truncation when only the exempt field was oversized', () => {
      const value = { resultCount: 10, sources: sourceBlock };
      const out = truncateResultForModel(value, 6000);
      expect(wasShortened(out)).toBe(false);
    });

    it('still truncates the non-exempt fields around it', () => {
      const value = { sources: sourceBlock, debug: 'x'.repeat(50_000) };
      const out = truncateResultForModel(value, 6000) as {
        sources: string;
        debug: string;
        _gekuerzt?: unknown;
      };
      expect(out.sources).toBe(sourceBlock);
      expect(out._gekuerzt).toMatchObject({ feld: 'debug' });
      expect(out.debug.endsWith('…[gekürzt]')).toBe(true);
      expect(out.debug.length).toBeLessThan(2000);
    });

    it('never falls back to the preview shape when an exempt field is present', () => {
      // Without the exemption this shape would lose `sources` entirely.
      const value = { sources: sourceBlock, ['k'.repeat(5000)]: 'v'.repeat(5000) };
      const out = truncateResultForModel(value, 500) as { sources?: string; preview?: string };
      expect(out.preview).toBeUndefined();
      expect(out.sources).toBe(sourceBlock);
    });

    it('honours a caller-supplied exemption set', () => {
      const value = { sources: sourceBlock };
      const out = truncateResultForModel(value, 6000, new Set()) as { sources: string };
      expect(out.sources.endsWith('…[gekürzt]')).toBe(true);
    });
  });

  describe('gezielt kürzen', () => {
    const paragraphs = (n: number) =>
      Array.from({ length: n }, (_, i) => `Absatz ${i}. ${'Satz über Verkehr. '.repeat(20)}`).join(
        '\n\n'
      );

    it('kürzt nur das große Feld; IDs, Titel, Hinweise und error bleiben ganz', () => {
      const value = {
        documentId: 'doc-1',
        title: 'Beschluss zur Verkehrswende',
        hinweis: 'Gilt nur für den Entwurf vom 12.10.',
        error: 'Teilweise nicht lesbar: Seite 4',
        inhalt: paragraphs(60),
      };
      const out = truncateResultForModel(value, 6000) as typeof value & { _gekuerzt: unknown };
      expect(out.documentId).toBe(value.documentId);
      expect(out.title).toBe(value.title);
      expect(out.hinweis).toBe(value.hinweis);
      expect(out.error).toBe(value.error);
      expect(out.inhalt.length).toBeLessThan(value.inhalt.length);
      expect(JSON.stringify(out).length).toBeLessThanOrEqual(6000);
      // statt maxChars/8 = 750 füllt das große Feld den Platz
      expect(out.inhalt.length).toBeGreaterThan(4500);
    });

    it('der Marker nennt Feld, Gesamtlänge und gezeigte Länge', () => {
      const value = { inhalt: paragraphs(60) };
      const out = truncateResultForModel(value, 6000) as {
        inhalt: string;
        _gekuerzt: { feld: string; gesamtZeichen: number; gezeigtZeichen: number };
      };
      expect(out._gekuerzt.feld).toBe('inhalt');
      expect(out._gekuerzt.gesamtZeichen).toBe(value.inhalt.length);
      expect(out.inhalt.length).toBe(out._gekuerzt.gezeigtZeichen + '…[gekürzt]'.length);
    });

    it('schneidet an einer Absatzgrenze', () => {
      const out = truncateResultForModel({ inhalt: paragraphs(60) }, 6000) as { inhalt: string };
      const body = out.inhalt.replace('…[gekürzt]', '');
      expect(body.endsWith('Satz über Verkehr.')).toBe(true);
      expect(body.endsWith('\n')).toBe(false);
    });

    it('schneidet am Satzende, wenn es keine Absätze gibt', () => {
      const out = truncateResultForModel(
        { inhalt: 'Ein Satz über Verkehr. '.repeat(500) },
        3000
      ) as {
        inhalt: string;
      };
      expect(out.inhalt.replace('…[gekürzt]', '').endsWith('Verkehr.')).toBe(true);
    });

    it('mehrere große Felder: nur die größten werden gekürzt, die kleinere bleibt ganz', () => {
      const value = { a: 'a '.repeat(10_000), b: 'b '.repeat(600), c: 'c '.repeat(200) };
      const out = truncateResultForModel(value, 6000) as typeof value & {
        _gekuerzt: Array<{ feld: string }> | { feld: string };
      };
      expect(out.b).toBe(value.b);
      expect(out.c).toBe(value.c);
      expect(out.a.length).toBeLessThan(value.a.length);
      expect(out._gekuerzt).toMatchObject({ feld: 'a' });
    });

    it('kürzt kein Feld unter den früheren maxChars/8, auch wenn der Platz fehlt', () => {
      const value = { a: 'a'.repeat(40_000), b: 'b'.repeat(40_000) };
      const out = truncateResultForModel(value, 6000) as typeof value;
      expect(out.a.length).toBeGreaterThanOrEqual(750);
      expect(out.b.length).toBeGreaterThanOrEqual(750);
    });

    it('verschachtelte Felder werden mit Pfad gemeldet', () => {
      const value = {
        results: [
          { id: 1, text: 'kurz' },
          { id: 2, text: 'x'.repeat(20_000) },
        ],
      };
      const out = truncateResultForModel(value, 3000) as {
        results: Array<{ id: number; text: string }>;
        _gekuerzt: { feld: string };
      };
      expect(out.results[0]).toEqual({ id: 1, text: 'kurz' });
      expect(out._gekuerzt.feld).toBe('results[1].text');
    });
  });

  it('eine weit vorn liegende Absatzgrenze drückt ein Feld nicht unter den alten Boden', () => {
    // Der Quellenblock frisst den Platz, die Schnitthöhe liegt am Boden (750).
    // Der erste Absatz endet bei ~470 — über 0,6 x 750, aber unter dem Boden.
    const first =
      'Die Stadt plant neue Radwege entlang der großen Hauptstraßen im Zentrum. '.repeat(7);
    const rest = 'weiter ohne Satzende und ohne Absatz aber mit vielen Wörtern '.repeat(60);
    const sources = `[1] ${'Quelle '.repeat(1200)}`;
    const out = truncateResultForModel({ sources, inhalt: `${first.trim()}\n\n${rest}` }, 6000) as {
      inhalt: string;
    };
    expect(first.trim().length).toBeLessThan(750);
    expect(first.trim().length).toBeGreaterThan(450);
    expect(out.inhalt.replace('…[gekürzt]', '').length).toBeGreaterThanOrEqual(750);
  });
});
