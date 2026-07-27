import { chatBackgroundSchema, type ChatBackground } from '@gruenerator/contracts';
import {
  CHAT_BACKGROUND_PRESETS as SHARED_PRESETS,
  DEFAULT_CHAT_BACKGROUND,
  type ChatBackgroundPreset as SharedPreset,
} from '@gruenerator/shared/settings';

/**
 * Presentation layer for the chat-start background presets.
 *
 * Keys, names, descriptions and colours are shared with the mobile app
 * (`packages/shared/src/settings/chatBackgrounds.ts`); the keys themselves are
 * owned by `chatBackgroundSchema` in @gruenerator/contracts, which is what the
 * DB stores. What is added here is web-only: the modifier class and the CSS
 * gradient for the picker swatch. The real gradients and the composer accent
 * live in workplace-sunrise.css.
 */
export interface ChatBackgroundPreset extends SharedPreset {
  /** Modifier class on top of `.workplace-chat-sunrise`; empty for the default. */
  className: string;
  /** CSS gradient used for the swatch in the picker. */
  swatch: string;
}

export { DEFAULT_CHAT_BACKGROUND };

/** Web-only rendering details, keyed by the shared preset key. */
const RENDERING: Record<ChatBackground, { className: string; swatch: string }> = {
  sunrise: {
    className: '',
    swatch: 'radial-gradient(circle at 50% 60%, #e9d696 0%, #f7efd8 45%, #fefcf5 100%)',
  },
  tanne: {
    className: 'workplace-chat-bg--tanne',
    swatch: 'radial-gradient(circle at 50% 60%, #7ab08f 0%, #d3e8dc 45%, #f5faf7 100%)',
  },
  himmel: {
    className: 'workplace-chat-bg--himmel',
    swatch: 'radial-gradient(circle at 50% 60%, #89bae7 0%, #d5e6f6 45%, #f5f9fd 100%)',
  },
  sand: {
    className: 'workplace-chat-bg--sand',
    swatch: 'radial-gradient(circle at 50% 60%, #d6be9e 0%, #eee3d2 45%, #fbf8f3 100%)',
  },
  magenta: {
    className: 'workplace-chat-bg--magenta',
    swatch: 'radial-gradient(circle at 50% 60%, #e498be 0%, #f6dce9 45%, #fdf5f9 100%)',
  },
  regenbogen: {
    className: 'workplace-chat-bg--regenbogen',
    swatch:
      'linear-gradient(135deg, #f3b6be 0%, #f6d9a8 25%, #bfe3bb 50%, #a9cdee 75%, #cdb6e6 100%)',
  },
  neutral: {
    className: 'workplace-chat-bg--neutral',
    swatch: 'linear-gradient(135deg, #ffffff 0%, #f1f1f1 100%)',
  },
};

export const CHAT_BACKGROUND_PRESETS: readonly ChatBackgroundPreset[] = SHARED_PRESETS.map(
  (preset) => ({ ...preset, ...RENDERING[preset.key] })
);

/** Falls back to `sunrise` for unset, unknown or legacy values. */
export const resolveChatBackground = (value: unknown): ChatBackgroundPreset => {
  const parsed = chatBackgroundSchema.safeParse(value);
  const key = parsed.success ? parsed.data : DEFAULT_CHAT_BACKGROUND;
  return (
    CHAT_BACKGROUND_PRESETS.find((preset) => preset.key === key) ??
    (CHAT_BACKGROUND_PRESETS[0] as ChatBackgroundPreset)
  );
};
