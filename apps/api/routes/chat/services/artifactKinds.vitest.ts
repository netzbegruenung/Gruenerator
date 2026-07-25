/**
 * The descriptor table is now the single place that says how an artifact kind
 * behaves. That only helps if every entry is complete — a missing field would
 * reintroduce, one kind at a time, exactly the drift that let four separate
 * instances of the fall-through bug accumulate.
 *
 * These assert the shape of the table, not the choreography (that is covered by
 * createIntentFailure.vitest.ts, which exercises the real handlers).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({}),
}));

const { BOARD_SPEC, PDF_SPEC, PRESENTATION_SPEC, SHEET_SPEC, makeDocumentSpec } =
  await import('./artifactKinds.js');

const DOCUMENT_SPEC = makeDocumentSpec({ intent: 'direct' });

const ALL_SPECS = [
  ['sheet', SHEET_SPEC],
  ['presentation', PRESENTATION_SPEC],
  ['pdf', PDF_SPEC],
  ['board', BOARD_SPEC],
  ['document', DOCUMENT_SPEC],
] as const;

describe.each(ALL_SPECS)('%s spec is complete', (_name, spec) => {
  it('declares the fields the choreography always needs', () => {
    expect(spec.intent).toBeTruthy();
    expect(spec.progressMessage).toBeTruthy();
    expect(spec.contextKind).toBeTruthy();
    expect(spec.logLabel).toBeTruthy();
    expect(typeof spec.generate).toBe('function');
    expect(typeof spec.successText).toBe('function');
    expect(typeof spec.ref).toBe('function');
  });

  it('has distinct texts for "nothing usable" and "it threw"', () => {
    // One generic message for both would hide which half failed — the
    // production trace was undiagnosable for exactly that reason.
    expect(spec.failureText).toBeTruthy();
    expect(spec.errorText).toBeTruthy();
    expect(spec.failureText).not.toBe(spec.errorText);
  });

  it('never names a manual export workaround in user-facing text', () => {
    // The literal hallucination this whole line of work started from.
    const texts = [spec.progressMessage, spec.failureText, spec.errorText].join(' ');
    expect(texts).not.toMatch(/doku\.gruenerator\.eu|Als PDF speichern/i);
  });

  it('invites a retry instead of dead-ending', () => {
    expect(`${spec.failureText} ${spec.errorText}`).toMatch(/sag mir|versuch|beschreibung/i);
  });
});

describe('kinds carry the right sticky-pointer kind', () => {
  it('pdf is its own kind — its ref is a file name, not a document UUID', () => {
    expect(PDF_SPEC.contextKind).toBe('pdf');
  });

  it('sheet and presentation point at their own kinds', () => {
    expect(SHEET_SPEC.contextKind).toBe('sheet');
    expect(PRESENTATION_SPEC.contextKind).toBe('presentation');
  });

  it('a generated document resolves its kind from the produced subtype', () => {
    const resolve = DOCUMENT_SPEC.contextKind as (doc: { subtype: string }) => string;

    expect(resolve({ subtype: 'presentations' })).toBe('presentation');
    expect(resolve({ subtype: 'sheets' })).toBe('sheet');
    expect(resolve({ subtype: 'antrag' })).toBe('document');
  });
});

describe('board differs only where it genuinely differs', () => {
  it('emits no chat card — the client seeds Yjs from the done payload', () => {
    expect(BOARD_SPEC.card).toBeUndefined();
    expect(
      BOARD_SPEC.doneExtras?.({ boardId: 'b1', boardGeneratedStructure: { x: 1 } } as never)
    ).toEqual({ boardId: 'b1', boardGeneratedStructure: { x: 1 } });
  });

  it('reports intent "direct" on success (it predates the create_* intents)', () => {
    expect(BOARD_SPEC.doneIntent).toBe('direct');
    expect(BOARD_SPEC.intent).toBe('create_board');
  });

  it('persists plain text — no createdDocument metadata', () => {
    expect(BOARD_SPEC.persistMetadata).toBeUndefined();
  });
});

describe('card-bearing kinds persist the descriptor for reload', () => {
  const doc = { documentId: 'doc-1', title: 'Titel', subtype: 'sheets', url: '/office/doc-1' };

  it.each([
    ['sheet', SHEET_SPEC],
    ['presentation', PRESENTATION_SPEC],
    ['document', DOCUMENT_SPEC],
  ] as const)('%s streams a card and stores createdDocument', (_n, spec) => {
    expect(spec.card?.(doc)).toEqual(doc);
    // Without this the card is streamed live but the reloaded message is bare.
    expect(spec.persistMetadata?.(doc)).toMatchObject({ createdDocument: doc });
    expect(spec.doneExtras?.(doc)).toEqual({ documentId: 'doc-1' });
  });
});

describe('pdf reports its self-check instead of claiming plain success', () => {
  const base = {
    document: { documentId: 'a.pdf', title: 'Fact Sheet', subtype: 'pdf', url: '/u/a.pdf' },
    summary: '1 Seite, getaggt',
  };

  it('names the problems the verifier found', () => {
    const text = PDF_SPEC.successText({
      ...base,
      verification: { problems: ['2 Zeichen fehlten'] },
    } as never);

    expect(text).toContain('Bitte prüfen');
    expect(text).toContain('2 Zeichen fehlten');
  });

  it('stays short when the check was clean', () => {
    const text = PDF_SPEC.successText({ ...base, verification: { problems: [] } } as never);

    expect(text).toContain('1 Seite, getaggt');
    expect(text).not.toContain('Bitte prüfen');
  });

  it('uses the asset file name as the sticky ref', () => {
    expect(PDF_SPEC.ref({ ...base, verification: { problems: [] } } as never)).toEqual({
      ref: 'a.pdf',
      label: 'Fact Sheet',
    });
  });
});
