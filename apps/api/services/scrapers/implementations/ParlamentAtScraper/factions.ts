/**
 * Parlamentsklubs auf eine Kurzform bringen. Die Quellen schreiben sie auf vier
 * Arten: als Code in den Geschichtsseiten (`frak_code: "G"`), als Kurzname in
 * Listen und Protokollen („Grüne", „FPÖ"), als Langname des Klubs auf der
 * Personenseite („Der Grüne Klub im Parlament …") und leer bei Regierungs-
 * mitgliedern ohne Mandat.
 */
const CODES: Record<string, string> = {
  V: 'ÖVP',
  S: 'SPÖ',
  F: 'FPÖ',
  G: 'GRÜNE',
  N: 'NEOS',
};

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['ÖVP', /ÖVP|Volkspartei/i],
  ['SPÖ', /SPÖ|sozialdemokrat/i],
  ['FPÖ', /FPÖ|freiheitlich/i],
  ['GRÜNE', /grün/i],
  ['NEOS', /NEOS/],
  ['ohne Klub', /ohne Klub|klubungebunden|^OK$/i],
];

export function normalizeParty(raw: string | null | undefined): string | null {
  const party = (raw ?? '').trim();
  if (!party) return null;
  if (CODES[party]) return CODES[party];
  for (const [normalized, pattern] of PATTERNS) {
    if (pattern.test(party)) return normalized;
  }
  return null;
}

export function normalizeParties(raw: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(raw.map(normalizeParty).filter((p): p is string => p !== null))];
}
