import { randomUUID } from 'crypto';

import { stripHtmlTags } from '@gruenerator/shared/utils';
import * as Y from 'yjs';

import { createLogger } from './logger.js';

const log = createLogger('HtmlToYjs');

/**
 * Injects simple HTML into a Yjs XmlFragment using BlockNote's XML structure.
 *
 * BlockNote format: blockGroup > blockContainer[id] > (heading|paragraph|bulletListItem|numberedListItem)
 *
 * Supports: h1-h3, p, ul/li, ol/li, blockquote, hr.
 * Inline marks (strong, em) are converted to plain text (Yjs XmlText doesn't support marks in this context).
 * Tables and checkboxes are converted to plain paragraphs.
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

    // Unordered list
    if (match[3] !== undefined) {
      const items = extractListItems(match[3]);
      for (const item of items) {
        addBlock(group, 'bulletListItem', item, {});
      }
      continue;
    }

    // Ordered list
    if (match[4] !== undefined) {
      const items = extractListItems(match[4]);
      for (const item of items) {
        addBlock(group, 'numberedListItem', item, {});
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

function extractListItems(listContent: string): string[] {
  const items: string[] = [];
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liPattern.exec(listContent)) !== null) {
    const text = stripHtmlTags(m[1]);
    if (text) items.push(text);
  }
  return items;
}
