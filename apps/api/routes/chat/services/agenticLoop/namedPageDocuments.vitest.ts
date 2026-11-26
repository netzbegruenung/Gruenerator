import { describe, expect, it, vi } from 'vitest';

import { pageDocumentText, pageLabel } from '../../agents/namedPages.js';

import { PAGE_DOCUMENT_THRESHOLD, ingestNamedPages } from './namedPageDocuments.js';

import type { ChatGraphState, SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';

const URL_LONG = 'https://kommunal.de/';
const URL_SHORT = 'https://example.org/kurz';

function state(over: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    agentConfig: { userId: 'u1' },
    documentSources: [],
    documentChatIds: [],
    attachedWebpageUrls: [URL_LONG, URL_SHORT],
    lastUserTextNoMentions: 'welche autoren schreiben dort',
    ...over,
  } as unknown as ChatGraphState;
}

function page(url: string, length: number): SearchResult {
  return {
    source: 'web',
    url,
    title: `Titel ${url}`,
    content: 'x'.repeat(length),
    totalChars: length,
  };
}

function deps() {
  return {
    readNamedPages: vi.fn(async (urls: string[]) => ({
      validated: urls,
      rejected: [],
      results: urls.map((u) => page(u, u === URL_LONG ? PAGE_DOCUMENT_THRESHOLD + 5_000 : 900)),
    })),
    storeDocument: vi.fn(async () => 'doc-1'),
    saveAttachment: vi.fn(async () => undefined),
  };
}

// #6103: a long named page becomes a thread document, so `dokumente_lesen`
// can read all of it; a short one stays a source the model sees whole.
describe('ingestNamedPages', () => {
  it('turns a long page into a thread document and keeps a short one for the page seed', async () => {
    const s = state();
    const d = deps();
    await ingestNamedPages({ state: s, threadId: 't1', allowed: true, deps: d });

    expect(d.storeDocument).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'kommunal.de', sourceUrl: URL_LONG, userId: 'u1' })
    );
    expect(d.saveAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 't1', label: 'kommunal.de', documentId: 'doc-1' })
    );
    expect(s.documentSources).toEqual([
      { kind: 'document_chat', id: 'doc-1', label: 'kommunal.de', webpage: true },
    ]);
    expect(s.documentChatIds).toEqual(['doc-1']);
    expect(s.prefetchedPages?.map((p) => p.url)).toEqual([URL_SHORT]);
  });

  it('reads nothing when the turn may not go to the web', async () => {
    const d = deps();
    await ingestNamedPages({ state: state(), threadId: 't1', allowed: false, deps: d });
    expect(d.readNamedPages).not.toHaveBeenCalled();
  });

  it('does not fetch a page the thread already holds as a document', async () => {
    const s = state({
      attachedWebpageUrls: [URL_LONG],
      documentSources: [{ kind: 'document_chat', id: 'old', label: 'kommunal.de', webpage: true }],
    });
    const d = deps();
    await ingestNamedPages({ state: s, threadId: 't1', allowed: true, deps: d });
    expect(d.readNamedPages).not.toHaveBeenCalled();
    expect(s.prefetchedPages).toBeUndefined();
  });

  it('keeps a long page as a marked source when there is no thread to hold the document', async () => {
    const s = state({ attachedWebpageUrls: [URL_LONG] });
    const d = deps();
    await ingestNamedPages({ state: s, threadId: null, allowed: true, deps: d });
    expect(d.storeDocument).not.toHaveBeenCalled();
    expect(s.prefetchedPages?.[0]?.totalChars).toBe(PAGE_DOCUMENT_THRESHOLD + 5_000);
  });

  it('falls back to the marked source when indexing fails', async () => {
    const s = state({ attachedWebpageUrls: [URL_LONG] });
    const d = {
      ...deps(),
      storeDocument: vi.fn(async () => Promise.reject(new Error('qdrant down'))),
    };
    await ingestNamedPages({ state: s, threadId: 't1', allowed: true, deps: d });
    expect(s.documentSources).toEqual([]);
    expect(s.prefetchedPages?.map((p) => p.url)).toEqual([URL_LONG]);
  });
});

describe('pageDocumentText', () => {
  it('keeps headings and bylines, drops images and link targets', () => {
    const md = [
      '[![Bild](/a.jpg)](/artikel)',
      '',
      'Porträt',
      '',
      '[',
      '',
      '## Ein Bürgermeister mit Stehvermögen',
      '',
      '](/artikel)',
      '',
      'von [Benjamin Lassiwe](/benjamin-lassiwe "Benutzerprofil anzeigen.")',
    ].join('\n');
    expect(pageDocumentText(md)).toBe(
      'Porträt\n\n## Ein Bürgermeister mit Stehvermögen\n\nvon Benjamin Lassiwe'
    );
  });
});

describe('pageLabel', () => {
  it('names a page by host and path, the same way every turn', () => {
    expect(pageLabel('https://www.kommunal.de/')).toBe('kommunal.de');
    expect(pageLabel('https://gruene.de/themen/klima/')).toBe('gruene.de/themen/klima');
  });
});
