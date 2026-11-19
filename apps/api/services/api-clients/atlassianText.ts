/**
 * Pure helpers for Jira / Confluence: query escaping and Atlassian Document
 * Format (ADF) to plain text. No I/O, so the tests need no network.
 *
 * ADF: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
 * JQL quoted strings: https://support.atlassian.com/jira-software-cloud/docs/jql-fields/
 * CQL quoted strings: https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/
 */

/**
 * Escape a value for use INSIDE a double-quoted JQL or CQL string: backslash
 * and double quote are the only characters that can end or alter the string.
 * Control characters (newlines etc.) are folded to a space.
 */
export function escapeQueryString(value: string): string {
  return value
    .replace(/[\s\p{Cc}]+/gu, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * Characters the text index (`text ~ …`) treats as operators. They are not
 * needed for a plain "find me X" request and make the query fail with HTTP 400
 * when unbalanced, so a plain-text search replaces them with spaces.
 * Reserved characters: https://support.atlassian.com/jira-software-cloud/docs/search-for-issues-using-the-text-field/
 */
const TEXT_INDEX_RESERVED = /[+\-&|!(){}[\]^~*?:/]/g;

/** A plain phrase made safe for `text ~ "…"` / `title ~ "…"`. Empty if nothing is left. */
export function sanitizeSearchPhrase(value: string): string {
  return escapeQueryString(value.replace(TEXT_INDEX_RESERVED, ' ').replace(/\s+/g, ' ').trim());
}

/** Quote a key or name as a JQL/CQL string literal (`"ABC"`). */
export function quoteQueryValue(value: string): string {
  return `"${escapeQueryString(value)}"`;
}

/** JQL from a plain phrase, optionally restricted to one project, newest first. */
export function buildTextJql(text: string, projectKey?: string | null): string | null {
  const phrase = sanitizeSearchPhrase(text);
  if (!phrase) return null;
  const clauses = [`text ~ "${phrase}"`];
  if (projectKey?.trim()) clauses.unshift(`project = ${quoteQueryValue(projectKey.trim())}`);
  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}

/** CQL from a plain phrase, optionally restricted to one space key. Pages only. */
export function buildTextCql(text: string, spaceKey?: string | null): string | null {
  const phrase = sanitizeSearchPhrase(text);
  if (!phrase) return null;
  const clauses = ['type = page', `text ~ "${phrase}"`];
  if (spaceKey?.trim()) clauses.push(`space = ${quoteQueryValue(spaceKey.trim())}`);
  return clauses.join(' AND ');
}

// ── ADF → text ───────────────────────────────────────────────────────────────

interface AdfNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
}

const INLINE_TYPES = new Set([
  'text',
  'hardBreak',
  'mention',
  'emoji',
  'inlineCard',
  'status',
  'date',
]);

const asNode = (v: unknown): AdfNode | null =>
  typeof v === 'object' && v !== null ? (v as AdfNode) : null;

const attrString = (node: AdfNode, key: string): string => {
  const v = node.attrs?.[key];
  return typeof v === 'string' ? v : '';
};

function children(node: AdfNode): AdfNode[] {
  return (node.content ?? []).map(asNode).filter((n): n is AdfNode => n !== null);
}

function inline(node: AdfNode): string {
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'hardBreak':
      return '\n';
    case 'mention': {
      const name = attrString(node, 'text').replace(/^@/, '');
      return name ? `@${name}` : '@Person';
    }
    case 'emoji':
      return attrString(node, 'text') || attrString(node, 'shortName');
    case 'inlineCard':
      return attrString(node, 'url');
    case 'status':
      return attrString(node, 'text');
    case 'date': {
      const ts = Number(attrString(node, 'timestamp'));
      return Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString().slice(0, 10) : '';
    }
    default:
      return children(node).map(inline).join('');
  }
}

function blocks(nodes: AdfNode[], depth: number): string {
  return nodes
    .map((n) => block(n, depth))
    .filter((s) => s.trim() !== '')
    .join('\n');
}

function list(node: AdfNode, depth: number): string {
  const ordered = node.type === 'orderedList';
  const start = typeof node.attrs?.order === 'number' ? node.attrs.order : 1;
  return children(node)
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : '- ';
      const [first = '', ...rest] = blocks(children(item), depth + 1).split('\n');
      const pad = '  ';
      return [marker + first, ...rest.map((l) => pad + l)].join('\n');
    })
    .join('\n');
}

function table(node: AdfNode, depth: number): string {
  return children(node)
    .map((row) =>
      children(row)
        .map((cell) => blocks(children(cell), depth).replace(/\n+/g, ' ').trim())
        .join(' | ')
    )
    .join('\n');
}

function block(node: AdfNode, depth: number): string {
  switch (node.type) {
    case 'paragraph':
      return children(node).map(inline).join('');
    case 'heading': {
      const level = Number(node.attrs?.level);
      const hashes = '#'.repeat(Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1);
      return `${hashes} ${children(node).map(inline).join('')}`;
    }
    case 'bulletList':
    case 'orderedList':
      return list(node, depth);
    case 'codeBlock':
      return `\`\`\`\n${children(node).map(inline).join('')}\n\`\`\``;
    case 'blockquote':
      return blocks(children(node), depth)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'rule':
      return '---';
    case 'table':
      return table(node, depth);
    case 'media':
    case 'mediaSingle':
    case 'mediaGroup':
      return '[Anhang]';
    default: {
      const kids = children(node);
      if (INLINE_TYPES.has(node.type ?? '')) return inline(node);
      if (kids.length === 0) return '';
      return kids.every((k) => INLINE_TYPES.has(k.type ?? ''))
        ? kids.map(inline).join('')
        : blocks(kids, depth);
    }
  }
}

/**
 * Plain text from an ADF document. A string passes through (older fields can
 * be plain text); anything unparseable yields ''.
 */
export function adfToText(doc: unknown): string {
  if (typeof doc === 'string') return doc.trim();
  const root = asNode(doc);
  if (!root) return '';
  return block(root, 0)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
