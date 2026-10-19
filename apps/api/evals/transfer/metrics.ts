const NUMBER_RE = /\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;

function normalizeNumber(raw: string): string {
  const grouped = raw.replace(/[.\s]/g, '');
  return grouped.replace(/,0+$/, '');
}

export function extractNumbers(text: string): string[] {
  const found = text.match(NUMBER_RE) ?? [];
  return [...new Set(found.map(normalizeNumber))];
}

function digitCount(n: string): number {
  return n.replace(/\D/g, '').length;
}

export function numberRecall(original: string, final: string): number | null {
  const source = extractNumbers(original).filter((n) => digitCount(n) >= 2);
  if (source.length === 0) return null;
  const target = new Set(extractNumbers(final));
  const hit = source.filter((n) => target.has(n)).length;
  return hit / source.length;
}

export function lengthRatio(original: string, final: string): number {
  return original.length === 0 ? 0 : final.length / original.length;
}

export function hasClosingOffer(final: string): boolean {
  const lines = final
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return lines.slice(-2).some((l) => /\?\s*[_*]*$/.test(l));
}

export function hasVisualBlockFence(final: string): boolean {
  return /```(chart|bars|stats|callout|timeline|steps|compare|table)\b/.test(final);
}

export function hasCheckTrailInMessage(final: string): boolean {
  return /Prüfbericht|Rückübersetzung|Abdeckungstabelle/i.test(final);
}

/**
 * Zeilen der fertigen Fassung, die nach Seitenrauschen aussehen — Navigation,
 * Menüs, Rechtliches, Teilen-Leisten. Eingefügte Webseiten bringen sie mit;
 * die Persona soll sie weglassen. Die Liste ist eine Stichprobe, kein Beweis.
 */
const PAGE_CHROME =
  /^(weiter zum inhalt|zum inhalt springen|suche|menü|zeige untermenü|startseite|impressum|datenschutz(erklärung)?|cookie[- ]?einstellungen|newsletter abonnieren|teilen|schlagwörter|archiv|kontakt|nach oben)\s*$/i;

export function pageChromeLines(final: string): number {
  return final.split('\n').filter((l) => PAGE_CHROME.test(l.replace(/^[#*\-\s]+/, '').trim()))
    .length;
}

export interface ProtocolHeader {
  urteil: 'FREIGABE' | 'ÜBERARBEITUNG' | 'ABLEHNUNG' | 'UNGEPRÜFT';
  runden: number;
}

/**
 * Entfernt Tags, bis keine mehr übrig sind — ein einzelner Durchlauf macht aus
 * `<scr<b>ipt>` wieder ein Tag. Übrig gebliebene spitze Klammern fallen weg.
 */
export function stripTags(html: string): string {
  let out = html;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out.replace(/[<>]/g, '');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
};

/** In EINEM Durchgang — nacheinander ersetzt würde aus `&amp;lt;` erst `&lt;`, dann `<`. */
export function decodeEntities(text: string): string {
  return text.replace(/&([a-zA-Z]+);/g, (whole, name: string) => ENTITIES[name] ?? whole);
}

export function parseProtocolHeader(text: string): ProtocolHeader | null {
  const plain = decodeEntities(stripTags(text.replace(/<\/(p|h[1-6]|li|div)>|<br\s*\/?>/gi, '\n')));
  const urteil = /^\s*Urteil:\s*(FREIGABE|ÜBERARBEITUNG|ABLEHNUNG|UNGEPRÜFT)\b/m.exec(plain);
  const runden = /^\s*Runden:\s*(\d+)/m.exec(plain);
  if (!urteil || !runden) return null;
  return { urteil: urteil[1] as ProtocolHeader['urteil'], runden: Number(runden[1]) };
}

function sentences(final: string): string[] {
  const out: string[] = [];
  for (const line of final.split('\n')) {
    const body = line
      .trim()
      .replace(/^(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+|>\s*)/, '')
      .trim();
    if (
      body === '' ||
      /^#{1,6}\s/.test(line.trim()) ||
      /^_.*_$/.test(body) ||
      body.startsWith('```')
    ) {
      continue;
    }
    for (const part of body.split(/(?<=[.!?])\s+/)) {
      if (part.trim() !== '') out.push(part.trim());
    }
  }
  return out;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

export function avgSentenceWords(final: string): number | null {
  const s = sentences(final);
  if (s.length === 0) return null;
  return s.reduce((sum, x) => sum + wordCount(x), 0) / s.length;
}

export function longSentenceShare(final: string, maxWords = 12): number | null {
  const s = sentences(final);
  if (s.length === 0) return null;
  return s.filter((x) => wordCount(x) > maxWords).length / s.length;
}
