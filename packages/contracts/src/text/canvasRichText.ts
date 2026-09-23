/**
 * Markdown-lite ⇄ `RichTextDoc` — die Brücke zwischen dem flachen Textfeld
 * eines Sharepics und dem tiptap-Editor, der es bearbeitet.
 *
 * Das Dokumentmodell ist das tiptap-freie `RichTextDoc` aus
 * `schemas/richtext.ts` (Marks bold/italic/underline, Knoten paragraph,
 * bulletList, orderedList, listItem, text, hardBreak). Eine Zeile des Feldes
 * ist ein Absatz; eine Markerzeile ein Listenpunkt; zusammenhängende Punkte
 * eine Liste. Blöcke werden mit `\n` verbunden, ohne Leerzeilen — dieselbe
 * Form, die `sanitizeField` und die Prompt-Regeln erzeugen.
 *
 * DOM-frei und ohne tiptap, damit der Umbau in Node testbar bleibt und das
 * Modul im Haupt-Export von `@gruenerator/contracts` liegen darf.
 */

import { parseInlineMarks, serializeInlineMarks, type InlineRun } from './inlineMarks.js';
import { LIST_BULLET, isOrderedMarker, splitListItems } from './listLayout.js';

import type { RichTextDoc, RichTextMark, RichTextNode } from '../schemas/richtext.js';

function runsToInline(runs: InlineRun[]): RichTextNode[] {
  return runs.map((run) => {
    const marks: RichTextMark[] = [];
    if (run.bold) marks.push({ type: 'bold' });
    if (run.italic) marks.push({ type: 'italic' });
    if (run.underline) marks.push({ type: 'underline' });
    return marks.length > 0
      ? { type: 'text', text: run.text, marks }
      : { type: 'text', text: run.text };
  });
}

function paragraph(line: string): RichTextNode {
  const content = runsToInline(parseInlineMarks(line));
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function listItem(line: string): RichTextNode {
  return { type: 'listItem', content: [paragraph(line)] };
}

/** Flacher Feldtext → Dokument. */
export function markdownLiteToRichText(text: string): RichTextDoc {
  const content: RichTextNode[] = [];
  let list: RichTextNode | null = null;

  for (const item of splitListItems(text)) {
    if (item.marker === null) {
      list = null;
      content.push(paragraph(item.body));
      continue;
    }
    const ordered = isOrderedMarker(item.marker);
    const type = ordered ? 'orderedList' : 'bulletList';
    if (list === null || list.type !== type) {
      list = { type, content: [] };
      if (ordered) {
        const start = parseInt(item.marker, 10);
        if (Number.isFinite(start) && start !== 1) list.attrs = { start };
      }
      content.push(list);
    }
    list.content!.push(listItem(item.body));
  }

  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

function inlineToLines(nodes: RichTextNode[] | undefined): string[] {
  const lines: InlineRun[][] = [[]];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      lines.push([]);
      continue;
    }
    if (node.type === 'text') {
      const marks = new Set((node.marks ?? []).map((mark) => mark.type));
      lines[lines.length - 1]!.push({
        text: node.text ?? '',
        bold: marks.has('bold'),
        italic: marks.has('italic'),
        underline: marks.has('underline'),
      });
      continue;
    }
    // Ein verschachtelter Block (etwa eine Liste in einem Punkt) wird auf
    // seinen Text reduziert — das Feldmodell kennt nur eine Ebene.
    lines[lines.length - 1]!.push(
      ...blockToLines(node).map((line) => ({
        text: line,
        bold: false,
        italic: false,
        underline: false,
      }))
    );
  }
  return lines.map(serializeInlineMarks);
}

function blockToLines(node: RichTextNode): string[] {
  switch (node.type) {
    case 'bulletList':
    case 'orderedList': {
      const start =
        node.type === 'orderedList' && typeof node.attrs?.['start'] === 'number'
          ? node.attrs['start']
          : 1;
      return (node.content ?? []).map((item, i) => {
        const marker = node.type === 'orderedList' ? `${start + i}.` : LIST_BULLET;
        // Ein Punkt ist eine Zeile: seine Absätze werden mit Leerzeichen
        // verbunden, sonst läse die Folgezeile beim nächsten Parsen als Prosa.
        const body = (item.content ?? [])
          .flatMap(blockToLines)
          .filter((line) => line !== '')
          .join(' ');
        return `${marker} ${body}`;
      });
    }
    case 'listItem':
      return (node.content ?? []).flatMap(blockToLines);
    case 'text':
    case 'hardBreak':
      return inlineToLines([node]);
    default:
      return inlineToLines(node.content);
  }
}

/** Dokument → flacher Feldtext in kanonischer Form. */
export function richTextToMarkdownLite(doc: RichTextDoc): string {
  return (doc.content ?? []).flatMap(blockToLines).join('\n');
}
