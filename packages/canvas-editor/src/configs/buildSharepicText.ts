interface AdditionalTextLike {
  text?: unknown;
  type?: unknown;
}

const LABELS: Record<(typeof FIELD_KEYS)[number], string> = {
  quote: 'Zitat',
  name: 'Name',
  header: 'Überschrift',
  subheader: 'Unterzeile',
  body: 'Text',
  eventTitle: 'Veranstaltung',
  weekday: 'Wochentag',
  date: 'Datum',
  time: 'Uhrzeit',
  locationName: 'Ort',
  address: 'Adresse',
  line1: 'Zeile 1',
  line2: 'Zeile 2',
  line3: 'Zeile 3',
  headline: 'Überschrift',
  title: 'Titel',
};

const FIELD_KEYS = [
  'quote',
  'name',
  'header',
  'subheader',
  'body',
  'eventTitle',
  'weekday',
  'date',
  'time',
  'locationName',
  'address',
  'line1',
  'line2',
  'line3',
  'headline',
  'title',
] as const;

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The page's texts as "Label: value" lines; none on a page without text. */
function contentLines(state: Record<string, unknown>): string[] {
  const lines: string[] = [];

  for (const key of FIELD_KEYS) {
    const label = LABELS[key];
    const value = asString(state[key]);
    if (value) {
      lines.push(`${label}: ${value}`);
    }
  }

  const additional = state.additionalTexts;
  if (Array.isArray(additional) && additional.length > 0) {
    const additionalStrings = (additional as AdditionalTextLike[])
      .map((entry) => asString(entry.text))
      .filter((value): value is string => value !== null);
    if (additionalStrings.length > 0) {
      lines.push(`Weitere Texte: ${additionalStrings.join(' / ')}`);
    }
  }

  return lines;
}

/**
 * Builds a structured text description of the current canvas content.
 * Used by ChatSection to inject the sharepic content into the chat composer.
 */
export function buildSharepicText(state: Record<string, unknown>): string {
  const canvasType = asString(state.canvasType);
  const lines = [...(canvasType ? [`Sharepic-Typ: ${canvasType}`] : []), ...contentLines(state)];

  if (lines.length === 0) {
    return '(Sharepic ist noch leer)';
  }

  return lines.join('\n');
}

/** One page's own text, `''` on a page without any — what a restyle carries over. */
export function buildPageText(state: Record<string, unknown>): string {
  return contentLines(state).join('\n');
}

/**
 * The design's text page by page, for a model writing one more page; pages
 * without text are left out, and at most `max` characters go along — the
 * latest pages last, so a long design keeps its beginning.
 */
export function buildDeckText(
  pages: readonly { state: Record<string, unknown> }[],
  max: number
): string {
  const text = pages
    .map((page, i) => {
      const own = buildPageText(page.state);
      return own ? `Seite ${i + 1}:\n${own}` : null;
    })
    .filter((entry): entry is string => entry !== null)
    .join('\n\n');
  return text.slice(0, max);
}
