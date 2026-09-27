/**
 * A chat question started on a notebook's start page opens in its own browser
 * tab, so the start page keeps the query and its hits. The new tab knows
 * nothing the old one held in memory — the source and category filters are not
 * persisted — so the URL carries the question and the filters it was asked
 * under. The params are removed once the question is sent.
 */
const QUESTION = 'frage';
const FILTERS = 'filter';
const SOURCES = 'quellen';

export const CHAT_HANDOFF_PARAMS = [QUESTION, FILTERS, SOURCES] as const;

export interface ChatHandoff {
  question: string;
  /** Category filters of a single system notebook. */
  filters: Record<string, string[]>;
  /** Selected collections on a multi-source page; null = all. */
  sourceIds: string[] | null;
}

export function buildChatHandoffUrl(pathname: string, handoff: ChatHandoff): string {
  const params = new URLSearchParams({ [QUESTION]: handoff.question });
  const filters = Object.fromEntries(
    Object.entries(handoff.filters).filter(([, values]) => values.length > 0)
  );
  if (Object.keys(filters).length > 0) params.set(FILTERS, JSON.stringify(filters));
  if (handoff.sourceIds) params.set(SOURCES, handoff.sourceIds.join(','));
  return `${pathname}?${params.toString()}`;
}

/** Reads what `buildChatHandoffUrl` wrote. The URL is user-editable, so a
 *  malformed filter param is dropped rather than trusted. */
export function readChatHandoff(params: URLSearchParams): ChatHandoff | null {
  const question = params.get(QUESTION)?.trim();
  if (!question) return null;
  return {
    question,
    filters: parseFilters(params.get(FILTERS)),
    sourceIds: params.has(SOURCES) ? (params.get(SOURCES) ?? '').split(',').filter(Boolean) : null,
  };
}

function parseFilters(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const filters: Record<string, string[]> = {};
    for (const [field, values] of Object.entries(parsed)) {
      if (Array.isArray(values) && values.every((v) => typeof v === 'string')) {
        filters[field] = values as string[];
      }
    }
    return filters;
  } catch {
    return {};
  }
}

/**
 * A held Enter re-submits on every key repeat (assistant-ui does not check
 * `event.repeat`) and a double click submits twice — each would open another
 * tab. The same question within the window counts once; the window slides
 * with every attempt, so a held key stays swallowed. The composer keeps its
 * text on purpose (the start page keeps its hits), so clearing it is no fix.
 */
export function createRepeatGuard(windowMs = 1000) {
  let last: { question: string; at: number } | null = null;
  return (question: string, now = Date.now()): boolean => {
    const repeat = last !== null && last.question === question && now - last.at < windowMs;
    last = { question, at: now };
    return repeat;
  };
}

/** The current query string without the handoff params — `?thread=` stays. */
export function withoutChatHandoff(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of CHAT_HANDOFF_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}
