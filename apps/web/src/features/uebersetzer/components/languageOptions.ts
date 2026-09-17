import { type TranslationLanguage } from '@gruenerator/contracts';

/** `en-GB` → `en`; glossary pairs and detection work on root languages. */
export function rootLang(code: string): string {
  return code.split('-')[0]!.toLowerCase();
}

export const AUTO = 'auto';

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

/** Native select styled like `Input` (the agents feature's `selectCls` convention). */
export const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
