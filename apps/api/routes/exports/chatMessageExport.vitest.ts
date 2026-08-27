/**
 * End-to-end for the chat download button.
 *
 * The assertions read the generated `word/document.xml`, not the parser's
 * intermediate shape. Every bug this file pins was invisible to a test that
 * only checked "does some text appear somewhere": the text WAS there, glued to
 * its neighbour, entity-escaped, or flattened into one paragraph.
 */

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import AdmZip from 'adm-zip';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import chatMessageRouter from './chatMessageExport.js';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/exports/chat-message', chatMessageRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

async function postMessage(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/exports/chat-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * One pass, so `&amp;lt;` reads back as the literal `&lt;`. Unescaping `&amp;`
 * in its own `.replace` first would feed the `&` it produces into the next one
 * and report `<` — a helper that lies about what the document says.
 */
const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function unescapeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => XML_ENTITIES[name]);
}

interface Docx {
  document: string;
  numbering: string;
  /** Visible text of the document, runs concatenated as Word will show them. */
  text: string;
}

async function exportDocx(body: unknown): Promise<Docx> {
  const res = await postMessage(body);
  expect(res.status).toBe(200);

  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
  const read = (path: string): string => zip.getEntry(path)?.getData().toString('utf8') ?? '';
  const document = read('word/document.xml');

  return {
    document,
    numbering: read('word/numbering.xml'),
    text: unescapeXml(
      [...document.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('')
    ),
  };
}

const ASSISTANT = { role: 'assistant', timestamp: 1_764_500_000_000 } as const;

describe('POST /api/exports/chat-message', () => {
  it('keeps the spaces around bold runs', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: '**Marilyn Monroe** wurde am **1. Juni 1926** in Los Angeles geboren.',
    });

    expect(docx.text).toContain('Marilyn Monroe wurde am 1. Juni 1926 in Los Angeles geboren.');
    expect(docx.text).not.toContain('Monroewurde');
  }, 30_000);

  it('writes a real Word list instead of "•" glyphs in one paragraph', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: [
        'Filme:',
        '',
        '- **Blondinen bevorzugt** (1953)',
        "- **Manche mögen's heiß** (1959)",
      ].join('\n'),
    });

    // Three <w:p> for the header line, the intro and… no: two list items each
    // get their own paragraph with a numPr.
    expect(docx.document.match(/<w:numPr>/g)).toHaveLength(2);
    expect(docx.text).toContain('Blondinen bevorzugt (1953)');
    expect(docx.text).toContain("Manche mögen's heiß (1959)");
    expect(docx.numbering).toContain('<w:abstractNum');
  }, 30_000);

  it('does not leak HTML entities into the document text', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: "**Manche mögen's heiß** & andere Filme <1960",
    });

    expect(docx.text).toContain("Manche mögen's heiß & andere Filme <1960");
    expect(docx.text).not.toContain('&#39;');
    expect(docx.text).not.toContain('&amp;amp;');
  }, 30_000);

  it('numbers ordered lists and restarts a second list', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: ['1. Eins', '2. Zwei', '', 'Text dazwischen.', '', '1. Neu', '2. Wieder'].join('\n'),
    });

    const numIds = [...docx.document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map(
      (match) => match[1]
    );
    expect(numIds).toHaveLength(4);
    expect(new Set(numIds).size).toBe(2);
  }, 30_000);

  it('renders links as clickable hyperlinks', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: 'Siehe [die Quelle](https://example.com/a).',
    });

    expect(docx.document).toContain('<w:hyperlink');
    expect(docx.text).toContain('die Quelle');
  }, 30_000);

  it('renders markdown tables as Word tables', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: '| Jahr | Film |\n| --- | --- |\n| 1953 | Blondinen |',
    });

    expect(docx.document).toContain('<w:tbl>');
    expect(docx.text).toContain('Blondinen');
  }, 30_000);

  // The answer cited [1]…[10] and the exported file listed nothing: only
  // `searchResults` was rendered, and document-grounded answers carry
  // `citations` instead.
  it('lists citations as sources when there are no searchResults', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: 'Monroe wurde 1926 geboren [1].',
      metadata: {
        citations: [
          {
            id: 1,
            title: 'Wikipedia: Marilyn Monroe',
            url: 'https://de.wikipedia.org/',
            snippet: 'Geboren 1926.',
          },
        ],
      },
    });

    expect(docx.text).toContain('Verwendete Quellen');
    expect(docx.text).toContain('Wikipedia: Marilyn Monroe');
  }, 30_000);

  it('prefers searchResults over citations when both are present', async () => {
    const docx = await exportDocx({
      ...ASSISTANT,
      content: 'Text [1].',
      metadata: {
        searchResults: [{ source: 'web', title: 'Aus der Websuche', content: 'Snippet.' }],
        citations: [{ id: 1, title: 'Aus dem Notebook', url: '', snippet: '' }],
      },
    });

    expect(docx.text).toContain('Aus der Websuche');
    expect(docx.text).not.toContain('Aus dem Notebook');
  }, 30_000);

  // Shipped mobile binaries post an ISO string here. A strict z.number() made
  // every tap a 400 and the app swallowed it.
  it('accepts an ISO-string timestamp from older mobile builds', async () => {
    const res = await postMessage({
      role: 'assistant',
      content: 'Kurzer Text.',
      timestamp: new Date(1_764_500_000_000).toISOString(),
    });

    expect(res.status).toBe(200);
    await res.arrayBuffer();
  }, 30_000);

  it('names the file after the answer heading', async () => {
    const res = await postMessage({
      ...ASSISTANT,
      content: '## Leben und Karriere\n\nEin Absatz.',
    });
    const disposition = res.headers.get('content-disposition') ?? '';

    expect(disposition).toContain('attachment');
    expect(disposition).toContain('Leben und Karriere.docx');
    await res.arrayBuffer();
  }, 30_000);

  it('rejects a body without content instead of shipping an empty file', async () => {
    const res = await postMessage({ role: 'assistant' });

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
  }, 30_000);
});
