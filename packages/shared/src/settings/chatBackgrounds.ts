import { chatBackgroundSchema, type ChatBackground } from '@gruenerator/contracts';

/**
 * The chat-start background presets, in the parts both platforms agree on.
 *
 * The keys are owned by `chatBackgroundSchema` in @gruenerator/contracts — that
 * is what the database stores. Names and descriptions live here so the picker
 * reads the same on the phone as in the browser.
 *
 * What stays platform-side is how the preset is *drawn*, because the two do not
 * agree there: web has a CSS class and a gradient swatch
 * (`apps/web/src/features/workplace/chatBackgrounds.ts`), mobile has its own
 * table — one flat colour for most presets, a layered mesh for `mesh`, `nebel`
 * and `dunst` (`apps/mobile/theme/chatBackgrounds.ts`). Putting web's gradient
 * stops in here would push a value mobile cannot use onto both.
 */
export type ChatBackgroundPlatform = 'web' | 'mobile';

/**
 * Wie ein Preset die Fläche füllt — die einzige Achse, nach der sich die zehn
 * überhaupt sortieren lassen.
 *
 * Nach Farbe zu gruppieren ginge nicht: die bunten teilen sich alle dieselben
 * vier Töne und unterscheiden sich nur darin, wie viel Schleier darüber liegt.
 * Wer die Auswahl öffnet, entscheidet zuerst „viel Farbe oder wenig" und erst
 * danach „welche".
 */
export const CHAT_BACKGROUND_FAMILIES = [
  {
    key: 'bunt',
    label: 'Bunt',
    description: 'Mehrere Farben über die Fläche verteilt.',
  },
  {
    key: 'einfarbig',
    label: 'Einfarbig',
    description: 'Ein Ton für die ganze Fläche — zurückhaltender.',
  },
] as const;

export type ChatBackgroundFamily = (typeof CHAT_BACKGROUND_FAMILIES)[number]['key'];

export interface ChatBackgroundPreset {
  key: ChatBackground;
  label: string;
  description: string;
  /**
   * Gruppe in der Auswahl. `neutral` steht bei den einfarbigen, obwohl es gar
   * keinen Ton setzt: es ist trotzdem eine ruhige Fläche, und eine eigene
   * Gruppe mit genau einer Kachel wäre mehr Überschrift als Inhalt. Was es
   * wirklich tut, steht in seiner eigenen Beschreibung.
   */
  family: ChatBackgroundFamily;
  /** Composer accent (send button). Empty keeps the brand green. */
  accent: string;
  /**
   * Where the preset is offered. Omitted means both — the safe default, since
   * every preset predating this field exists on either platform.
   *
   * A preset can be drawn on one platform before the other, and that is a fact
   * about the code rather than a matter of taste: a mesh preset is five or six
   * layered radial gradients, which each platform has to draw in its own way —
   * `react-native-svg` on the phone, a `.workplace-chat-bg--*` class in the
   * browser. Marking it here keeps the picker from offering something that would
   * silently fall back to another preset's look.
   */
  platforms?: readonly ChatBackgroundPlatform[];
}

/** Presets a given platform actually draws. */
export function chatBackgroundsFor(
  platform: ChatBackgroundPlatform
): readonly ChatBackgroundPreset[] {
  return CHAT_BACKGROUND_PRESETS.filter((preset) => (preset.platforms ?? BOTH).includes(platform));
}

const BOTH: readonly ChatBackgroundPlatform[] = ['web', 'mobile'];

/**
 * What an *unset* profile falls back to. Nobody's stored choice is affected.
 *
 * Still `sunrise` in the browser. The reason it once had to be — a default has
 * to be a preset both platforms can draw, and `nebel` was app-only — is gone
 * now that web draws `nebel` too; what is left is that changing it would restyle
 * the chat start for every web account that never picked one. That is a product
 * call, not a consequence of the port, so it stays a separate decision.
 */
export const DEFAULT_CHAT_BACKGROUND: ChatBackground = 'sunrise';

/**
 * The app's default since 2026-07-27 — `nebel`, the variant being tried first.
 *
 * Resolving through `resolveChatBackground(value, 'mobile')` is what applies
 * it; a profile that already names a preset keeps that preset either way.
 */
export const DEFAULT_CHAT_BACKGROUND_MOBILE: ChatBackground = 'nebel';

export const CHAT_BACKGROUND_PRESETS: readonly ChatBackgroundPreset[] = [
  // The mesh presets are the same four colours — peach, yellow, green, lilac —
  // at different strengths. The distinction worth carrying in the label is how
  // much of the screen keeps colour, because that is what a person is actually
  // choosing between; the names come from the design document.
  //
  // The accent is a step darker than the design's #52907A link green. That green
  // is a background tone: mixed down to `--color-primary-700` on a `--color-primary-50`
  // fill — the „Entdecke den neuen Grünerator"-Knopf under the composer — it
  // lands at 3.9:1 and misses AA. #3f7161 (the design's own link-hover green)
  // carries the same fill at 5.7:1 and white text at 5.6:1.
  {
    key: 'nebel',
    label: 'Nebel',
    description: 'Farbwolken hinter weißem Dunst — der Composer steht frei.',
    family: 'bunt',
    accent: '#3f7161',
  },
  {
    key: 'kern',
    label: 'Klarer Kern',
    description: 'Weiß in der Mitte, Farbe nur am Rand — die ruhigste Fassung.',
    family: 'bunt',
    accent: '#3f7161',
    platforms: ['web'],
  },
  {
    key: 'dunst',
    label: 'Dunst von unten',
    description: 'Farbe sammelt sich am unteren Rand, oben bleibt es klar.',
    family: 'bunt',
    accent: '#3f7161',
  },
  {
    key: 'mesh',
    label: 'Farbwolken',
    description: 'Dieselben Farben ohne Schleier — die kräftigste Fassung.',
    family: 'bunt',
    accent: '#3f7161',
    platforms: ['mobile'],
  },
  {
    key: 'sunrise',
    label: 'Sonnenaufgang',
    description: 'Der Klassiker — warmes Gold hinter dem Composer.',
    family: 'einfarbig',
    accent: '#8a6d0b',
  },
  {
    key: 'tanne',
    label: 'Tanne',
    description: 'Grünes Licht, ruhig und sattgrün.',
    family: 'einfarbig',
    accent: '#2f7d4f',
  },
  {
    key: 'himmel',
    label: 'Himmel',
    description: 'Kühles Blau für klaren Kopf.',
    family: 'einfarbig',
    accent: '#1667b8',
  },
  {
    key: 'sand',
    label: 'Sand',
    description: 'Warmes Beige, sehr zurückhaltend.',
    family: 'einfarbig',
    accent: '#8f6534',
  },
  {
    key: 'magenta',
    label: 'Magenta',
    description: 'Ein Hauch Pink — auffällig, aber weich.',
    family: 'einfarbig',
    accent: '#c2185b',
  },
  {
    key: 'regenbogen',
    label: 'Regenbogen',
    description: 'Alle Farben auf einmal — sanft ineinander verlaufend.',
    family: 'bunt',
    accent: '#3f7161',
  },
  {
    key: 'neutral',
    label: 'Neutral',
    description: 'Kein Verlauf — nur der Seitenhintergrund.',
    family: 'einfarbig',
    accent: '',
  },
];

/**
 * Falls back to the platform's default for unset, unknown or legacy values.
 *
 * Also falls back when the stored preset exists but the platform does not draw
 * it — otherwise a choice made in the app would leave the browser showing a
 * class that is not there.
 *
 * `platform` is optional so the many callers that only ever run on one surface
 * keep working; pass it where the answer actually differs.
 */
export function resolveChatBackground(
  value: unknown,
  platform?: ChatBackgroundPlatform
): ChatBackgroundPreset {
  const fallback = platform === 'mobile' ? DEFAULT_CHAT_BACKGROUND_MOBILE : DEFAULT_CHAT_BACKGROUND;
  const parsed = chatBackgroundSchema.safeParse(value);
  const key = parsed.success ? parsed.data : fallback;
  const found = CHAT_BACKGROUND_PRESETS.find((preset) => preset.key === key);
  const drawable = !found || !platform || (found.platforms ?? BOTH).includes(platform);
  const resolved = drawable
    ? found
    : CHAT_BACKGROUND_PRESETS.find((preset) => preset.key === fallback);
  return resolved ?? (CHAT_BACKGROUND_PRESETS[0] as ChatBackgroundPreset);
}
