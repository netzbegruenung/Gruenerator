import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const mocks = vi.hoisted(() => ({
  readDocumentMarkdown: vi.fn<(...a: unknown[]) => Promise<string>>(),
  writeDocumentMarkdown: vi.fn<(...a: unknown[]) => Promise<void>>(),
  checkDocumentWriteAccess: vi.fn<(...a: unknown[]) => Promise<boolean>>(),
  loadDocumentProse: vi.fn<(...a: unknown[]) => Promise<string | null>>(),
}));
vi.mock('../../../services/docs/docTextEditService.js', async (orig) => ({
  ...(await orig<object>()),
  readDocumentMarkdown: mocks.readDocumentMarkdown,
  writeDocumentMarkdown: mocks.writeDocumentMarkdown,
}));
vi.mock('../../docs/documentAccess.js', () => ({
  checkDocumentWriteAccess: mocks.checkDocumentWriteAccess,
}));
vi.mock('../../docs/docProseReader.js', () => ({ loadDocumentProse: mocks.loadDocumentProse }));

const { makeEditDocumentTextTool, makeReadDocumentTool } = await import('./documentLoopTools.js');

const stateWith = (lastUser: string, over: Record<string, unknown> = {}) =>
  ({
    agentConfig: { userId: 'u1' },
    threadArtifacts: [
      { kind: 'document', ref: 'd-new' },
      { kind: 'document', ref: 'd-old' },
    ],
    messages: [{ role: 'user', content: lastUser }],
    ...over,
  }) as unknown as ChatGraphState;
const run = (t: unknown, input: unknown) =>
  (t as { execute: (i: unknown, o?: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    {}
  );
const edit = (state: ChatGraphState) => makeEditDocumentTextTool({ state, threadId: 't1' });
const change = { ersetzungen: [{ alt: 'Der Verkehr wächst.', neu: 'Er wächst stark.' }] };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.checkDocumentWriteAccess.mockResolvedValue(true);
  mocks.loadDocumentProse.mockResolvedValue('x');
  mocks.readDocumentMarkdown.mockResolvedValue('# Antrag\n\nDer Verkehr wächst.');
});

describe('read_document', () => {
  it('reads the addressed document (docMentionIds) before the newest', async () => {
    const state = stateWith('?', { docMentionIds: ['d-old'] });
    const out = await run(makeReadDocumentTool({ state, threadId: 't1' }), {});
    expect(out.documentId).toBe('d-old');
    expect(out.inhalt).toMatch(/Antrag/);
  });
});

describe('read_document — empty document', () => {
  it('reports an accessible empty document as empty, not as inaccessible', async () => {
    mocks.loadDocumentProse.mockResolvedValue(null);
    mocks.readDocumentMarkdown.mockResolvedValue('');
    const out = await run(makeReadDocumentTool({ state: stateWith('?'), threadId: 't1' }), {});
    expect(out.inhalt).toMatch(/leer/);
  });

  it('still refuses without access', async () => {
    mocks.loadDocumentProse.mockResolvedValue(null);
    mocks.checkDocumentWriteAccess.mockResolvedValue(false);
    const out = await run(makeReadDocumentTool({ state: stateWith('?'), threadId: 't1' }), {});
    expect(out.error).toMatch(/nicht zugänglich/);
  });
});

describe('edit_document_text', () => {
  it('first call only shows the change', async () => {
    const out = await run(edit(stateWith('Mach die Begründung stärker')), {
      ...change,
      confirm: false,
    });
    expect(out.needsConfirmation).toBe(true);
    expect(out.aenderungen).toMatch(/vorher: „Der Verkehr wächst\."/);
    expect(mocks.writeDocumentMarkdown).not.toHaveBeenCalled();
  });

  it('writes after the person said ja', async () => {
    const out = await run(edit(stateWith('ja')), { ...change, confirm: true });
    expect(out.ok).toBe(true);
    expect(mocks.writeDocumentMarkdown).toHaveBeenCalledWith(
      'd-new',
      '# Antrag\n\nEr wächst stark.',
      'u1'
    );
  });

  it('refuses confirm=true nobody agreed to', async () => {
    const out = await run(edit(stateWith('Mach es besser')), { ...change, confirm: true });
    expect(out.error).toMatch(/nicht zugestimmt/);
    expect(mocks.writeDocumentMarkdown).not.toHaveBeenCalled();
  });

  it('reports a passage that is not in the document', async () => {
    const out = await run(edit(stateWith('ja')), {
      ersetzungen: [{ alt: 'Bus', neu: 'Bahn' }],
      confirm: true,
    });
    expect(out.error).toMatch(/steht so nicht/);
  });

  it('refuses without write access', async () => {
    mocks.checkDocumentWriteAccess.mockResolvedValue(false);
    expect((await run(edit(stateWith('ja')), { ...change, confirm: true })).error).toMatch(
      /Bearbeitungsrechte/
    );
  });
});
