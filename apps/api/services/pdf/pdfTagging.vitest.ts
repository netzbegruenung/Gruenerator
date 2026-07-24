import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { type PdfDocumentSpec } from './pdfDocument.js';
import { renderPdf } from './pdfRenderer.js';

function spec(title: string): PdfDocumentSpec {
  return {
    title,
    kind: 'document',
    language: 'de-DE',
    blocks: [{ type: 'paragraph', text: 'Ein Absatz.' }],
  };
}

/** Rohbytes des Metadatenstroms — bewusst nicht als Text, das ist der Prüfpunkt. */
async function xmpStream(title: string): Promise<PDFRawStream> {
  const result = await renderPdf(spec(title), { locale: 'de-DE' });
  const doc = await PDFDocument.load(result.bytes);
  const ref = doc.catalog.get(PDFName.of('Metadata'));
  const metadata = ref ? doc.context.lookup(ref) : null;
  expect(metadata).toBeInstanceOf(PDFRawStream);
  return metadata as PDFRawStream;
}

function decodeUtf8Strict(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const ENTITY = /^&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z_][\w.-]*);/;
const NAME = /^[A-Za-z_:][\w.:-]*/;

/**
 * Minimale, strikte XML-Wohlgeformtheitsprüfung. Bewusst von Hand statt über
 * einen HTML-toleranten Parser: genau die Fehler, die hier interessieren
 * (rohes `<` im Text, kaputte Entity), würde ein toleranter Parser schlucken.
 */
function assertWellFormedXml(xml: string): void {
  const stack: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const char = xml[i];
    if (char !== '<') {
      if (char === '&') {
        const rest = xml.slice(i);
        if (!ENTITY.test(rest)) throw new Error(`Ungültige Entity bei ${i}: ${rest.slice(0, 12)}`);
        i += ENTITY.exec(rest)![0].length;
        continue;
      }
      if (char === '>') throw new Error(`Unmaskiertes > bei ${i}`);
      i += 1;
      continue;
    }
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i);
      if (end === -1) throw new Error('Unbeendeter Kommentar');
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i);
      if (end === -1) throw new Error('Unbeendete Processing Instruction');
      i = end + 2;
      continue;
    }
    if (xml.startsWith('</', i)) {
      const name = NAME.exec(xml.slice(i + 2));
      if (!name) throw new Error(`Kein Elementname im End-Tag bei ${i}`);
      const end = xml.indexOf('>', i);
      if (end === -1) throw new Error('Unbeendetes End-Tag');
      const open = stack.pop();
      if (open !== name[0]) throw new Error(`</${name[0]}> schließt <${open ?? 'nichts'}>`);
      i = end + 1;
      continue;
    }
    const name = NAME.exec(xml.slice(i + 1));
    if (!name) throw new Error(`Kein Elementname im Start-Tag bei ${i}: ${xml.slice(i, i + 12)}`);
    i += 1 + name[0].length;
    // Attribute
    for (;;) {
      while (/\s/.test(xml[i] ?? '')) i += 1;
      if (xml.startsWith('/>', i)) {
        i += 2;
        break;
      }
      if (xml[i] === '>') {
        stack.push(name[0]);
        i += 1;
        break;
      }
      const attr = NAME.exec(xml.slice(i));
      if (!attr) throw new Error(`Kein Attributname bei ${i}: ${xml.slice(i, i + 12)}`);
      i += attr[0].length;
      if (xml[i] !== '=') throw new Error(`Attribut ohne = bei ${i}`);
      i += 1;
      const quote = xml[i];
      if (quote !== '"' && quote !== "'")
        throw new Error(`Attributwert ohne Anführungszeichen bei ${i}`);
      const end = xml.indexOf(quote, i + 1);
      if (end === -1) throw new Error('Unbeendeter Attributwert');
      if (xml.slice(i + 1, end).includes('<')) throw new Error(`Rohes < im Attributwert bei ${i}`);
      i = end + 1;
    }
  }
  if (stack.length > 0) throw new Error(`Nicht geschlossen: ${stack.join(', ')}`);
}

describe('XMP-Metadaten', () => {
  it('kodiert einen Titel mit Umlauten als UTF-8 samt BOM', async () => {
    const title = 'Wärmeplanung für Grünflächen und Straßen';
    const stream = await xmpStream(title);
    const bytes = Buffer.from(stream.contents);

    // Der BOM muss als EF BB BF auf der Leitung stehen, nicht als FF (latin1).
    expect(bytes.includes(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    expect(bytes.includes(0xff)).toBe(false);

    const xmp = decodeUtf8Strict(bytes);
    expect(xmp).toContain(`>${title}</rdf:li>`);
    expect(xmp).toContain('pdfuaid:part');
  });

  it('bleibt bei einem Emoji im Titel wohlgeformtes XML', async () => {
    const title = 'Klimaplan 🌱 2026';
    const stream = await xmpStream(title);
    const bytes = Buffer.from(stream.contents);

    const xmp = decodeUtf8Strict(bytes);
    expect(() => assertWellFormedXml(xmp)).not.toThrow();
    expect(xmp).toContain(title);
    // Das Surrogatpaar wurde früher zu 0x3C 0x3B — ein < mitten im Text.
    const inTitle = /<rdf:li xml:lang="x-default">([^<]*)<\/rdf:li>/.exec(xmp);
    expect(inTitle?.[1]).toBe(title);
  });

  it('maskiert kaufmännisches Und und spitze Klammern genau einmal', async () => {
    const stream = await xmpStream('Verkehr & Umwelt <Entwurf> 2026');
    const xmp = decodeUtf8Strict(Buffer.from(stream.contents));

    expect(xmp).toContain(
      '<rdf:li xml:lang="x-default">Verkehr &amp; Umwelt &lt;Entwurf&gt; 2026</rdf:li>'
    );
    expect(xmp).not.toContain('&amp;amp;');
    expect(xmp).not.toContain('&amp;lt;');
    expect(() => assertWellFormedXml(xmp)).not.toThrow();
  });

  it('lässt den Metadatenstrom unkomprimiert und als /Metadata /XML deklariert', async () => {
    const stream = await xmpStream('Testdokument');

    expect(stream.dict.get(PDFName.of('Filter'))).toBeUndefined();
    expect(String(stream.dict.get(PDFName.of('Type')))).toBe('/Metadata');
    expect(String(stream.dict.get(PDFName.of('Subtype')))).toBe('/XML');
  });
});
