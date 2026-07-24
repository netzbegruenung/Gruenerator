import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked, type Token, type Tokens } from 'marked';
import { describe, expect, it } from 'vitest';

import { contentToBlocks, escapeInline, htmlToBlocks, looksLikeHtml } from './contentToBlocks.js';
import { pdfBlockSchema, type PdfBlock } from './pdfDocument.js';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'export-content'
);

const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

const FIXTURE_NAMES = [
  'markdown-basic.md',
  'markdown-table.md',
  'markdown-nested-list.md',
  'html-blocknote.html',
  'html-messy.html',
  'edge-empty.md',
  'edge-long-word.md',
  'edge-umlaute-emoji.md',
  'edge-huge.md',
  'edge-code-quote.md',
];

// ── Hilfen ───────────────────────────────────────────────────────────────────

const types = (blocks: PdfBlock[]): string[] => blocks.map((b) => b.type);

/** Aller Text, den ein Block in irgendeiner Form trägt. */
function blockText(block: PdfBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return block.text;
    case 'quote':
    case 'note':
      return `${block.text} ${block.title ?? ''} ${'source' in block ? (block.source ?? '') : ''}`;
    case 'list':
      return block.items.map((i) => (typeof i === 'string' ? i : i.text)).join(' ');
    case 'table':
      return [block.caption ?? '', ...block.columns, ...block.rows.flat()].join(' ');
    case 'keyvalue':
      return block.entries.map((e) => `${e.label} ${e.value}`).join(' ');
    default:
      return '';
  }
}

const WORD_RE = /[\p{L}\p{N}]{2,}/gu;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(WORD_RE) ?? []);
}

/**
 * Sichtbare Wörter der Quelle. Nicht sichtbar und deshalb ausgenommen: Tags,
 * Attribute und Entity-Namen im HTML sowie die Sprachangabe am Codezaun.
 */
function sourceWords(content: string, isHtml: boolean): Set<string> {
  const visible = isHtml
    ? content
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
    : content.replace(/^```[^\n]*/gm, '```');
  return words(visible);
}

/**
 * Spiegelt die Inline-Auswertung des Renderers (`inlineSegments` →
 * `marked.Lexer.lexInline` + `decodeEntities` in pdfRenderer.ts). Blocktext wird
 * dort ein ZWEITES Mal als Markdown gelesen — nur so lässt sich hier zeigen,
 * dass aus HTML gewonnener Text das unbeschadet übersteht.
 */
function asRenderedByPdf(text: string): string {
  const decode = (t: string): string =>
    t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  const flatten = (tokens: Token[]): string => {
    let out = '';
    for (const token of tokens) {
      switch (token.type) {
        case 'strong':
        case 'em':
        case 'link':
        case 'del':
          out += flatten((token as Tokens.Strong).tokens);
          break;
        case 'codespan':
          out += (token as Tokens.Codespan).text;
          break;
        case 'br':
          out += '\n';
          break;
        case 'escape':
          out += (token as Tokens.Escape).text;
          break;
        case 'text': {
          const t = token as Tokens.Text;
          out += t.tokens?.length ? flatten(t.tokens) : decode(t.text);
          break;
        }
        default: {
          const raw = (token as { raw?: string }).raw;
          if (raw) out += decode(raw);
        }
      }
    }
    return out;
  };
  return flatten(marked.Lexer.lexInline(text.trim()));
}

// ── Korpus-Invarianten ───────────────────────────────────────────────────────

describe('contentToBlocks — Korpus', () => {
  it.each(FIXTURE_NAMES)('%s verliert kein sichtbares Wort', (name) => {
    const content = fixture(name);
    const blocks = contentToBlocks(content);
    const produced = words(blocks.map(blockText).join(' '));
    const missing = [...sourceWords(content, name.endsWith('.html'))].filter(
      (word) => !produced.has(word)
    );
    expect(missing).toEqual([]);
  });

  it.each(FIXTURE_NAMES)('%s erzeugt ausschließlich schemakonforme Blöcke', (name) => {
    const blocks = contentToBlocks(fixture(name));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(() => pdfBlockSchema.parse(block)).not.toThrow();
  });

  it.each(FIXTURE_NAMES)('%s erzeugt keine Formularblöcke', (name) => {
    const blocks = contentToBlocks(fixture(name));
    expect(types(blocks)).not.toContain('field');
    expect(types(blocks)).not.toContain('signature');
  });
});

// ── Markdown ─────────────────────────────────────────────────────────────────

describe('Markdown-Pfad', () => {
  it('bildet Überschriften, Absätze und Ebene vier auf das Blockmodell ab', () => {
    const blocks = contentToBlocks(fixture('markdown-basic.md'));
    expect(types(blocks)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'paragraph',
    ]);
    const headings = blocks.filter((b) => b.type === 'heading');
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 3]);
    // #### wird auf Ebene 3 geklemmt, der Text bleibt.
    expect(headings[3].text).toBe('Sehr tiefe Ebene');
  });

  it('lässt Inline-Markdown für den Renderer stehen', () => {
    const blocks = contentToBlocks(fixture('markdown-basic.md'));
    const last = blocks[blocks.length - 1];
    expect(last.type).toBe('paragraph');
    expect(blockText(last)).toContain('***fett und kursiv***');
    expect(blockText(last)).toContain('`Codeschnipsel`');
  });

  it('übernimmt Tabellen mit Kopfzeile und Zellen', () => {
    const blocks = contentToBlocks(fixture('markdown-table.md'));
    const tables = blocks.filter((b) => b.type === 'table');
    expect(tables).toHaveLength(2);
    expect(tables[0].columns).toEqual(['Maßnahme', 'Bereich', 'Kosten 2027', 'Kosten 2028']);
    expect(tables[0].rows).toHaveLength(4);
    expect(tables[0].rows[0]).toEqual([
      'Radschnellweg Nord',
      'Verkehr',
      '1.200.000 €',
      '800.000 €',
    ]);
    expect(tables[1].columns).toEqual(['Jahr', 'Anteil Radverkehr']);
  });

  it('gibt die Verschachtelungstiefe weiter, statt sie einzuebnen', () => {
    const lists = contentToBlocks(fixture('markdown-nested-list.md')).filter(
      (b) => b.type === 'list'
    );
    expect(lists).toHaveLength(3);
    expect(lists[0].ordered).toBeFalsy();
    expect(lists[0].items).toEqual([
      { text: 'Verkehr', level: 0, ordered: false },
      { text: 'Radwege ausbauen', level: 1, ordered: false },
      { text: 'Busspuren einrichten', level: 1, ordered: false },
      { text: 'Energie', level: 0, ordered: false },
      { text: 'Photovoltaik auf Schuldächern', level: 1, ordered: false },
      { text: 'Wärmeplanung beschleunigen', level: 1, ordered: false },
      { text: 'Soziales', level: 0, ordered: false },
    ]);
    expect(lists[1].ordered).toBe(true);
    // Entscheidend: die Unterebene zählt eigenständig. Lief sie in der
    // Hauptnummerierung mit, wurde aus "2. / 2.1 / 3." ein falsches "3. / 4.".
    expect(lists[1].items).toEqual([
      { text: 'Beschluss im Ausschuss', level: 0, ordered: true },
      { text: 'Ausschreibung', level: 0, ordered: true },
      { text: 'Vorbereitung der Unterlagen', level: 1, ordered: true },
      { text: 'Veröffentlichung', level: 1, ordered: true },
      { text: 'Vergabe', level: 0, ordered: true },
    ]);
    expect(lists[2].items).toEqual([
      { text: '[ ] Offene Aufgabe', level: 0, ordered: false },
      { text: '[x] Erledigte Aufgabe', level: 0, ordered: false },
    ]);
  });

  it('macht aus Blockzitat, Codeblock und Trennlinie quote, note und divider', () => {
    const blocks = contentToBlocks(fixture('edge-code-quote.md'));
    expect(types(blocks)).toEqual([
      'heading',
      'paragraph',
      'quote',
      'paragraph',
      'note',
      'divider',
      'paragraph',
    ]);
    const note = blocks.find((b) => b.type === 'note');
    expect(note).toBeDefined();
    expect(note?.title).toBeUndefined();
    // Der Renderer respektiert \n — die Codestruktur überlebt.
    expect(note?.text.split('\n')).toHaveLength(5);
    expect(asRenderedByPdf(note?.text ?? '')).toContain('"endpoint": "/api/exports/pdf"');
  });

  it('hält Umlaute, Emoji und ein unteilbares Wort unverändert', () => {
    const umlaute = contentToBlocks(fixture('edge-umlaute-emoji.md'));
    expect(blockText(umlaute[0])).toBe('Grüße aus Österreich 🌻');
    expect(blockText(umlaute.find((b) => b.type === 'list')!)).toContain('🌳');

    const long = contentToBlocks(fixture('edge-long-word.md'));
    expect(blockText(long[2])).toMatch(/^Donaudampfschifffahrts.*versammlung$/);
  });

  it('verarbeitet ein sehr großes Dokument ohne Verlust und ohne Schemabruch', () => {
    const blocks = contentToBlocks(fixture('edge-huge.md'));
    expect(blocks.filter((b) => b.type === 'heading').length).toBeGreaterThan(20);
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.rows).toHaveLength(60);
  });
});

// ── HTML ─────────────────────────────────────────────────────────────────────

describe('HTML-Pfad', () => {
  it('erkennt HTML gegenüber Markdown', () => {
    expect(looksLikeHtml(fixture('html-blocknote.html'))).toBe(true);
    expect(looksLikeHtml(fixture('html-messy.html'))).toBe(true);
    expect(looksLikeHtml(fixture('markdown-basic.md'))).toBe(false);
    expect(looksLikeHtml(fixture('markdown-table.md'))).toBe(false);
  });

  it('bildet strukturiertes Editor-HTML auf die Blockfolge ab', () => {
    const blocks = contentToBlocks(fixture('html-blocknote.html'));
    expect(types(blocks)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'list',
      'list',
      'table',
      'quote',
      'divider',
      'paragraph',
    ]);
    const lists = blocks.filter((b) => b.type === 'list');
    expect(lists[0].ordered).toBeFalsy();
    expect(lists[1].ordered).toBe(true);
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.columns).toEqual(['Quartier', 'Gebäude', 'Status']);
    expect(table?.rows).toEqual([
      ['Nordstadt', '820', 'erfasst'],
      ['Südstadt', '1.140', 'in Arbeit'],
      ['Weststadt', '440', 'offen'],
    ]);
  });

  it('rettet unsauber verschachteltes HTML in Absätze und Listen', () => {
    const blocks = contentToBlocks(fixture('html-messy.html'));
    expect(types(blocks)).toContain('list');
    const list = blocks.find((b) => b.type === 'list');
    expect(list?.items).toEqual([
      { text: 'TOP 1 – Begrüßung', level: 0, ordered: false },
      { text: 'TOP 2 – Haushalt', level: 0, ordered: false },
      { text: 'TOP 3 – Verschiedenes', level: 0, ordered: false },
    ]);
    // <br> bleibt ein Zeilenumbruch, Quell-Zeilenumbrüche werden zu Leerzeichen.
    expect(blocks.some((b) => blockText(b).includes('18:00 Uhr\nEnde: 20:30 Uhr'))).toBe(true);
    // <span style="font-weight:700"> ist keine Auszeichnung, die das
    // Blockmodell kennt — der Text bleibt, die Formatierung fällt weg.
    expect(
      blocks.some(
        (b) => blockText(b) === 'Anwesend waren elf Mitglieder. Die Beschlussfähigkeit war gegeben.'
      )
    ).toBe(true);
  });

  it('nimmt bei fehlendem <thead> die erste Zeile als Kopfzeile', () => {
    const table = contentToBlocks(fixture('html-messy.html')).find((b) => b.type === 'table');
    expect(table?.columns).toEqual(['TOP', 'Ergebnis']);
    expect(table?.rows).toEqual([
      ['1', 'angenommen'],
      ['2', 'vertagt'],
    ]);
  });

  it('überlebt die zweite Inline-Auswertung des Renderers unverändert', () => {
    const blocks = contentToBlocks(fixture('html-messy.html'));
    const rendered = blocks.map((b) => asRenderedByPdf(blockText(b)));
    expect(rendered.some((t) => t.includes('5 * 3 = 15'))).toBe(true);
    expect(rendered.some((t) => t.includes('Unterstrich_mitten_im_Wort'))).toBe(true);
  });

  it('dekodiert Entities genau einmal', () => {
    const blocks = contentToBlocks(fixture('html-messy.html'));
    const entity = blocks.find((b) => blockText(b).includes('Kleinerzeichen'));
    expect(entity).toBeDefined();
    // &amp;lt; im Quelltext ⇒ sichtbar bleibt "&lt;", NICHT "<".
    expect(asRenderedByPdf(blockText(entity!))).toBe(
      '&lt; darf nicht zu einem echten Kleinerzeichen werden.'
    );
    expect(escapeInline('&lt;')).toBe('&amp;lt;');
    expect(asRenderedByPdf(escapeInline('a < b & c > d'))).toBe('a < b & c > d');
  });

  it('übernimmt Definitionslisten als keyvalue', () => {
    const blocks = htmlToBlocks(
      '<dl><dt>Datum</dt><dd>01.03.2026</dd><dt>Ort</dt><dd>Rathaus</dd></dl>'
    );
    expect(blocks).toEqual([
      {
        type: 'keyvalue',
        entries: [
          { label: 'Datum', value: '01.03.2026' },
          { label: 'Ort', value: 'Rathaus' },
        ],
      },
    ]);
  });
});

// ── Randfälle ────────────────────────────────────────────────────────────────

describe('Randfälle', () => {
  it('gibt für leeren Inhalt einen Ersatzblock statt einer leeren Liste zurück', () => {
    for (const input of ['', '   \n\n  ', fixture('edge-empty.md'), '<div>  </div>']) {
      const blocks = contentToBlocks(input);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blockText(blocks[0]).length).toBeGreaterThan(0);
    }
  });

  it('faltet mehr als acht Spalten in die letzte Spalte, statt sie zu verwerfen', () => {
    const header = Array.from({ length: 11 }, (_, i) => `S${i + 1}`);
    const row = Array.from({ length: 11 }, (_, i) => `W${i + 1}`);
    const markdown = `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n| ${row.join(' | ')} |`;
    const table = contentToBlocks(markdown).find((b) => b.type === 'table');
    expect(table?.columns).toHaveLength(8);
    expect(table?.columns[7]).toBe('S8 · S9 · S10 · S11');
    expect(table?.rows[0]).toHaveLength(8);
    expect(table?.rows[0][7]).toBe('W8 · W9 · W10 · W11');
  });

  it('verliert keine Zelle einer Zeile, die länger als die Kopfzeile ist', () => {
    const table = htmlToBlocks(
      '<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>'
    ).find((b) => b.type === 'table');
    expect(table?.columns).toEqual(['A', 'B']);
    // Der Renderer faltet die Überzahl in die letzte Spalte; hier darf sie
    // schon gar nicht erst wegfallen.
    expect(table?.rows[0]).toEqual(['1', '2', '3']);
  });

  it('stellt rowspan-Zellen in die Spalte, in der sie im Browser stünden', () => {
    const table = htmlToBlocks(
      '<table>' +
        '<tr><th>Land</th><th>Stadt</th><th>Stimmen</th></tr>' +
        '<tr><td rowspan="2">Bayern</td><td>München</td><td>100</td></tr>' +
        '<tr><td>Nürnberg</td><td>50</td></tr>' +
        '</table>'
    ).find((b) => b.type === 'table');
    expect(table?.columns).toEqual(['Land', 'Stadt', 'Stimmen']);
    // Ohne Rasterexpansion stand hier ['Nürnberg', '50'] — also Nürnberg unter
    // "Land" und 50 unter "Stadt".
    expect(table?.rows).toEqual([
      ['Bayern', 'München', '100'],
      ['', 'Nürnberg', '50'],
    ]);
  });

  it('füllt colspan-Zellen auf, statt den Folgewert nach links rutschen zu lassen', () => {
    const table = htmlToBlocks(
      '<table>' +
        '<tr><th>Posten</th><th>2027</th><th>2028</th></tr>' +
        '<tr><td colspan="2">Personal gesamt</td><td>120.000</td></tr>' +
        '</table>'
    ).find((b) => b.type === 'table');
    // Der Betrag gehört unter 2028; dupliziert wird die überspannte Zelle nicht.
    expect(table?.rows).toEqual([['Personal gesamt', '', '120.000']]);
  });

  it('deckelt eine absurde Spannweite, statt das Raster explodieren zu lassen', () => {
    const table = htmlToBlocks(
      '<table><tr><th>A</th><th>B</th></tr><tr><td colspan="10000">Weit</td><td>Ende</td></tr></table>'
    ).find((b) => b.type === 'table');
    expect(table?.rows[0]).toHaveLength(8);
    expect(table?.rows[0][0]).toBe('Weit');
    expect(table?.rows[0][7]).toBe('Ende');
  });

  it('trennt verschachtelte Tabellenzellen, statt sie zu verkleben', () => {
    const table = htmlToBlocks(
      '<table><tr><td>Aussen<table><tr><td>Innen1</td><td>Innen2</td></tr></table></td></tr></table>'
    ).find((b) => b.type === 'table');
    expect(table?.columns).toEqual(['Aussen Innen1 Innen2']);
  });

  it('holt Markdown-Zellen jenseits der Kopfzeilenbreite zurück', () => {
    const table = contentToBlocks(
      '| Name | Wert |\n| --- | --- |\n| A | 1 |\n| B | 2 | 3 | 4 |'
    ).find((b) => b.type === 'table');
    expect(table?.columns).toEqual(['Name', 'Wert']);
    // marked kappt die zweite Zeile auf zwei Zellen — "3" und "4" waren weg.
    expect(table?.rows).toEqual([
      ['A', '1'],
      ['B', '2', '3', '4'],
    ]);
  });

  it('zählt einen escapten Trennstrich nicht als Spaltengrenze', () => {
    const table = contentToBlocks('| Name | Wert |\n| --- | --- |\n| B | 2 \\| 3 | 4 |').find(
      (b) => b.type === 'table'
    );
    expect(table?.rows).toEqual([['B', '2 | 3', '4']]);
  });

  it('rettet einen überlangen keyvalue-Wert als Folgeabsatz', () => {
    const value = `${'a'.repeat(2050)} Schlusswort`;
    const blocks = htmlToBlocks(`<dl><dt>Bericht</dt><dd>${value}</dd></dl>`);
    expect(types(blocks)).toEqual(['keyvalue', 'paragraph']);
    const kv = blocks.find((b) => b.type === 'keyvalue');
    expect(kv?.entries[0].value.length).toBeLessThanOrEqual(2000);
    expect(blockText(blocks[1])).toContain('Schlusswort');
  });

  it('rettet eine überlange Tabellenbeschriftung als Folgeabsatz', () => {
    const caption = `${'Wort '.repeat(80)}Schlusswort`;
    const blocks = htmlToBlocks(
      `<table><caption>${caption}</caption><tr><th>A</th></tr><tr><td>1</td></tr></table>`
    );
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.caption?.length).toBeLessThanOrEqual(300);
    expect(blocks.some((b) => blockText(b).includes('Schlusswort'))).toBe(true);
  });

  it('rettet einen überlangen Listeneintrag als Folgeabsatz', () => {
    const item = `${'wort '.repeat(4200)}Schlusswort`;
    const blocks = htmlToBlocks(`<ul><li>${item}</li></ul>`);
    expect(types(blocks)).toEqual(['list', 'paragraph']);
    const list = blocks.find((b) => b.type === 'list');
    const first = list?.items[0];
    expect(
      typeof first === 'string' ? first.length : (first?.text.length ?? 0)
    ).toBeLessThanOrEqual(20000);
    expect(blockText(blocks[blocks.length - 1])).toContain('Schlusswort');
  });

  it('behandelt rohes HTML innerhalb von Markdown über den HTML-Pfad', () => {
    const blocks = contentToBlocks(
      '# Titel\n\n<table><tr><th>A</th></tr><tr><td>1</td></tr></table>\n\nEnde.'
    );
    expect(types(blocks)).toEqual(['heading', 'table', 'paragraph']);
  });

  it('macht aus einem verirrten Listeneintrag einen Absatz', () => {
    expect(htmlToBlocks('<li>Allein</li>')).toEqual([{ type: 'paragraph', text: 'Allein' }]);
  });
});
