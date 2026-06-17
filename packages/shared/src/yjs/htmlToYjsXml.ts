import { randomUUID } from 'crypto';

import * as Y from 'yjs';

import { stripHtmlTags } from '../utils/stripHtmlTags.js';

/**
 * Injects simple HTML into a Yjs XmlFragment using BlockNote's XML structure.
 *
 * BlockNote format: blockGroup > blockContainer[id] > (heading|paragraph|bulletListItem|numberedListItem)
 *
 * Supports: h1-h3, p, ul/li (with checkbox detection → checkListItem), ol/li, blockquote, hr.
 * Inline marks are PRESERVED — bold (strong/b), italic (em/i), code, underline (u),
 * strike (s/del) and links (a[href]) are written as BlockNote/prosemirror marks on
 * the block's Y.XmlText (see y-prosemirror `yattr2markname`: plain mark-name keys
 * read back as marks, so the editor's runtime hash suffix isn't needed for a seed).
 * Tables are flattened to plain paragraphs; unknown inline tags are unwrapped.
 */
export function injectHtmlIntoFragment(fragment: Y.XmlFragment, html: string): void {
  const group = new Y.XmlElement('blockGroup');
  // Insert the group up front so each block's Y.XmlText is integrated into the
  // document before we apply inline formatting — Yjs rejects format inserts on a
  // detached text ("Add Yjs type to a document before reading data"). The group is
  // removed again at the end if nothing parsed, so an empty doc is never seeded.
  const groupIndex = fragment.length;
  fragment.insert(groupIndex, [group]);

  const normalized = html.replace(/>\s+</g, '><').trim();

  const blockPattern =
    /<(h[1-3]|p|blockquote|hr|table)(?:\s[^>]*)?>[\s\S]*?<\/\1>|<(h[1-3]|p|hr)(?:\s[^>]*)?\s*\/?>|<ul>([\s\S]*?)<\/ul>|<ol>([\s\S]*?)<\/ol>/gi;

  let match;
  while ((match = blockPattern.exec(normalized)) !== null) {
    const fullMatch = match[0];

    if (match[3] !== undefined) {
      const items = extractListItems(match[3]);
      for (const item of items) {
        if (item.isCheckbox) {
          addBlock(group, 'checkListItem', item.html, {
            checked: item.checked ? 'true' : 'false',
          });
        } else {
          addBlock(group, 'bulletListItem', item.html, {});
        }
      }
      continue;
    }

    if (match[4] !== undefined) {
      const items = extractListItems(match[4]);
      for (const item of items) {
        addBlock(group, 'numberedListItem', item.html, {});
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
      const inner = extractInnerContent(fullMatch);
      if (stripHtmlTags(inner).trim()) addBlock(group, 'heading', inner, { level });
      continue;
    }

    if (tag === 'blockquote') {
      const inner = extractInnerContent(fullMatch);
      if (stripHtmlTags(inner).trim())
        addBlock(group, 'paragraph', inner, { backgroundColor: 'gray' });
      continue;
    }

    if (tag === 'table') {
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
      const inner = extractInnerContent(fullMatch);
      if (stripHtmlTags(inner).trim()) {
        addBlock(group, 'paragraph', inner, {});
      }
      continue;
    }
  }

  if (group.length === 0) {
    fragment.delete(groupIndex, 1);
  }
}

function addBlock(
  group: Y.XmlElement,
  type: string,
  inlineHtml: string,
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

  const xmlText = new Y.XmlText();
  block.insert(0, [xmlText]);
  container.insert(0, [block]);
  // group is already integrated into the fragment/doc, so pushing the container
  // integrates xmlText — the formatted applyDelta below is then legal.
  group.push([container]);

  const delta = inlineHtmlToDelta(inlineHtml);
  if (delta.length > 0) xmlText.applyDelta(delta);
}

// Inline HTML tag → BlockNote/prosemirror mark name. Bold/italic/code/underline/
// strike carry no attributes; links carry { href }.
const INLINE_MARK_TAGS: Record<string, string> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  code: 'code',
  u: 'underline',
  s: 'strike',
  strike: 'strike',
  del: 'strike',
};

interface DeltaOp {
  insert: string;
  attributes?: Record<string, unknown>;
}

/**
 * Parse the inner HTML of a block into a Yjs delta, preserving inline marks and
 * links. Unknown tags (span, etc.) are unwrapped (text kept, no mark); <br>
 * becomes a space; <input> (checkbox markers) is dropped.
 */
function inlineHtmlToDelta(html: string): DeltaOp[] {
  const ops: DeltaOp[] = [];
  const stack: Array<{ tag: string; mark: string; attrs: Record<string, unknown> }> = [];
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*?)?)\/?>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  const currentAttributes = (): Record<string, unknown> | undefined => {
    if (stack.length === 0) return undefined;
    const attrs: Record<string, unknown> = {};
    for (const entry of stack) attrs[entry.mark] = entry.attrs;
    return attrs;
  };

  const emit = (raw: string): void => {
    if (!raw) return;
    const text = decodeEntities(raw);
    if (!text) return;
    const attributes = currentAttributes();
    ops.push(attributes ? { insert: text, attributes } : { insert: text });
  };

  while ((m = tagPattern.exec(html)) !== null) {
    emit(html.slice(cursor, m.index));
    cursor = tagPattern.lastIndex;

    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const rawAttrs = m[3] ?? '';

    if (tag === 'br') {
      ops.push({ insert: ' ' });
      continue;
    }
    if (tag === 'input') continue; // checkbox marker — handled at the block level

    if (closing) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].tag === tag) {
          stack.splice(k, 1);
          break;
        }
      }
      continue;
    }

    if (tag === 'a') {
      const href = rawAttrs.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
      stack.push({ tag, mark: 'link', attrs: href ? { href } : {} });
      continue;
    }

    const mark = INLINE_MARK_TAGS[tag];
    if (mark) {
      stack.push({ tag, mark, attrs: {} });
    }
    // Unknown inline tag → unwrap: keep its text, add no mark.
  }

  emit(html.slice(cursor));
  return ops;
}

// Decode the entities `marked`/HTML emit (order matters: &amp; last so an encoded
// "&amp;lt;" doesn't double-decode into "<").
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function extractInnerContent(html: string): string {
  const match = html.match(/^<[^>]+>([\s\S]*)<\/[^>]+>$/);
  return match ? match[1] : html;
}

interface ListItem {
  html: string;
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
    if (stripHtmlTags(raw).trim()) {
      items.push({ html: raw, isCheckbox: hasCheckbox, checked: isChecked });
    }
  }
  return items;
}
