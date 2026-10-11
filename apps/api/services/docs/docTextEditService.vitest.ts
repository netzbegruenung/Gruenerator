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

describe('planReplacements', () => {
  const doc = 'Begründung: Der Verkehr wächst. Fazit: Wir handeln.';

  it('accepts only replacements that hit exactly one passage', async () => {
    aiObject.mockImplementation(async (call: { validate: (i: unknown) => unknown }) => {
      expect(call.validate({ ersetzungen: [{ alt: 'Bus', neu: 'x' }] })).toMatchObject({
        ok: false,
      });
      const ok = call.validate({
        ersetzungen: [{ alt: 'Wir handeln.', neu: 'Wir handeln jetzt.' }],
      });
      return { ok: true, data: (ok as { value: unknown }).value };
    });
    expect(await planReplacements(doc, 'Fazit dringlicher')).toEqual({
      ok: true,
      ersetzungen: [{ alt: 'Wir handeln.', neu: 'Wir handeln jetzt.' }],
    });
  });

  it('passes a failed plan through', async () => {
    aiObject.mockResolvedValue({ ok: false, error: 'nope' });
    expect(await planReplacements(doc, 'x')).toEqual({ ok: false, error: 'nope' });
  });
});
