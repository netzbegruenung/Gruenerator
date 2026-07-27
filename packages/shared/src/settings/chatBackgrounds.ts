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
 * (`apps/web/src/features/workplace/chatBackgrounds.ts`), mobile has one flat
 * colour per preset out of its own palette
 * (`apps/mobile/theme/chatBackgrounds.ts`). Putting web's gradient stops in here
 * would push a value mobile cannot use onto both.
 */
export interface ChatBackgroundPreset {
  key: ChatBackground;
  label: string;
  description: string;
  /** Composer accent (send button). Empty keeps the brand green. */
  accent: string;
}

export const DEFAULT_CHAT_BACKGROUND: ChatBackground = 'sunrise';

export const CHAT_BACKGROUND_PRESETS: readonly ChatBackgroundPreset[] = [
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

/** Falls back to `sunrise` for unset, unknown or legacy values. */
export function resolveChatBackground(value: unknown): ChatBackgroundPreset {
  const parsed = chatBackgroundSchema.safeParse(value);
  const key = parsed.success ? parsed.data : DEFAULT_CHAT_BACKGROUND;
  return (
    CHAT_BACKGROUND_PRESETS.find((preset) => preset.key === key) ??
    (CHAT_BACKGROUND_PRESETS[0] as ChatBackgroundPreset)
  );
}
