/**
 * Zitierfähigkeit des erzeugten PDFs.
 *
 * Am 03.08.2026 lieferte `create_pdf` ein Dokument mit einem Quellenverzeichnis,
 * das keine Quelle erreichbar machte: `flattenInline` warf das Linkziel weg
 * (jede Adresse war toter Text), der Umbruch trennte überlange Wörter
 * zeichenweise (mitten im Prozent-Escape, also nicht einmal abtippbar), und die
 * Verweise im Text standen als wörtliches `[^1]` da — Markdown-Fußnotensyntax,
 * die ein PDF nicht kennt.
 *
 * Diese Datei prüft die drei Dinge, die eine Quelle benutzbar machen: das Ziel
 * ist da, es ist erreichbar, und es ist lesbar.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import { type PdfDocumentSpec } from './pdfDocument.js';
import { renderPdf } from './pdfRenderer.js';

vi.setConfig({ testTimeout: 30_000 });

const PAGE_H = 841.89;

const EURLEX = 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX%3A52026PC0077';

function spec(blocks: PdfDocumentSpec['blocks']): PdfDocumentSpec {
  return { title: 'Testdokument', kind: 'document', language: 'de-DE', blocks };
}

const render = (blocks: PdfDocumentSpec['blocks']) =>
  renderPdf(spec(blocks), { locale: 'de-DE', sender: null });

interface LinkAnnot {
  uri: string;
  rect: number[];
  flags: number | null;
  contents: string | null;
  hasStructParent: boolean;
}

/** Jede /Link-Annotation des Dokuments mit dem, was PDF/UA von ihr verlangt. */
async function linkAnnotations(bytes: Buffer): Promise<LinkAnnot[]> {
  const doc = await PDFDocument.load(bytes);
  const out: LinkAnnot[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i, PDFDict);
      if (!annot || String(annot.get(PDFName.of('Subtype'))) !== '/Link') continue;
      const action = annot.lookupMaybe(PDFName.of('A'), PDFDict);
      const uri = action?.get(PDFName.of('URI'));
      const rect = annot.lookupMaybe(PDFName.of('Rect'), PDFArray);
      const flags = annot.get(PDFName.of('F'));
      const contents = annot.get(PDFName.of('Contents'));
      out.push({
        uri: uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : '',
        rect: rect ? rect.asArray().map((n) => Number(String(n))) : [],
        flags: flags ? Number(String(flags)) : null,
        contents:
          contents instanceof PDFHexString || contents instanceof PDFString
            ? contents.decodeText()
            : null,
        hasStructParent: annot.get(PDFName.of('StructParent')) !== undefined,
      });
    }
  }
  return out;
}

/** Struktur-Rollen des ganzen Dokuments. */
async function allRoles(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const roles: string[] = [];
  const walk = (node: { role?: string; children?: unknown[] } | null): void => {
    if (!node) return;
    if (node.role) roles.push(node.role);
    for (const child of node.children ?? []) walk(child as { role?: string; children?: unknown[] });
  };
  for (let i = 1; i <= doc.numPages; i++) {
    walk((await (await doc.getPage(i)).getStructTree()) as { role?: string; children?: unknown[] });
  }
  await task.destroy();
  return roles;
}

/** Gezeichnete Textstücke, nach Grundlinie zu Zeilen zusammengefasst. */
async function drawnLines(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const doc = await task.promise;
  const byBaseline = new Map<string, { x: number; text: string }[]>();
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const t = item.transform as number[];
      const key = `${i}:${Math.round(PAGE_H - (t[5] ?? 0))}`;
      const bucket = byBaseline.get(key) ?? [];
      bucket.push({ x: t[4] ?? 0, text: item.str });
      byBaseline.set(key, bucket);
    }
  }
  await task.destroy();
  return [...byBaseline.entries()]
    .sort((a, b) => Number(a[0].split(':')[1]) - Number(b[0].split(':')[1]))
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join('')
        .trim()
    );
}

describe('ein Linkziel überlebt bis ins PDF', () => {
  it('macht aus einem Markdown-Link eine anklickbare Annotation', async () => {
    const { bytes } = await render([
      { type: 'paragraph', text: `Siehe den [Vorschlag der Kommission](${EURLEX}).` },
    ]);
    const links = await linkAnnotations(Buffer.from(bytes));

    expect(links).toHaveLength(1);
    expect(links[0]!.uri).toBe(EURLEX);
    // /F 4 = Print. PDF/UA 7.18.1 verlangt das Flag; ohne es beanstandet
    // veraPDF jede Annotation.
    expect(links[0]!.flags).toBe(4);
    // Eine Fläche mit Ausdehnung — ein leeres Rect wäre nicht klickbar.
    const [x0, y0, x1, y1] = links[0]!.rect;
    expect(x1! - x0!).toBeGreaterThan(1);
    expect(y1! - y0!).toBeGreaterThan(1);
  });

  it('verlinkt auch eine nackte URL im Fließtext', async () => {
    const { bytes } = await render([
      { type: 'paragraph', text: `Quelle: ${EURLEX} — Stand heute.` },
    ]);
    const links = await linkAnnotations(Buffer.from(bytes));
    expect(links.map((l) => l.uri)).toEqual([EURLEX]);
  });

  it('hängt den Link als /Link-Element mit Ziel-Ansage in den Strukturbaum', async () => {
    const { bytes } = await render([
      { type: 'paragraph', text: `Siehe [den Vorschlag](${EURLEX}).` },
    ]);
    const buf = Buffer.from(bytes);

    expect(await allRoles(buf)).toContain('Link');
    const [link] = await linkAnnotations(buf);
    // Ohne StructParent findet der Screenreader die Annotation nicht im Baum,
    // ohne /Contents kündigt er sie gar nicht erst an.
    expect(link!.hasStructParent).toBe(true);
    expect(link!.contents).toBe(EURLEX);
  });

  it('lässt kein ausführbares Ziel in eine /URI-Aktion', async () => {
    // Acrobat kennt `javascript:`, und `file:` greift auf die Platte der
    // lesenden Person zu. Der Text kommt aus einem Sprachmodell und von
    // fremden Webseiten — hier gilt eine Erlaubnisliste.
    const { bytes } = await render([
      { type: 'paragraph', text: '[Klick](javascript:alert(1)) und [Datei](file:///etc/passwd).' },
    ]);
    expect(await linkAnnotations(Buffer.from(bytes))).toHaveLength(0);
  });

  it('verlinkt eine URL in einer Tabellenzelle', async () => {
    const { bytes } = await render([
      {
        type: 'table',
        columns: ['Quelle', 'Adresse'],
        rows: [['Rat der EU', 'https://www.consilium.europa.eu/de/press/']],
      },
    ]);
    expect((await linkAnnotations(Buffer.from(bytes))).map((l) => l.uri)).toEqual([
      'https://www.consilium.europa.eu/de/press/',
    ]);
  });
});

describe('eine überlange URL bleibt lesbar', () => {
  const LONG = `${EURLEX}&from=DE&locale=de`;

  /** Die gezeichneten Stücke EINER Adresse, in Zeichenreihenfolge. */
  async function urlFragments(bytes: Buffer, url: string): Promise<string[]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
    const doc = await task.promise;
    const items: Array<{ y: number; x: number; text: string }> = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        if (!url.includes(item.str)) continue;
        const t = item.transform as number[];
        items.push({ y: PAGE_H - (t[5] ?? 0), x: t[4] ?? 0, text: item.str });
      }
    }
    await task.destroy();
    return items.sort((a, b) => a.y - b.y || a.x - b.x).map((i) => i.text);
  }

  it('bricht an ihren eigenen Trennzeichen, nicht mitten im Prozent-Escape', async () => {
    // Drei Spalten mit langem Quellentitel — genau der Aufbau, den der Prompt
    // bis hierher verlangte und in dem das Verzeichnis am 03.08.2026 zerfiel.
    const { bytes } = await render([
      {
        type: 'table',
        columns: ['Nr.', 'Quelle', 'URL'],
        rows: [
          [
            '1',
            'Europäische Kommission: Vorschlag für ein Klimaziel 2040 mit 90 Prozent Minderung',
            LONG,
          ],
        ],
      },
    ]);
    const fragments = await urlFragments(Buffer.from(bytes), LONG);

    expect(fragments.length).toBeGreaterThan(1);
    // Nichts geht verloren: aneinandergehängt ist es wieder die Adresse.
    expect(fragments.join('')).toBe(LONG);
    // Jedes Stück außer dem letzten endet auf einem Trennzeichen. Zeichenweise
    // getrennt stand dort "…/TXT/?u" / "ri=CELEX%3A…" — weder wiederzuerkennen
    // noch abzutippen, und anklickbar war es damals auch nicht.
    for (const fragment of fragments.slice(0, -1)) {
      expect(fragment).toMatch(/[/\-._?&=,;:#+~%]$/);
    }
  });

  it('bleibt über den Umbruch hinweg auf jeder Zeile anklickbar', async () => {
    const { bytes } = await render([
      {
        type: 'table',
        columns: ['Nr.', 'Quelle', 'URL'],
        rows: [['1', 'Europäische Kommission: Vorschlag für ein Klimaziel 2040', LONG]],
      },
    ]);
    const links = await linkAnnotations(Buffer.from(bytes));
    // Eine Annotation je Zeile — ein einziges Rechteck über zwei Zeilen wäre
    // ein Kasten, der auch den Text dazwischen überdeckt.
    expect(links.length).toBeGreaterThan(1);
    expect(new Set(links.map((l) => l.uri))).toEqual(new Set([LONG]));
  });
});
