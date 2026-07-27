import { chatBackgroundSchema, type ChatBackground } from '@gruenerator/contracts';

/**
 * Presentation layer for the chat-start background presets. The keys are owned
 * by `chatBackgroundSchema` in @gruenerator/contracts (that's what the DB
 * stores); this file only adds the label, the picker swatch and the CSS class —
 * the gradients and the composer accent live in workplace-sunrise.css.
 */
export interface ChatBackgroundPreset {
  key: ChatBackground;
  label: string;
  description: string;
  /** Modifier class on top of `.workplace-chat-sunrise`; empty for the default. */
  className: string;
  /** CSS gradient used for the swatch in the picker. */
  swatch: string;
  /**
   * The composer accent (send button) for this preset — mirrors `--wp-accent`
   * in workplace-sunrise.css, which is what the live UI actually renders. Kept
   * here only so the picker can show the accent on the selected swatch; if you
   * change one, change the other. Empty = keeps the brand green.
   */
  accent: string;
}

export const DEFAULT_CHAT_BACKGROUND: ChatBackground = 'sunrise';

export const CHAT_BACKGROUND_PRESETS: readonly ChatBackgroundPreset[] = [
  {
    key: 'sunrise',
    label: 'Sonnenaufgang',
    description: 'Der Klassiker — warmes Gold hinter dem Composer.',
    className: '',
    swatch: 'radial-gradient(circle at 50% 60%, #e9d696 0%, #f7efd8 45%, #fefcf5 100%)',
    accent: '#8a6d0b',
  },
  {
    key: 'tanne',
    label: 'Tanne',
    description: 'Grünes Licht, ruhig und sattgrün.',
    className: 'workplace-chat-bg--tanne',
    swatch: 'radial-gradient(circle at 50% 60%, #7ab08f 0%, #d3e8dc 45%, #f5faf7 100%)',
    accent: '#2f7d4f',
  },
  {
    key: 'himmel',
    label: 'Himmel',
    description: 'Kühles Blau für klaren Kopf.',
    className: 'workplace-chat-bg--himmel',
    swatch: 'radial-gradient(circle at 50% 60%, #89bae7 0%, #d5e6f6 45%, #f5f9fd 100%)',
    accent: '#1667b8',
  },
  {
    key: 'sand',
    label: 'Sand',
    description: 'Warmes Beige, sehr zurückhaltend.',
    className: 'workplace-chat-bg--sand',
    swatch: 'radial-gradient(circle at 50% 60%, #d6be9e 0%, #eee3d2 45%, #fbf8f3 100%)',
    accent: '#8f6534',
  },
  {
    key: 'magenta',
    label: 'Magenta',
    description: 'Ein Hauch Pink — auffällig, aber weich.',
    className: 'workplace-chat-bg--magenta',
    swatch: 'radial-gradient(circle at 50% 60%, #e498be 0%, #f6dce9 45%, #fdf5f9 100%)',
    accent: '#c2185b',
  },
  {
    key: 'regenbogen',
    label: 'Regenbogen',
    description: 'Alle Farben auf einmal — sanft ineinander verlaufend.',
    className: 'workplace-chat-bg--regenbogen',
    swatch:
      'linear-gradient(135deg, #f3b6be 0%, #f6d9a8 25%, #bfe3bb 50%, #a9cdee 75%, #cdb6e6 100%)',
    accent: '#8e44ad',
  },
  {
    key: 'neutral',
    label: 'Neutral',
    description: 'Kein Verlauf — nur der Seitenhintergrund.',
    className: 'workplace-chat-bg--neutral',
    swatch: 'linear-gradient(135deg, #ffffff 0%, #f1f1f1 100%)',
    accent: '',
  },
];

/** Falls back to `sunrise` for unset, unknown or legacy values. */
export const resolveChatBackground = (value: unknown): ChatBackgroundPreset => {
  const parsed = chatBackgroundSchema.safeParse(value);
  const key = parsed.success ? parsed.data : DEFAULT_CHAT_BACKGROUND;
  return (
    CHAT_BACKGROUND_PRESETS.find((preset) => preset.key === key) ??
    (CHAT_BACKGROUND_PRESETS[0] as ChatBackgroundPreset)
  );
};
