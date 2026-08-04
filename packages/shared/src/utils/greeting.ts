/**
 * Time-of-day + locale-aware greeting shared by the web Workplace/Chat heroes
 * (WorkplaceGreeting) and the mobile Chat home, so all surfaces speak with one
 * voice.
 *
 * The template is stable for a whole day (seeded by the day number) so it does not
 * reshuffle on every render, switches to a rainbow Pride greeting in June, and to
 * the launch announcement for the week after a release cut-off.
 */
import { getInstance, type InstanceId } from '../instances/index.js';

function pickStable<T>(options: readonly T[], seed: number): T {
  return options[seed % options.length] as T;
}

const GENERAL_DE = [
  'Was stricken wir heute, @Vorname?',
  'Womit machen wir die Welt heute besser, @Vorname?',
  'Bereit für den Wandel, @Vorname?',
  'Was steht heute auf der Agenda, @Vorname?',
] as const;

const PRIDE_GREETING = 'Happy Pride, @Vorname!';

// No `@Vorname` token: the name is appended by getGreeting, so a user without a
// first name gets a clean "Willkommen im neuen Grünerator" instead of "…, du".
const LAUNCH_GREETING = 'Willkommen im neuen Grünerator';

/**
 * Launch week: the release announcement takes over the hero for seven days from
 * the cut-off, then falls back to the normal rotation with no manual revert.
 *
 * Local time on purpose — the window flips at the user's midnight, like the day
 * seed. Month is 0-based, so `7` is August.
 */
export const LAUNCH_GREETING_START = new Date(2026, 7, 1);
export const LAUNCH_GREETING_DAYS = 7;

const isLaunchWeek = (): boolean => {
  const start = LAUNCH_GREETING_START.getTime();
  const now = Date.now();
  return now >= start && now < start + LAUNCH_GREETING_DAYS * 86_400_000;
};

/**
 * Pride month = June (month index 5). Evaluated live so it flips on/off at the
 * month boundary with no manual revert.
 */
export const isPrideMonth = (): boolean => new Date().getMonth() === 5;

/**
 * A template that embeds `@Vorname` mid-sentence is a whole sentence
 * ("Womit machen wir die Welt heute besser, @Vorname?"); a bare one is a
 * greeting word that gets ", @Vorname" appended ("Guten Morgen"). That is the
 * only difference that matters for the phone, where the hero has ~411dp and a
 * sentence wraps to three lines above the composer.
 *
 * Pride is the exception: it carries the token but is still one short line.
 */
function isShortTemplate(template: string): boolean {
  return template === PRIDE_GREETING || !template.includes('@Vorname');
}

function pickTemplate(locale: string | null | undefined, hour: number, short: boolean): string {
  const daySeed = Math.floor(Date.now() / 86_400_000);
  // Applied to each candidate list rather than to the result: filtering after
  // the pick would collapse every long day onto the same fallback, so the
  // greeting would stop varying at all on mobile.
  const pick = <T extends string>(options: readonly T[], seed: number): string => {
    const allowed = short ? options.filter(isShortTemplate) : options;
    return pickStable(allowed.length > 0 ? allowed : options, seed);
  };

  // Launch week outranks Pride: it is a dated one-week announcement, Pride runs
  // a whole month and loses at most a few days to it.
  if (isLaunchWeek()) {
    return LAUNCH_GREETING;
  }

  if (isPrideMonth()) {
    return PRIDE_GREETING;
  }

  if (locale === 'de-AT') {
    if (hour < 6)
      return pick(
        ['Gute Nacht', 'Schlaf guat', 'Das Ehrenamt schläft nie, was @Vorname?'] as const,
        daySeed
      );
    if (hour < 11) return pick(['Guten Morgen', 'Servus', 'Grüß dich'] as const, daySeed);
    if (hour < 14) return pick(['Grüß Gott', 'Servus', 'Habidere', 'Mahlzeit'] as const, daySeed);
    if (hour < 18) return pick(['Grüß dich', 'Servus', 'Schönen Nachmittag'] as const, daySeed);
    return pick(['Guten Abend', 'Schönen Abend', 'Servus'] as const, daySeed);
  }

  if (hour < 6)
    return pick(['Gute Nacht', 'Das Ehrenamt schläft nie, was @Vorname?'] as const, daySeed);
  if (hour < 12)
    return pick(
      ['Guten Morgen', 'Moin', 'Der frühe Vogel rettet den Artenschutz, @Vorname', ...GENERAL_DE],
      daySeed
    );
  if (hour < 14) return pick(['Guten Tag', 'Mahlzeit', ...GENERAL_DE], daySeed);
  if (hour < 18) return pick(['Guten Tag', ...GENERAL_DE], daySeed);
  return pick(['Guten Abend', ...GENERAL_DE], daySeed);
}

export interface GreetingOptions {
  /**
   * Keep only the short time-of-day greetings, dropping the conversational
   * one-liners. Set on mobile, where the hero sits directly above the composer
   * and a sentence wraps to three lines; web's hero has the width for both.
   */
  short?: boolean;
  /**
   * When the resolved instance carries a `heroGreeting`, it replaces the
   * DE/AT rotation outright — an instance with a fixed voice (e.g. `bgst`)
   * skips Pride/launch-week/time-of-day entirely. Instances without one
   * (production, beta, local) fall through to the normal rotation, a no-op.
   */
  instanceId?: InstanceId;
}

export function getGreeting(
  locale: string | null | undefined,
  firstName: string | null,
  options: GreetingOptions = {}
): string {
  const instanceGreeting = options.instanceId ? getInstance(options.instanceId).heroGreeting : undefined;
  const template = instanceGreeting ?? pickTemplate(locale, new Date().getHours(), options.short === true);

  if (template.includes('@Vorname')) {
    return template.replace('@Vorname', firstName ?? 'du');
  }
  return firstName ? `${template}, ${firstName}` : template;
}
