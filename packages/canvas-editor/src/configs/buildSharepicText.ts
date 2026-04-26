interface AdditionalTextLike {
  text?: unknown;
  type?: unknown;
}

const FIELD_LABELS: Array<[key: string, label: string]> = [
  ['quote', 'Zitat'],
  ['name', 'Name'],
  ['header', 'Überschrift'],
  ['subheader', 'Unterzeile'],
  ['body', 'Text'],
  ['eventTitle', 'Veranstaltung'],
  ['weekday', 'Wochentag'],
  ['date', 'Datum'],
  ['time', 'Uhrzeit'],
  ['locationName', 'Ort'],
  ['address', 'Adresse'],
  ['line1', 'Zeile 1'],
  ['line2', 'Zeile 2'],
  ['line3', 'Zeile 3'],
  ['headline', 'Überschrift'],
  ['title', 'Titel'],
];

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds a structured German text description of the current canvas content.
 * Used by ChatSection to inject the sharepic content into the chat composer.
 */
export function buildSharepicText(state: Record<string, unknown>): string {
  const lines: string[] = [];

  const canvasType = asString(state.canvasType);
  if (canvasType) {
    lines.push(`Sharepic-Typ: ${canvasType}`);
  }

  for (const [key, label] of FIELD_LABELS) {
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

  if (lines.length === 0) {
    return '(Sharepic ist noch leer)';
  }

  return lines.join('\n');
}
