import { describe, expect, it, vi } from 'vitest';

vi.mock('./docContentService.js', () => ({
  getDocumentHtml: vi.fn(async () => ({
    html: '<h1>Antrag</h1><p>Die Stadt baut Radwege. Die Stadt baut Radwege schneller.</p>',
  })),
  replaceDocumentHtml: vi.fn(),
}));

const { applyReplacements, describeReplacements, readDocumentMarkdown } =
  await import('./docTextEditService.js');

describe('applyReplacements', () => {
  const text = 'Begründung: Der Verkehr wächst. Fazit: Wir handeln.';

  it('replaces each unique passage', () => {
    expect(
      applyReplacements(text, [
        { alt: 'Der Verkehr wächst.', neu: 'Der Radverkehr wächst stark.' },
        { alt: 'Wir handeln.', neu: 'Wir handeln jetzt.' },
      ])
    ).toEqual({
      ok: true,
      text: 'Begründung: Der Radverkehr wächst stark. Fazit: Wir handeln jetzt.',
    });
  });

  it('refuses a passage that is missing or ambiguous', () => {
    expect(applyReplacements(text, [{ alt: 'Bus', neu: 'x' }])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/steht so nicht/),
    });
    expect(applyReplacements('a b a', [{ alt: 'a', neu: 'c' }])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/2×/),
    });
  });

  it('keeps $-patterns in the new text literal', () => {
    expect(applyReplacements('Preis: X', [{ alt: 'X', neu: '$& 5 €' }])).toEqual({
      ok: true,
      text: 'Preis: $& 5 €',
    });
  });
});

describe('readDocumentMarkdown / describeReplacements', () => {
  it('reads the document as markdown', async () => {
    expect(await readDocumentMarkdown('d1')).toMatch(/^# Antrag/);
  });

  it('shows changes as before/after, not the document', () => {
    expect(describeReplacements([{ alt: 'alt', neu: 'neu' }])).toBe(
      '- vorher: „alt"\n  nachher: „neu"'
    );
  });
});
