// Generates Word (.docx) versions of the legal pages (Datenschutzerklärung,
// Nutzungsbedingungen, Impressum), read from the React components in
// apps/web/src/components/pages/Impressum_Datenschutz_Terms/.
//
// Run:  node apps/api/scripts/generate-legal-docx.mjs
// Output: <repo-root>/legal-exports/{Datenschutz,Nutzungsbedingungen,Impressum}.docx
//
// Resolves the `docx` dependency from apps/api/node_modules regardless of cwd.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../legal-exports');

const PRIMARY_URL = 'https://gruenerator.eu';

// --- Inline markup parser -------------------------------------------------
// Supports **bold** and [[text|url]] hyperlinks within a string.
function inlineRuns(text) {
  const runs = [];
  // Split on links first, keeping the delimiters.
  const linkRe = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
  let last = 0;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) runs.push(...boldRuns(text.slice(last, m.index)));
    runs.push(
      new ExternalHyperlink({
        link: m[2],
        children: [new TextRun({ text: m[1], style: 'Hyperlink' })],
      })
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(...boldRuns(text.slice(last)));
  return runs;
}

function boldRuns(text) {
  const parts = text.split('**');
  const runs = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '') continue;
    runs.push(new TextRun({ text: parts[i], bold: i % 2 === 1 }));
  }
  return runs;
}

// --- Block helpers --------------------------------------------------------
const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};

function title(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 40 })],
    spacing: { after: 240 },
  });
}

function heading(level, text) {
  return new Paragraph({
    children: inlineRuns(text),
    heading: HEADING_BY_LEVEL[level],
    spacing: { before: level <= 2 ? 320 : 240, after: 120 },
  });
}

function para(text) {
  return new Paragraph({ children: inlineRuns(text), spacing: { after: 140 } });
}

function bullet(text, level = 0) {
  return new Paragraph({ children: inlineRuns(text), bullet: { level }, spacing: { after: 60 } });
}

function buildTable(head, rows) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, bold) =>
    new TableCell({
      borders,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: !!bold })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
    ],
  });
}

// Render an array of block descriptors into docx elements.
function render(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.title) out.push(title(b.title));
    else if (b.h) out.push(heading(b.h, b.text));
    else if (b.p !== undefined) out.push(para(b.p));
    else if (b.li !== undefined) out.push(bullet(b.li, b.level || 0));
    else if (b.table) out.push(buildTable(b.table.head, b.table.rows));
    else if (b.spacer) out.push(new Paragraph({ children: [], spacing: { after: 80 } }));
  }
  return out;
}

// --- Content: read from the React pages ------------------------------------
// The pages are the single source. This script used to carry its own copy of
// each text, and the Datenschutz copy drifted until four sub-processors were
// missing from the DOCX (#3175). The pages are static JSX made of a handful of
// HTML tags, so they are parsed rather than rendered; any construct outside
// that set throws instead of being dropped from a legal document.

const PAGES_DIR = resolve(__dirname, '../../web/src/components/pages/Impressum_Datenschutz_Terms');
const JSX_CONSTANTS = { PRIMARY_URL };
const SPACE = '\u0001';
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'li', 'th', 'td']);

function decodeText(raw) {
  // JSX whitespace: only the side of a line that touches a line break is
  // trimmed, lines left empty are dropped, the rest joined by one space.
  const lines = raw.split('\n');
  const text = lines
    .map((l, i) => {
      const start = i > 0 ? l.trimStart() : l;
      return i < lines.length - 1 ? start.trimEnd() : start;
    })
    .filter(Boolean)
    .join(' ');
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&');
}

function pageBlocks(file) {
  const source = readFileSync(resolve(PAGES_DIR, file), 'utf8');
  const open = source.indexOf('<div className="page-container">');
  const close = source.lastIndexOf('</div>');
  if (open < 0 || close < 0) throw new Error(`${file}: page-container not found`);
  const jsx = source
    .slice(open + '<div className="page-container">'.length, close)
    .replace(/\{' '\}/g, SPACE)
    .replace(/\{([A-Z_]+)\}/g, (_, name) => {
      if (!(name in JSX_CONSTANTS)) throw new Error(`${file}: unknown JSX constant {${name}}`);
      return JSX_CONSTANTS[name];
    });
  if (/[{}]/.test(jsx)) throw new Error(`${file}: unsupported JSX expression`);

  const blocks = [];
  let buf = null;
  let href = null;
  let table = null;
  let row = null;
  let inHead = false;
  const tagRe = /<(\/?)([a-z0-9]+)([^>]*?)\/?>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(jsx)) !== null) {
    const text = decodeText(jsx.slice(last, m.index));
    if (buf !== null) buf += text;
    else if (text.replaceAll(SPACE, '').trim())
      throw new Error(`${file}: text outside a block: ${text}`);
    last = m.index + m[0].length;

    const [, closing, tag, attrs] = m;
    const done = () => buf.replaceAll(SPACE, ' ').replace(/ {2,}/g, ' ').trim();
    if (!closing) {
      if (BLOCK_TAGS.has(tag)) buf = '';
      else if (tag === 'strong') buf += '**';
      else if (tag === 'br') buf += '\n';
      else if (tag === 'a') {
        const link = /href="([^"]*)"/.exec(attrs)?.[1] ?? /href=\{?([^\s}]+)/.exec(attrs)?.[1];
        if (!link) throw new Error(`${file}: <a> without href`);
        href = link.startsWith('/') ? PRIMARY_URL + link : link;
        buf += '[[';
      } else if (tag === 'table') table = { head: [], rows: [] };
      else if (tag === 'thead') inHead = true;
      else if (tag === 'tr') row = [];
      else if (tag !== 'ul' && tag !== 'tbody')
        throw new Error(`${file}: unsupported tag <${tag}>`);
      continue;
    }
    if (tag === 'h1') blocks.push({ title: done() });
    else if (tag === 'h2' || tag === 'h3') blocks.push({ h: Number(tag[1]), text: done() });
    else if (tag === 'p') blocks.push({ p: done() });
    else if (tag === 'li') blocks.push({ li: done() });
    else if (tag === 'th' || tag === 'td')
      row.push(
        done()
          .replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, '$1')
          .replaceAll('**', '')
      );
    else if (tag === 'strong') buf += '**';
    else if (tag === 'a') buf += `|${href}]]`;
    else if (tag === 'thead') inHead = false;
    else if (tag === 'tr') {
      if (inHead) table.head = row;
      else table.rows.push(row);
    } else if (tag === 'table') blocks.push({ table });
    if (BLOCK_TAGS.has(tag)) buf = null;
  }
  return blocks;
}

const datenschutz = pageBlocks('Datenschutz.tsx');
const nutzungsbedingungen = pageBlocks('Nutzungsbedingungen.tsx');
const impressum = pageBlocks('Impressum.tsx');

// Paragraphs may contain newlines -> split into line breaks within one block.
function expandNewlines(blocks) {
  return blocks.flatMap((b) => {
    if (b.p !== undefined && b.p.includes('\n')) {
      return b.p.split('\n').map((line) => ({ p: line }));
    }
    return [b];
  });
}

async function buildDoc(blocks) {
  return new Document({
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    sections: [{ children: render(expandNewlines(blocks)) }],
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const jobs = [
    ['Datenschutz.docx', datenschutz],
    ['Impressum.docx', impressum],
    ['Nutzungsbedingungen.docx', nutzungsbedingungen],
  ];
  for (const [name, blocks] of jobs) {
    const doc = await buildDoc(blocks);
    const buffer = await Packer.toBuffer(doc);
    const target = resolve(OUT_DIR, name);
    await writeFile(target, buffer);
    console.log(`✓ ${name} (${(buffer.length / 1024).toFixed(1)} KB) -> ${target}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
