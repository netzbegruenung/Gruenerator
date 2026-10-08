/**
 * Local-first beleg reading. A text PDF is read in the browser (pdfjs) and
 * classified locally; only if that is unsure does its *text* go to the server.
 * Only scans and photos — which need OCR — are sent as files. The file itself
 * is never stored server-side.
 */
import { classifyBelegText } from '@gruenerator/shared/reisekosten';

import { extractBelegFromFile, extractBelegFromText } from '../api';

import type { BelegMeta } from '@gruenerator/contracts';

/** Below this, a PDF's text layer is treated as missing (a scan). */
const MIN_TEXT_CHARS = 40;
const MAX_TEXT_CHARS = 20000;

async function pdfText(bytes: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  // `slice`: pdfjs transfers the buffer it is given; the caller still needs the bytes.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      // `hasEOL` marks line ends; joining on it keeps "von … nach …" on one line.
      pages.push(
        content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('')
      );
    }
    return pages.join('\n');
  } finally {
    void task.destroy();
  }
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function readBeleg(file: File): Promise<BelegMeta> {
  const bytes = await file.arrayBuffer();
  const base = {
    id: crypto.randomUUID(),
    dateiname: file.name,
    mimeType: file.type || (isPdf(file) ? 'application/pdf' : 'application/octet-stream'),
    groesse: file.size,
    sha256: await sha256(bytes),
  };

  const text = isPdf(file) ? (await pdfText(bytes)).trim() : '';
  if (text.length >= MIN_TEXT_CHARS) {
    const lokal = classifyBelegText(text);
    if (lokal.sicher) {
      const { sicher: _sicher, ...felder } = lokal;
      return { ...base, ...felder, quelle: 'lokal' };
    }
    return { ...base, ...(await extractBelegFromText(text.slice(0, MAX_TEXT_CHARS), file.name)) };
  }
  return { ...base, ...(await extractBelegFromFile(file)) };
}
