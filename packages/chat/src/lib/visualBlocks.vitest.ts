import { findFences, parseVisualBlock, replaceVisualBlocksWithText } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

describe('parseVisualBlock', () => {
  it('accepts German number formats in bars', () => {
    const parsed = parseVisualBlock(
      'bars',
      JSON.stringify({
        items: [
          { label: 'A', value: '12,5' },
          { label: 'B', value: '1.234,5' },
        ],
      })
    );
    expect(parsed?.kind).toBe('bars');
    if (parsed?.kind !== 'bars') return;
    expect(parsed.block.items.map((i) => i.value)).toEqual([12.5, 1234.5]);
  });

  it('returns null for unknown kinds, broken JSON and wrong shapes', () => {
    expect(parseVisualBlock('python', '{}')).toBeNull();
    expect(parseVisualBlock('bars', '{"items": [')).toBeNull();
    expect(parseVisualBlock('bars', '{"items": []}')).toBeNull();
    expect(parseVisualBlock('compare', '{"columns":[{"title":"A","items":["x"]}]}')).toBeNull();
  });

  it('rejects a recommendation that points past the columns', () => {
    const block = {
      recommended: 2,
      columns: [
        { title: 'A', items: ['x'] },
        { title: 'B', items: ['y'] },
      ],
    };
    expect(parseVisualBlock('compare', JSON.stringify(block))).toBeNull();
  });

  it('defaults the callout variant to info', () => {
    const parsed = parseVisualBlock('callout', '{"text":"Bitte beachten"}');
    expect(parsed).toEqual({ kind: 'callout', block: { variant: 'info', text: 'Bitte beachten' } });
  });

  it('drops citation markers inside block texts', () => {
    const parsed = parseVisualBlock(
      'callout',
      '{"text":"Gilt seit 2024 [3, 4]","title":"Hinweis [cite:12]"}'
    );
    expect(parsed).toEqual({
      kind: 'callout',
      block: { variant: 'info', text: 'Gilt seit 2024', title: 'Hinweis' },
    });
  });

  it('keeps chart fences without a title valid', () => {
    const parsed = parseVisualBlock(
      'chart',
      '{"type":"bar","data":[{"name":"A","wert":1}],"xKey":"name","yKeys":["wert"],"stacked":true}'
    );
    expect(parsed?.kind).toBe('chart');
  });
});

describe('replaceVisualBlocksWithText', () => {
  it('turns valid blocks into readable Markdown and leaves other fences alone', () => {
    const md = [
      'Vorher.',
      '',
      '```bars',
      '{"title":"Dauer","items":[{"label":"Akut","value":3,"display":"Bis 3 Wochen"}],"note":"Quelle: Leitlinie"}',
      '```',
      '',
      '```python',
      'print(1)',
      '```',
      '',
      '```callout',
      '{"variant":"warning","text":"Bei Fieber zum Arzt."}',
      '```',
    ].join('\n');

    expect(replaceVisualBlocksWithText(md)).toBe(
      [
        'Vorher.',
        '',
        '**Dauer**',
        '- Akut: Bis 3 Wochen',
        '',
        '_Quelle: Leitlinie_',
        '',
        '```python',
        'print(1)',
        '```',
        '',
        '> **Achtung:** Bei Fieber zum Arzt.',
      ].join('\n')
    );
  });

  it('renders a table block as a Markdown table with formatted cells', () => {
    const md =
      '```table\n{"columns":[{"key":"p","label":"Partei"},{"key":"v","label":"Anteil","format":"percent"}],"rows":[{"p":"Grüne","v":11.6}]}\n```';
    expect(replaceVisualBlocksWithText(md)).toBe(
      '| Partei | Anteil |\n| --- | --- |\n| Grüne | 11,6 % |'
    );
  });

  it('leaves an invalid block untouched', () => {
    const md = '```stats\n{"items": "kaputt"}\n```';
    expect(replaceVisualBlocksWithText(md)).toBe(md);
  });

  it('escapes backslashes before pipes in table cells', () => {
    const md = '```table\n{"columns":[{"key":"a","label":"A"}],"rows":[{"a":"x\\\\|y"}]}\n```';
    expect(replaceVisualBlocksWithText(md)).toBe('| A |\n| --- |\n| x\\\\\\|y |');
  });

  it('leaves an unclosed fence alone', () => {
    const md = 'Text\n```callout\n{"text":"offen"}';
    expect(replaceVisualBlocksWithText(md)).toBe(md);
  });

  it('stays linear on long runs of dashes (no regex backtracking)', () => {
    const md = `\`\`\`${'-'.repeat(50_000)}\n${'-'.repeat(50_000)}\n`.repeat(20);
    const started = performance.now();
    expect(findFences(md)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
