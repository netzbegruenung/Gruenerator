import { type TranslationLanguage } from '@gruenerator/contracts';

/** `en-GB` → `en`; glossary pairs and detection work on root languages. */
export function rootLang(code: string): string {
  return code.split('-')[0]!.toLowerCase();
}

export const AUTO = 'auto';

export const AUTO_LABEL = 'Automatisch erkennen';

export function sourceOptions(languages: readonly TranslationLanguage[]): TranslationLanguage[] {
  return languages
    .filter((l) => l.usableAsSource)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function targetOptions(languages: readonly TranslationLanguage[]): TranslationLanguage[] {
  return languages
    .filter((l) => l.usableAsTarget)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function languageName(languages: readonly TranslationLanguage[], code: string): string {
  const exact = languages.find((l) => l.code.toLowerCase() === code.toLowerCase());
  if (exact) return exact.name;
  const root = rootLang(code);
  return languages.find((l) => rootLang(l.code) === root)?.name ?? code.toUpperCase();
}

/** Does any glossary dictionary translate INTO this target? Then the source must be explicit. */
export function glossaryTargets(pairs: readonly string[], targetLang: string): boolean {
  const root = rootLang(targetLang);
  return pairs.some((p) => p.split('>')[1] === root);
}

/** First target that is not the user's own language — English for a German audience. */
export function defaultTarget(languages: readonly TranslationLanguage[]): string {
  const targets = targetOptions(languages);
  return (
    targets.find((l) => l.code.toLowerCase() === 'en-gb')?.code ??
    targets.find((l) => rootLang(l.code) !== 'de')?.code ??
    targets[0]?.code ??
    ''
  );
}

export const NF = new Intl.NumberFormat('de-DE');

/** How many languages the quick-pick strip holds before the oldest drops off. */
export const RECENT_MAX = 4;

/**
 * Seeds the quick-pick strip. Wishes that this DeepL account does not offer are
 * dropped and the strip is topped up from the start of the list, so the bar is
 * never short and never shows a code the `<select>` does not have.
 */
export function initialRecent(
  options: readonly TranslationLanguage[],
  preferred: readonly string[],
  max: number = RECENT_MAX
): string[] {
  const codes = new Set(options.map((l) => l.code));
  const picked = preferred.filter((c) => c === AUTO || codes.has(c));
  for (const l of options) {
    if (picked.length >= max) break;
    if (!picked.includes(l.code)) picked.push(l.code);
  }
  return picked.slice(0, max);
}

/** Most recently chosen language first; `auto` stays pinned to the front. */
export function pushRecent(
  recent: readonly string[],
  code: string,
  max: number = RECENT_MAX
): string[] {
  if (recent.includes(code)) return [...recent];
  const pinned = recent.includes(AUTO) && code !== AUTO ? [AUTO] : [];
  return [...pinned, code, ...recent.filter((c) => c !== AUTO)].slice(0, max);
}
