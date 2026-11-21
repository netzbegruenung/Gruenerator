/**
 * Ein Änderungsantrag als „Bisher" und „Neu" je Zeilenblock.
 *
 * Antragsgrün markiert Änderungen nur farbig (`<ins>`, `<del>`, `.inserted`,
 * `.deleted`). Ein ersetzter Absatz kommt als „neuer Absatz, alter Absatz
 * gestrichen, zweiter neuer Absatz" — derselbe Satz steht dann einmal als
 * eingefügt und einmal als gestrichen (LDK Troisdorf 2026, L-02-002). Als
 * verschachtelte Marken gelesen, sah ein unveränderter Satz wie eine neue
 * Forderung aus. Beide Fassungen ausgeschrieben, ist die Änderung eindeutig.
 */
import * as cheerio from 'cheerio';

import { htmlToStructuredText } from '../../utils/htmlCleaner.js';

import type { AnyNode, Element } from 'domhandler';

const INSERTED = 'ins, .inserted';
const DELETED = 'del, .deleted';
const HAS_DIFF = /<(?:ins|del)\b|class="[^"]*\b(?:inserted|deleted)\b/;

interface Block {
  label: string | null;
  html: string;
}

/** Die Inhaltsknoten in Lesereihenfolge; namenlose Hüll-`div`s werden geöffnet. */
function contentNodes($: cheerio.CheerioAPI, nodes: AnyNode[]): AnyNode[] {
  const out: AnyNode[] = [];
  for (const node of nodes) {
    const el = node as Element;
    if (
      node.type === 'tag' &&
      el.name === 'div' &&
      !$(el).hasClass('inserted') &&
      !$(el).hasClass('deleted')
    ) {
      out.push(...contentNodes($, el.children));
    } else {
      out.push(node);
    }
  }
  return out;
}

function blocksOf(html: string): Block[] {
  const $ = cheerio.load(html, null, false);
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const node of contentNodes($, $.root().contents().get())) {
    if (node.type === 'tag' && $(node).is('h4.lineSummary')) {
      current = { label: $(node).text().trim().replace(/:\s*$/, ''), html: '' };
      blocks.push(current);
      continue;
    }
    if (!current) {
      current = { label: null, html: '' };
      blocks.push(current);
    }
    current.html += $.html(node);
  }
  return blocks;
}

function textWithout(html: string, drop: string): string {
  const $ = cheerio.load(html, null, false);
  $(drop).remove();
  // Ein geändertes Leerzeichen zeigt Antragsgrün als „[Leerzeichen]" (`.space`);
  // in der Fassung, in der es steht, ist es ein Leerzeichen.
  $('.space').replaceWith(' ');
  return htmlToStructuredText($.html()).trim();
}

/** Strukturierter Text eines Abschnitts mit Änderungen; ohne Änderungen der Text selbst. */
export function beforeAfterText(html: string): string {
  if (!HAS_DIFF.test(html)) return htmlToStructuredText(html).trim();
  return blocksOf(html)
    .map((block) => {
      const head = block.label ? `#### ${block.label}\n\n` : '';
      if (!HAS_DIFF.test(block.html)) {
        const text = htmlToStructuredText(block.html).trim();
        return text ? `${head}${text}` : '';
      }
      const bisher = textWithout(block.html, INSERTED);
      const neu = textWithout(block.html, DELETED);
      return [
        head,
        `Bisher: ${bisher || '(nichts — reine Einfügung)'}`,
        '\n\n',
        `Neu: ${neu || '(ersatzlos gestrichen)'}`,
      ].join('');
    })
    .filter(Boolean)
    .join('\n\n');
}
