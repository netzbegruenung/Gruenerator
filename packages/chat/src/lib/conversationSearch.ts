/**
 * Find-in-conversation over the RENDERED chat, not over the message store.
 *
 * An offset computed on store text cannot be mapped back into an assistant
 * answer: CitationMarkdownText's `preprocess` inserts characters (`[1]` becomes
 * `\[1\]`), react-markdown deletes syntax (`**Klima**politik` paints as the one
 * word "Klimapolitik"), rehype-katex replaces math with a subtree bearing no
 * relation to its source, and the `smooth` reveal keeps the DOM behind the
 * store anyway. Walking what is painted sidesteps all four — and, as a bonus,
 * never sees the raw mention tokens that user messages still carry in the
 * store.
 *
 * The message list is not virtualized, so every message is in the DOM and this
 * walk is complete.
 */

export const CONVERSATION_SEARCH_MIN_QUERY_LENGTH = 2;

/** Characters around a match in the preview line. */
const CONTEXT_CHARS = 48;

/**
 * Accent folding that is 1:1 BY CONSTRUCTION — offsets index straight back into
 * the raw text, so a mapping that changes length is not usable here at all.
 * That rules out @gruenerator/query's foldUmlauts (ä→ae, ß→ss).
 *
 * `ß` is deliberately absent: ß→ss does not preserve length, and ß→s would only
 * ever match the typo "strase". Losing straße↔strasse is the honest price of
 * correct offsets; a browser's own find bar makes the same trade.
 */
const FOLD: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  å: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ñ: 'n',
  ç: 'c',
};

export function foldForSearch(text: string): string {
  // `replace`, not [...text].map: spreading splits by code point and collapses
  // a surrogate pair into one element, shifting every offset past an emoji.
  return text.toLowerCase().replace(/[äöüáàâãåéèêëíìîïóòôõúùûñç]/g, (c) => FOLD[c] ?? c);
}

/**
 * Comparison form for offset-bearing text. Falls back rather than return
 * something a length longer: `İ`.toLowerCase() is two code units.
 */
function searchable(raw: string): string {
  const folded = foldForSearch(raw);
  if (folded.length === raw.length) return folded;
  const lowered = raw.toLowerCase();
  return lowered.length === raw.length ? lowered : raw;
}

export interface Match {
  start: number;
  end: number;
}

/**
 * Literal, non-overlapping, case- and accent-insensitive. Never a RegExp, so
 * `C++`, `1.5` and `?` are searched as typed.
 */
export function findMatches(haystack: string, needle: string): Match[] {
  const query = needle.trim();
  if (query.length < CONVERSATION_SEARCH_MIN_QUERY_LENGTH) return [];

  const hay = searchable(haystack);
  const pin = searchable(query);
  const out: Match[] = [];

  let at = hay.indexOf(pin);
  while (at !== -1) {
    out.push({ start: at, end: at + pin.length });
    at = hay.indexOf(pin, at + pin.length);
  }
  return out;
}

export interface TextSpan {
  node: Text;
  start: number;
  end: number;
}

/** Elements whose boundary separates words that are not adjacent on screen. */
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TD',
  'TH',
  'TR',
  'PRE',
  'BLOCKQUOTE',
  'SECTION',
  'ARTICLE',
  'UL',
  'OL',
  'BR',
]);

function blockAncestor(node: Node, root: Element): Node {
  let current: Node | null = node.parentNode;
  while (current && current !== root) {
    if (current.nodeType === 1 && BLOCK_TAGS.has((current as Element).tagName)) return current;
    current = current.parentNode;
  }
  return root;
}

function isHiddenFromReader(node: Node, root: Element): boolean {
  let current: Node | null = node.parentNode;
  while (current && current !== root.parentNode) {
    if (current.nodeType === 1) {
      const el = current as Element;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT')
        return true;
      if (el.getAttribute('aria-hidden') === 'true') return true;
      if (el.classList.contains('sr-only')) return true;
    }
    current = current.parentNode;
  }
  return false;
}

/**
 * One string per message plus the map back into its text nodes. Concatenating
 * across element boundaries is what makes `**Klima**politik` findable as
 * "Klimapolitik"; the newline between block ancestors is what stops the end of
 * one paragraph fusing with the start of the next into a word nobody can see.
 */
export function collectSpans(root: Element): { text: string; spans: TextSpan[] } {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const spans: TextSpan[] = [];
  let text = '';
  let previousBlock: Node | null = null;

  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (textNode.data.length > 0 && !isHiddenFromReader(textNode, root)) {
      const block = blockAncestor(textNode, root);
      if (previousBlock !== null && block !== previousBlock) text += '\n';
      previousBlock = block;

      const start = text.length;
      text += textNode.data;
      spans.push({ node: textNode, start, end: text.length });
    }
    node = walker.nextNode();
  }

  return { text, spans };
}

export function rangeForMatch(spans: TextSpan[], match: Match): Range | null {
  const from = spans.find((span) => match.start >= span.start && match.start < span.end);
  const to = spans.find((span) => match.end > span.start && match.end <= span.end);
  if (!from || !to) return null;

  const range = from.node.ownerDocument.createRange();
  range.setStart(from.node, match.start - from.start);
  range.setEnd(to.node, match.end - to.start);
  return range;
}

function trimToWord(text: string, fromStart: boolean): string {
  if (text.length < CONTEXT_CHARS) return text;
  const cut = fromStart ? text.indexOf(' ') : text.lastIndexOf(' ');
  if (cut === -1) return text;
  return fromStart ? `…${text.slice(cut + 1)}` : `${text.slice(0, cut)}…`;
}

export interface ConversationHit {
  id: string;
  messageId: string;
  before: string;
  match: string;
  after: string;
  /** 0-100, where the hit sits in the viewport's scroll box. */
  position: number;
  /** Absolute offset within the scroll box; the scroll target. */
  top: number;
  range: Range;
}

export interface CollectHitsOptions {
  /** Injected so jsdom, which reports 0x0 for everything, can be tested. */
  rectOf: (range: Range) => DOMRect;
}

export function collectHits(
  viewport: Element,
  query: string,
  { rectOf }: CollectHitsOptions
): ConversationHit[] {
  if (query.trim().length < CONVERSATION_SEARCH_MIN_QUERY_LENGTH) return [];

  const viewportTop = viewport.getBoundingClientRect().top;
  const scrollTop = viewport.scrollTop;
  const hits: ConversationHit[] = [];

  for (const message of viewport.querySelectorAll('[data-message-id]')) {
    const messageId = message.getAttribute('data-message-id');
    if (!messageId) continue;

    const { text, spans } = collectSpans(message);
    let ordinal = 0;

    for (const match of findMatches(text, query)) {
      const range = rangeForMatch(spans, match);
      if (!range) continue;

      // Read every rect in one pass with no interleaved writes: one forced
      // reflow for the whole recompute instead of one per hit.
      const rect = rectOf(range);
      if (rect.width === 0 && rect.height === 0) continue;

      hits.push({
        id: `${messageId}#${ordinal++}`,
        messageId,
        before: trimToWord(text.slice(Math.max(0, match.start - CONTEXT_CHARS), match.start), true),
        match: text.slice(match.start, match.end),
        after: trimToWord(text.slice(match.end, match.end + CONTEXT_CHARS), false),
        position: 0,
        top: rect.top - viewportTop + scrollTop,
        range,
      });
    }
  }

  // A 4000-word answer and a three-word "Passt." must not land on the same spot
  // of a rail whose whole meaning is "where in the scroll".
  const scrollHeight = viewport.scrollHeight;
  hits.forEach((hit, index) => {
    hit.position =
      scrollHeight > 0
        ? Math.min(100, Math.max(0, (hit.top / scrollHeight) * 100))
        : ((index + 1) / hits.length) * 100;
  });

  return hits;
}
