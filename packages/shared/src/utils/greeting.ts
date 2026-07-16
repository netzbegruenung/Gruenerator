/**
 * Time-of-day + locale-aware greeting shared by the web Workplace home and the
 * mobile Chat home, so both surfaces speak with one voice. Ported from
 * apps/web/src/features/workplace/WorkplacePage.tsx — keep the two in sync.
 *
 * The template is stable for a whole day (seeded by the day number) so it does not
 * reshuffle on every render, and switches to a rainbow Pride greeting in June.
 */

function pickStable<T>(options: readonly T[], seed: number): T {
  return options[seed % options.length] as T;
}

const GENERAL_DE = [
  'Was stricken wir heute, @Vorname?',
  'Womit machen wir die Welt heute besser, @Vorname?',
  'Denkst du auch manchmal an Robert zurück, @Vorname?',
  'Bereit für den Wandel, @Vorname?',
  'Was steht heute auf der Agenda, @Vorname?',
] as const;

const PRIDE_GREETING = 'Happy Pride, @Vorname!';

/**
 * Pride month = June (month index 5). Evaluated live so it flips on/off at the
 * month boundary with no manual revert.
 */
export const isPrideMonth = (): boolean => new Date().getMonth() === 5;

function pickTemplate(locale: string | null | undefined, hour: number): string {
  const daySeed = Math.floor(Date.now() / 86_400_000);

  if (isPrideMonth()) {
    return PRIDE_GREETING;
  }

  if (locale === 'de-AT') {
    if (hour < 6)
      return pickStable(
        ['Gute Nacht', 'Schlaf guat', 'Das Ehrenamt schläft nie, was @Vorname?'] as const,
        daySeed
      );
    if (hour < 11) return pickStable(['Guten Morgen', 'Servus', 'Grüß dich'] as const, daySeed);
    if (hour < 14)
      return pickStable(['Grüß Gott', 'Servus', 'Habidere', 'Mahlzeit'] as const, daySeed);
    if (hour < 18)
      return pickStable(['Grüß dich', 'Servus', 'Schönen Nachmittag'] as const, daySeed);
    return pickStable(['Guten Abend', 'Schönen Abend', 'Servus'] as const, daySeed);
  }

  if (hour < 6)
    return pickStable(['Gute Nacht', 'Das Ehrenamt schläft nie, was @Vorname?'] as const, daySeed);
  if (hour < 12)
    return pickStable(
      ['Guten Morgen', 'Moin', 'Der frühe Vogel rettet den Artenschutz, @Vorname', ...GENERAL_DE],
      daySeed
    );
  if (hour < 14) return pickStable(['Guten Tag', 'Mahlzeit', ...GENERAL_DE], daySeed);
  if (hour < 18) return pickStable(['Guten Tag', ...GENERAL_DE], daySeed);
  return pickStable(['Guten Abend', ...GENERAL_DE], daySeed);
}

export function getGreeting(locale: string | null | undefined, firstName: string | null): string {
  const template = pickTemplate(locale, new Date().getHours());

  if (template.includes('@Vorname')) {
    return template.replace('@Vorname', firstName ?? 'du');
  }
  return firstName ? `${template}, ${firstName}` : template;
}
