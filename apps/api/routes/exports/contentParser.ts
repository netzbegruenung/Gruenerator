/**
 * Content parsing for document exports.
 *
 * Markdown is walked as a `marked` TOKEN TREE, never as the HTML `marked`
 * renders. The old path did markdown → HTML → regex-scrape, which cost:
 * whitespace between adjacent runs (every segment was `.trim()`ed, so
 * `**A** wurde **B**` exported as `AwurdeB`), list structure (a whole `<ul>`
 * became one paragraph of `•`-prefixed text), ordered-list numbers, links,
 * code, tables, and the entities `marked` introduces (`mögen's` came back as
 * `mögen&#39;s`). Tokens have none of those problems because nothing is ever
 * serialised in between.
 *
 * HTML input still exists (editor content), so it gets its own path — a small
 * stack-based parser rather than overlapping regexes, which used to duplicate
 * text whenever two patterns matched the same span.
 *
 * DELIBERATELY NOT `services/pdf/contentToBlocks.ts`, which solves the same
 * block-splitting problem for PDF. Its blocks carry text as markdown STRINGS
 * and the PDF renderer re-lexes them with an inline pass that models bold only
 * — em, link and del all collapse to the inherited bold, because that font set
 * has no italic. DOCX needs italic, code, strike and href per segment, so the
 * shared part would be the block split alone, at the price of PDF's schema caps
 * (MAX_LIST_LEVEL 3, MAX_TEXT) and its escape/re-encode contract. Worth
 * revisiting if either side grows again.
 */

import { marked, type Token, type Tokens } from 'marked';

import type { FormattedSegment, FormattedBlock } from './types.js';

/** Inline styling inherited down the token tree. */
interface InlineStyle {
  bold: boolean;
  italic: boolean;
  code: boolean;
  strike: boolean;
  href: string | null;
}

const NO_STYLE: InlineStyle = {
  bold: false,
  italic: false,
  code: false,
  strike: false,
  href: null,
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  lsquo: '‘',
  rsquo: '’',
  euro: '€',
  szlig: 'ß',
};

/**
 * Decode the entities that reach us, in a SINGLE pass. Scanning continues after
 * each replacement, so `&amp;lt;` becomes the literal `&lt;` and not `<` —
 * decoding twice would turn escaped markup back into markup.
 */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    const token = body.toLowerCase();
    if (token.startsWith('#x')) return safeCodePoint(parseInt(body.slice(2), 16)) || match;
    if (token.startsWith('#')) return safeCodePoint(parseInt(body.slice(1), 10)) || match;
    return NAMED_ENTITIES[token] ?? match;
  });
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function pushSegment(into: FormattedSegment[], raw: string, style: InlineStyle): void {
  // Control characters are not representable in OOXML — a single stray one
  // makes Word refuse to open the file.
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (!text) return;

  const last = into[into.length - 1];
  const sameStyle =
    last &&
    last.bold === style.bold &&
    last.italic === style.italic &&
    (last.code ?? false) === style.code &&
    (last.strike ?? false) === style.strike &&
    (last.href ?? null) === style.href;

  if (sameStyle) {
    last.text += text;
    return;
  }

  into.push({
    text,
    bold: style.bold,
    italic: style.italic,
    ...(style.code ? { code: true } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(style.href ? { href: style.href } : {}),
  });
}

/**
 * Trim only the OUTER edges of a run of segments. Interior whitespace between
 * segments is meaningful — it is the space between a bold word and the next
 * one — and trimming each segment individually is exactly the bug this
 * replaces.
 */
function trimEdges(segments: FormattedSegment[]): FormattedSegment[] {
  const out = segments.filter((seg) => seg.text.length > 0);
  if (out.length === 0) return out;

  const first = out[0];
  first.text = first.text.replace(/^[ \t\n]+/, '');
  const last = out[out.length - 1];
  last.text = last.text.replace(/[ \t\n]+$/, '');

  return out.filter((seg) => seg.text.length > 0);
}

// ── Markdown path ───────────────────────────────────────────────────────────

function walkInline(
  tokens: Token[] | undefined,
  style: InlineStyle,
  into: FormattedSegment[]
): void {
  if (!tokens) return;

  for (const token of tokens) {
    if (token.type === 'strong') {
      walkInline(token.tokens, { ...style, bold: true }, into);
    } else if (token.type === 'em') {
      walkInline(token.tokens, { ...style, italic: true }, into);
    } else if (token.type === 'del') {
      walkInline(token.tokens, { ...style, strike: true }, into);
    } else if (token.type === 'codespan') {
      pushSegment(into, decodeEntities((token as Tokens.Codespan).text), { ...style, code: true });
    } else if (token.type === 'link') {
      const link = token as Tokens.Link;
      walkInline(link.tokens, { ...style, href: link.href || null }, into);
    } else if (token.type === 'image') {
      // No picture in the export — the alt text as a link keeps the reference.
      const image = token as Tokens.Image;
      pushSegment(into, decodeEntities(image.text || image.href), {
        ...style,
        href: image.href || null,
      });
    } else if (token.type === 'br') {
      pushSegment(into, '\n', style);
    } else if (token.type === 'html') {
      const text = stripHtmlTags((token as Tokens.HTML).text);
      pushSegment(into, decodeEntities(text), style);
    } else if (token.type === 'escape') {
      pushSegment(into, (token as Tokens.Escape).text, style);
    } else if (token.type === 'text') {
      const textToken = token as Tokens.Text;
      if (textToken.tokens && textToken.tokens.length > 0) {
        walkInline(textToken.tokens, style, into);
      } else {
        pushSegment(into, decodeEntities(textToken.text), style);
      }
    } else if ('tokens' in token && Array.isArray(token.tokens)) {
      walkInline(token.tokens, style, into);
    } else if ('text' in token && typeof token.text === 'string') {
      pushSegment(into, decodeEntities(token.text), style);
    }
  }
}

function inlineSegments(tokens: Token[] | undefined): FormattedSegment[] {
  const segments: FormattedSegment[] = [];
  walkInline(tokens, NO_STYLE, segments);
  return trimEdges(segments);
}

/**
 * A paragraph that is nothing but image tokens (plus whitespace and line
 * breaks) becomes real `image` blocks. Images mixed into running text keep the
 * alt-text-link fallback from `walkInline` — an inline picture has no own line
 * to sit on, a standalone one does.
 */
function standaloneImages(tokens: Token[]): FormattedBlock[] | null {
  const images: FormattedBlock[] = [];

  for (const token of tokens) {
    if (token.type === 'image') {
      const image = token as Tokens.Image;
      if (image.href) {
        images.push({ kind: 'image', src: image.href, alt: decodeEntities(image.text || '') });
      }
    } else if (token.type === 'br' || token.type === 'space') {
      continue;
    } else if (token.type === 'text') {
      const text = token as Tokens.Text;
      if ((text.tokens && text.tokens.length > 0) || text.text.trim()) return null;
    } else {
      return null;
    }
  }

  return images.length > 0 ? images : null;
}

interface WalkContext {
  quoteDepth: number;
  listLevel: number;
  nextListId: () => number;
}

function walkBlocks(tokens: Token[], ctx: WalkContext, into: FormattedBlock[]): void {
  for (const token of tokens) {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      const segments = inlineSegments(heading.tokens);
      if (segments.length > 0) {
        into.push({ kind: 'heading', level: Math.min(Math.max(heading.depth, 1), 6), segments });
      }
    } else if (token.type === 'paragraph' || token.type === 'text') {
      const inline = (token as Tokens.Paragraph).tokens ?? [token as unknown as Token];
      const images = standaloneImages(inline);
      if (images) {
        into.push(...images);
        continue;
      }
      const segments = inlineSegments(inline);
      if (segments.length > 0) {
        into.push({ kind: 'paragraph', segments, quoteDepth: ctx.quoteDepth });
      }
    } else if (token.type === 'list') {
      const list = token as Tokens.List;
      const listId = ctx.nextListId();
      for (const item of list.items) {
        walkListItem(item, list.ordered, listId, ctx, into);
      }
    } else if (token.type === 'blockquote') {
      walkBlocks(
        (token as Tokens.Blockquote).tokens,
        { ...ctx, quoteDepth: ctx.quoteDepth + 1 },
        into
      );
    } else if (token.type === 'code') {
      const code = token as Tokens.Code;
      into.push({ kind: 'code', text: code.text, lang: code.lang || null });
    } else if (token.type === 'table') {
      const table = token as Tokens.Table;
      into.push({
        kind: 'table',
        header: table.header.map((cell) => inlineSegments(cell.tokens)),
        rows: table.rows.map((row) => row.map((cell) => inlineSegments(cell.tokens))),
      });
    } else if (token.type === 'hr') {
      into.push({ kind: 'divider' });
    } else if (token.type === 'html') {
      // Block-level raw HTML inside markdown — keep the text, drop the markup.
      const text = decodeEntities(stripHtmlTags((token as Tokens.HTML).text)).trim();
      if (text) {
        into.push({
          kind: 'paragraph',
          segments: [{ text, bold: false, italic: false }],
          quoteDepth: ctx.quoteDepth,
        });
      }
    } else if (token.type !== 'space' && token.type !== 'def' && 'tokens' in token) {
      const nested = (token as { tokens?: Token[] }).tokens;
      if (nested && nested.length > 0) walkBlocks(nested, ctx, into);
    }
  }
}

function walkListItem(
  item: Tokens.ListItem,
  ordered: boolean,
  listId: number,
  ctx: WalkContext,
  into: FormattedBlock[]
): void {
  // The item's own text is everything up to its first nested block; nested
  // lists become their own items one level deeper.
  const leading: Token[] = [];
  const trailing: Token[] = [];

  for (const child of item.tokens) {
    if (child.type === 'list' || child.type === 'code' || child.type === 'blockquote') {
      trailing.push(child);
    } else if (trailing.length > 0) {
      trailing.push(child);
    } else {
      leading.push(child);
    }
  }

  const segments = inlineSegments(
    leading.flatMap((child) =>
      'tokens' in child && Array.isArray(child.tokens) && child.tokens.length > 0
        ? (child.tokens as Token[])
        : [child]
    )
  );

  if (item.task) {
    segments.unshift({ text: item.checked ? '☑ ' : '☐ ', bold: false, italic: false });
  }

  if (segments.length > 0) {
    into.push({
      kind: 'listItem',
      segments,
      ordered,
      level: ctx.listLevel,
      listId,
      quoteDepth: ctx.quoteDepth,
    });
  }

  if (trailing.length > 0) {
    walkBlocks(trailing, { ...ctx, listLevel: ctx.listLevel + 1 }, into);
  }
}

// ── HTML path ───────────────────────────────────────────────────────────────

type HtmlNode = { type: 'text'; text: string } | { type: 'el'; tag: string; children: HtmlNode[] };

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'col']);
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'hr',
]);

export function stripHtmlTags(input: string): string {
  let result = input;
  let prev = '';
  while (prev !== result) {
    prev = result;
    result = result.replace(/<[^>]*>/g, '');
  }
  return result;
}

interface ParsedTag {
  closing: boolean;
  name: string;
  selfClosing: boolean;
  /** Index just past the tag's `>`. */
  end: number;
}

/** Returned when a `<` opens a tag that never closes before end of input. */
const UNTERMINATED = Symbol('unterminated');

/**
 * Read one tag starting at `html[start] === '<'`.
 *
 * A hand-rolled scan rather than a regex, and deliberately so: the regex this
 * replaces let the tag-name class `[a-zA-Z0-9-]*` and the attribute class
 * `[^>"']` both match `-`, so `<a` followed by many dashes and no `>`
 * backtracked quadratically (CodeQL 1416). Export content is user-supplied, and
 * the API worker is single-threaded. This visits every character at most once.
 */
function readTagAt(html: string, start: number): ParsedTag | null | typeof UNTERMINATED {
  let i = start + 1;
  const closing = html[i] === '/';
  if (closing) i += 1;

  const nameStart = i;
  if (!/[a-zA-Z]/.test(html[i] ?? '')) return null;
  while (i < html.length && /[a-zA-Z0-9-]/.test(html[i])) i += 1;
  const name = html.slice(nameStart, i).toLowerCase();

  // Skip to the closing `>`, ignoring one inside a quoted attribute value.
  let quote: string | null = null;
  while (i < html.length) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return { closing, name, selfClosing: html[i - 1] === '/', end: i + 1 };
    }
    i += 1;
  }
  return UNTERMINATED;
}

/**
 * Minimal, forgiving HTML parser. A stack instead of overlapping regexes:
 * `<strong>` and a stray `*` can no longer both claim the same span and emit
 * the text twice.
 */
function parseHtmlNodes(html: string): HtmlNode[] {
  const root: HtmlNode = { type: 'el', tag: '#root', children: [] };
  const stack: Array<{ tag: string; node: HtmlNode & { type: 'el' } }> = [
    { tag: '#root', node: root },
  ];

  let cursor = 0;
  let index = 0;

  const appendText = (text: string): void => {
    if (!text) return;
    stack[stack.length - 1].node.children.push({ type: 'text', text: decodeEntities(text) });
  };

  while (index < html.length) {
    if (html[index] !== '<') {
      index += 1;
      continue;
    }

    const parsed = readTagAt(html, index);
    // A `<` that starts nothing (`a < b`) is literal text; a tag that never
    // closes means the rest of the input holds no tag either, so it is all
    // text — and stopping here is what keeps the scan linear.
    if (parsed === null) {
      index += 1;
      continue;
    }
    if (parsed === UNTERMINATED) break;

    appendText(html.slice(cursor, index));
    cursor = parsed.end;
    index = parsed.end;

    const closing = parsed.closing;
    const tag = parsed.name;
    const selfClosing = parsed.selfClosing || VOID_TAGS.has(tag);

    if (closing) {
      // Search from the TOP of the stack: `findIndex` returns the OUTERMOST
      // element with this name, so `</li>` closing a nested list's item popped
      // the outer `<li>` too — and every sibling item after the nested list
      // ended up outside the `<ul>`, rendered as a paragraph instead of a
      // list item.
      let depth = -1;
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          depth = i;
          break;
        }
      }
      if (depth > 0) stack.length = depth;
      continue;
    }

    const node: HtmlNode & { type: 'el' } = { type: 'el', tag, children: [] };
    stack[stack.length - 1].node.children.push(node);
    if (!selfClosing) stack.push({ tag, node });
  }

  appendText(html.slice(cursor));
  return root.children;
}

function collectHtmlInline(nodes: HtmlNode[], style: InlineStyle, into: FormattedSegment[]): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      pushSegment(into, node.text, style);
      continue;
    }

    if (node.tag === 'br') {
      pushSegment(into, '\n', style);
    } else if (node.tag === 'strong' || node.tag === 'b') {
      collectHtmlInline(node.children, { ...style, bold: true }, into);
    } else if (node.tag === 'em' || node.tag === 'i') {
      collectHtmlInline(node.children, { ...style, italic: true }, into);
    } else if (node.tag === 'del' || node.tag === 's' || node.tag === 'strike') {
      collectHtmlInline(node.children, { ...style, strike: true }, into);
    } else if (node.tag === 'code') {
      collectHtmlInline(node.children, { ...style, code: true }, into);
    } else if (node.tag === 'a') {
      collectHtmlInline(node.children, style, into);
    } else {
      collectHtmlInline(node.children, style, into);
    }
  }
}

function htmlInlineSegments(nodes: HtmlNode[]): FormattedSegment[] {
  const segments: FormattedSegment[] = [];
  collectHtmlInline(nodes, NO_STYLE, segments);
  return trimEdges(segments);
}

function hasBlockChild(nodes: HtmlNode[]): boolean {
  return nodes.some((node) => node.type === 'el' && BLOCK_TAGS.has(node.tag));
}

function htmlNodesToBlocks(nodes: HtmlNode[], ctx: WalkContext, into: FormattedBlock[]): void {
  let inlineBuffer: HtmlNode[] = [];

  const flush = (): void => {
    if (inlineBuffer.length === 0) return;
    const segments = htmlInlineSegments(inlineBuffer);
    inlineBuffer = [];
    if (segments.length > 0) {
      into.push({ kind: 'paragraph', segments, quoteDepth: ctx.quoteDepth });
    }
  };

  for (const node of nodes) {
    if (node.type === 'text' || !BLOCK_TAGS.has(node.tag)) {
      inlineBuffer.push(node);
      continue;
    }

    flush();
    const tag = node.tag;

    if (/^h[1-6]$/.test(tag)) {
      const segments = htmlInlineSegments(node.children);
      if (segments.length > 0) {
        into.push({ kind: 'heading', level: parseInt(tag[1], 10), segments });
      }
    } else if (tag === 'ul' || tag === 'ol') {
      const listId = ctx.nextListId();
      const ordered = tag === 'ol';
      for (const child of node.children) {
        if (child.type !== 'el' || child.tag !== 'li') continue;

        const nested = child.children.filter(
          (grandchild) =>
            grandchild.type === 'el' && (grandchild.tag === 'ul' || grandchild.tag === 'ol')
        );
        const own = child.children.filter((grandchild) => !nested.includes(grandchild));

        const segments = htmlInlineSegments(own);
        if (segments.length > 0) {
          into.push({
            kind: 'listItem',
            segments,
            ordered,
            level: ctx.listLevel,
            listId,
            quoteDepth: ctx.quoteDepth,
          });
        }
        if (nested.length > 0) {
          htmlNodesToBlocks(nested, { ...ctx, listLevel: ctx.listLevel + 1 }, into);
        }
      }
    } else if (tag === 'blockquote') {
      htmlNodesToBlocks(node.children, { ...ctx, quoteDepth: ctx.quoteDepth + 1 }, into);
    } else if (tag === 'pre') {
      const text = collectPlainText(node.children).replace(/\n+$/, '');
      if (text.trim()) into.push({ kind: 'code', text, lang: null });
    } else if (tag === 'hr') {
      into.push({ kind: 'divider' });
    } else if (tag === 'table') {
      const table = htmlTableToBlock(node);
      if (table) into.push(table);
    } else if (hasBlockChild(node.children)) {
      htmlNodesToBlocks(node.children, ctx, into);
    } else {
      const segments = htmlInlineSegments(node.children);
      if (segments.length > 0) {
        into.push({ kind: 'paragraph', segments, quoteDepth: ctx.quoteDepth });
      }
    }
  }

  flush();
}

function collectPlainText(nodes: HtmlNode[]): string {
  return nodes
    .map((node) => (node.type === 'text' ? node.text : collectPlainText(node.children)))
    .join('');
}

function htmlTableToBlock(node: HtmlNode & { type: 'el' }): FormattedBlock | null {
  const rows: HtmlNode[] = [];
  const collectRows = (children: HtmlNode[]): void => {
    for (const child of children) {
      if (child.type !== 'el') continue;
      if (child.tag === 'tr') rows.push(child);
      else collectRows(child.children);
    }
  };
  collectRows(node.children);
  if (rows.length === 0) return null;

  const cellsOf = (row: HtmlNode): FormattedSegment[][] =>
    row.type === 'el'
      ? row.children
          .filter(
            (cell): cell is HtmlNode & { type: 'el' } =>
              cell.type === 'el' && (cell.tag === 'td' || cell.tag === 'th')
          )
          .map((cell) => htmlInlineSegments(cell.children))
      : [];

  const firstRow = rows[0];
  const headerIsHeading =
    firstRow.type === 'el' &&
    firstRow.children.some((cell) => cell.type === 'el' && cell.tag === 'th');

  const header = headerIsHeading ? cellsOf(firstRow) : [];
  const body = (headerIsHeading ? rows.slice(1) : rows)
    .map(cellsOf)
    .filter((row) => row.length > 0);

  if (header.length === 0 && body.length === 0) return null;
  return { kind: 'table', header, rows: body };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Parse markdown or HTML into renderable blocks.
 */
export function parseFormattedContent(input: string | null | undefined): FormattedBlock[] {
  if (!input) return [];

  const content = String(input);
  if (!content.trim()) return [];

  const blocks: FormattedBlock[] = [];
  let listCounter = 0;
  const ctx: WalkContext = {
    quoteDepth: 0,
    listLevel: 0,
    nextListId: () => ++listCounter,
  };

  // Markdown is the default, not a guess. The old code gated this on a
  // "does it look like markdown?" heuristic that did not know ordered lists —
  // a numbered answer took the HTML path and lost every item. Prose without
  // markup lexes to plain paragraphs either way, so there is nothing to lose.
  if (!looksLikeHtmlDocument(content)) {
    try {
      walkBlocks(marked.lexer(content, { gfm: true, breaks: true }) as Token[], ctx, blocks);
      if (blocks.length > 0) return blocks;
    } catch {
      // Fall through to the HTML path rather than losing the export.
      blocks.length = 0;
    }
  }

  htmlNodesToBlocks(parseHtmlNodes(content), ctx, blocks);
  return blocks;
}

/**
 * HTML that carries its own block structure must not go through the markdown
 * lexer: `marked` passes it through as raw `html` tokens and every block would
 * collapse into one paragraph.
 */
function looksLikeHtmlDocument(content: string): boolean {
  return /<(p|div|h[1-6]|ul|ol|li|table|blockquote|section|article)\b[^>]*>/i.test(content);
}
