import { describe, expect, it } from 'vitest';

import { segmentForExport } from './visualBlockImages.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const fence = (lang: string, body: unknown) => `\`\`\`${lang}\n${JSON.stringify(body)}\n\`\`\``;

const answer = [
  'Einleitung.',
  fence('bars', {
    title: 'Dauer',
    max: 8,
    items: [
      { label: 'Akut', value: 3, display: 'bis 3 Wochen' },
      { label: 'Chronisch', from: 8, value: 8, display: 'über 8 Wochen', tone: 'warning' },
    ],
    note: 'Quelle: Leitlinie',
  }),
  'Dazwischen.',
  fence('chart', {
    type: 'bar',
    stacked: true,
    data: [
      { jahr: '2024', a: 1, b: 2 },
      { jahr: '2025', a: 2, b: 3 },
    ],
    xKey: 'jahr',
    yKeys: ['a', 'b'],
  }),
  fence('chart', {
    type: 'donut',
    data: [
      { name: 'Klima', wert: 41 },
      { name: 'Wohnen', wert: 18 },
    ],
    xKey: 'name',
    yKeys: ['wert'],
  }),
  fence('callout', { variant: 'warning', text: 'Datenschutz beachten' }),
  '```python\nprint(1)\n```',
].join('\n\n');

describe('segmentForExport', () => {
  const segments = segmentForExport(answer);

  it('draws chart and bars blocks as PNG figures in place', () => {
    expect(segments.map((s) => s.kind)).toEqual([
      'markdown',
      'figure',
      'markdown',
      'figure',
      'figure',
      'markdown',
    ]);
    for (const segment of segments) {
      if (segment.kind !== 'figure') continue;
      expect(segment.figure.png.subarray(0, 4)).toEqual(PNG_SIGNATURE);
    }
  });

  it('carries title, note and the values as alt text', () => {
    const first = segments[1];
    expect(first?.kind).toBe('figure');
    if (first?.kind !== 'figure') return;
    expect(first.figure.alt.startsWith('Dauer;')).toBe(true);
    expect(first.figure.note).toBe('Quelle: Leitlinie');
    expect(first.figure.alt).toContain('Chronisch: über 8 Wochen');
    expect(first.figure.alt).not.toContain('Quelle');
  });

  it('keeps other visual blocks as text and leaves ordinary code alone', () => {
    const tail = segments.at(-1);
    expect(tail?.kind).toBe('markdown');
    if (tail?.kind !== 'markdown') return;
    expect(tail.text).toContain('> **Achtung:** Datenschutz beachten');
    expect(tail.text).toContain('```python\nprint(1)\n```');
  });

  it('returns the text unchanged when there is no visual block', () => {
    expect(segmentForExport('Nur Text.')).toEqual([{ kind: 'markdown', text: 'Nur Text.' }]);
  });
});
