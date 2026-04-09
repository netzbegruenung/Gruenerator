import { randomUUID } from 'crypto';

import * as Y from 'yjs';

import { createLogger } from './logger.js';

/** Strip HTML tags and decode common entities. Inlined to avoid @gruenerator/shared runtime dep in Docker. */
function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return '';
  let result = html.replace(/<br\s*\/?>/gi, '\n');
  let prev: string;
  do {
    prev = result;
    result = result.replace(/<[^>]+>/g, '');
  } while (result !== prev);
  result = result
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;/gi, '\u201C')
    .replace(/&rdquo;/gi, '\u201D')
    .replace(/&amp;/gi, '&');
  do {
    prev = result;
    result = result.replace(/<[^>]+>/g, '');
  } while (result !== prev);
  return result.replace(/\s+/g, ' ').trim();
}

const log = createLogger('HtmlToYjs');

/**
 * Injects simple HTML into a Yjs XmlFragment using BlockNote's XML structure.
 *
 * BlockNote format: blockGroup > blockContainer[id] > (heading|paragraph|bulletListItem|numberedListItem)
 *
 * Supports: h1-h3, p, ul/li (with checkbox detection → checkListItem), ol/li, blockquote, hr.
 * Inline marks (strong, em) are converted to plain text (Yjs XmlText doesn't support marks in this context).
 * Tables are converted to plain paragraphs.
 */
export function injectHtmlIntoFragment(fragment: Y.XmlFragment, html: string): void {
  const group = new Y.XmlElement('blockGroup');

  // Normalize whitespace between tags
  const normalized = html.replace(/>\s+</g, '><').trim();

  // Extract block-level elements
  const blockPattern =
    /<(h[1-3]|p|blockquote|hr|table)(?:\s[^>]*)?>[\s\S]*?<\/\1>|<(h[1-3]|p|hr)(?:\s[^>]*)?\s*\/?>|<ul>([\s\S]*?)<\/ul>|<ol>([\s\S]*?)<\/ol>/gi;

  let match;
  while ((match = blockPattern.exec(normalized)) !== null) {
    const fullMatch = match[0];

    // Unordered list (with checkbox detection)
    if (match[3] !== undefined) {
      const items = extractListItems(match[3]);
      for (const item of items) {
        if (item.isCheckbox) {
          addBlock(group, 'checkListItem', item.text, { checked: item.checked ? 'true' : 'false' });
        } else {
          addBlock(group, 'bulletListItem', item.text, {});
        }
      }
      continue;
    }

    // Ordered list
    if (match[4] !== undefined) {
      const items = extractListItems(match[4]);
      for (const item of items) {
        addBlock(group, 'numberedListItem', item.text, {});
      }
      continue;
    }

    const tag = (match[1] || match[2] || '').toLowerCase();

    if (tag === 'hr') {
      addBlock(group, 'paragraph', '───', {});
      continue;
    }

    if (tag.startsWith('h')) {
      const level = tag[1];
      const text = stripHtmlTags(extractInnerContent(fullMatch));
      addBlock(group, 'heading', text, { level });
      continue;
    }

    if (tag === 'blockquote') {
      const inner = extractInnerContent(fullMatch);
      const text = stripHtmlTags(inner);
      addBlock(group, 'paragraph', text, { backgroundColor: 'gray' });
      continue;
    }

    if (tag === 'table') {
      // Convert table rows to simple paragraphs
      const rows = fullMatch.match(/<tr>([\s\S]*?)<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<t[dh]>([\s\S]*?)<\/t[dh]>/gi) || [])
          .map((c) => stripHtmlTags(extractInnerContent(c)))
          .filter(Boolean);
        if (cells.length > 0) {
          addBlock(group, 'paragraph', cells.join(' | '), {});
        }
      }
      continue;
    }

    if (tag === 'p') {
      const text = stripHtmlTags(extractInnerContent(fullMatch));
      if (text) {
        addBlock(group, 'paragraph', text, {});
      }
      continue;
    }
  }

  if (group.length > 0) {
    fragment.insert(0, [group]);
    log.debug(`[HtmlToYjs] Injected ${group.length} blocks`);
  }
}

function addBlock(
  group: Y.XmlElement,
  type: string,
  text: string,
  attrs: Record<string, string>
): void {
  const container = new Y.XmlElement('blockContainer');
  container.setAttribute('id', randomUUID());
  container.setAttribute('backgroundColor', 'default');
  container.setAttribute('textAlignment', 'left');
  container.setAttribute('textColor', 'default');

  const block = new Y.XmlElement(type);
  for (const [key, value] of Object.entries(attrs)) {
    block.setAttribute(key, value);
  }
  block.setAttribute('backgroundColor', 'default');
  block.setAttribute('textAlignment', 'left');
  block.setAttribute('textColor', 'default');

  block.insert(0, [new Y.XmlText(text)]);
  container.insert(0, [block]);
  group.push([container]);
}

function extractInnerContent(html: string): string {
  const match = html.match(/^<[^>]+>([\s\S]*)<\/[^>]+>$/);
  return match ? match[1] : html;
}

interface ListItem {
  text: string;
  isCheckbox: boolean;
  checked: boolean;
}

function extractListItems(listContent: string): ListItem[] {
  const items: ListItem[] = [];
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liPattern.exec(listContent)) !== null) {
    const raw = m[1];
    const hasCheckbox = /<input\s[^>]*type\s*=\s*["']?checkbox["']?[^>]*>/i.test(raw);
    const isChecked = hasCheckbox && /\bchecked\b/i.test(raw);
    const text = stripHtmlTags(raw);
    if (text) items.push({ text, isCheckbox: hasCheckbox, checked: isChecked });
  }
  return items;
}
