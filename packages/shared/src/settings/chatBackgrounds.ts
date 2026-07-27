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
 * table — one flat colour for most presets, a five-layer mesh for `mesh`
 * (`apps/mobile/theme/chatBackgrounds.ts`). Putting web's gradient stops in here
 * would push a value mobile cannot use onto both.
 */
export type ChatBackgroundPlatform = 'web' | 'mobile';

export interface ChatBackgroundPreset {
  key: ChatBackground;
  label: string;
  description: string;
  /** Composer accent (send button). Empty keeps the brand green. */
  accent: string;
  /**
   * Where the preset is offered. Omitted means both — the safe default, since
   * every preset predating this field exists on either platform.
   *
   * A preset can be drawn on one platform before the other, and that is a fact
   * about the code rather than a matter of taste: `mesh` needs five layered
   * radial gradients, which mobile draws with `react-native-svg` and web still
   * has no class for. Marking it here keeps the picker from offering something
   * that would silently fall back to another preset's look.
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
 * Still `sunrise`, because a default has to be a preset both platforms can
 * draw — see `DEFAULT_CHAT_BACKGROUND_MOBILE` for why the app answers this
 * differently, and `platforms` above for what makes that legitimate.
 */
export const DEFAULT_CHAT_BACKGROUND: ChatBackground = 'sunrise';

/**
 * The app's default since 2026-07-27 — `nebel`, the variant being tried next.
 *
 * It differs from the one above because the mesh presets are app-only for now.
 * Resolving through `resolveChatBackground(value, 'mobile')` is what applies
 * it; a profile that already names a preset keeps that preset either way.
 */
export const DEFAULT_CHAT_BACKGROUND_MOBILE: ChatBackground = 'nebel';

export const CHAT_BACKGROUND_PRESETS: readonly ChatBackgroundPreset[] = [
  // The three mesh presets are the same four colours — peach, yellow, green,
  // lilac — at three strengths. The distinction worth carrying in the label is
  // how much of the screen keeps colour, because that is what a person is
  // actually choosing between; the names come from the design document.
  {
    key: 'nebel',
    label: 'Nebel',
    description: 'Farbwolken hinter weißem Dunst — der Composer steht frei.',
    accent: '#52907A',
    platforms: ['mobile'],
  },
  {
    key: 'dunst',
    label: 'Dunst von unten',
    description: 'Farbe sammelt sich am unteren Rand, oben bleibt es klar.',
    accent: '#52907A',
    platforms: ['mobile'],
  },
  {
    key: 'mesh',
    label: 'Farbwolken',
    description: 'Dieselben Farben ohne Schleier — die kräftigste Fassung.',
    accent: '#52907A',
    platforms: ['mobile'],
  },
  {
    key: 'sunrise',
    label: 'Sonnenaufgang',
    description: 'Der Klassiker — warmes Gold hinter dem Composer.',
    accent: '#8a6d0b',
  },
  {
    key: 'tanne',
    label: 'Tanne',
    description: 'Grünes Licht, ruhig und sattgrün.',
    accent: '#2f7d4f',
  },
  {
    key: 'himmel',
    label: 'Himmel',
    description: 'Kühles Blau für klaren Kopf.',
    accent: '#1667b8',
  },
  {
    key: 'sand',
    label: 'Sand',
    description: 'Warmes Beige, sehr zurückhaltend.',
    accent: '#8f6534',
  },
  {
    key: 'magenta',
    label: 'Magenta',
    description: 'Ein Hauch Pink — auffällig, aber weich.',
    accent: '#c2185b',
  },
  {
    key: 'regenbogen',
    label: 'Regenbogen',
    description: 'Alle Farben auf einmal — sanft ineinander verlaufend.',
    accent: '#8e44ad',
  },
  {
    key: 'neutral',
    label: 'Neutral',
    description: 'Kein Verlauf — nur der Seitenhintergrund.',
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
