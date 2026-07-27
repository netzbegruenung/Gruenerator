import { chatBackgroundSchema, type ChatBackground } from '@gruenerator/contracts';
import {
  DEFAULT_CHAT_BACKGROUND,
  chatBackgroundsFor,
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
  // App-only for now — filtered out of the list this file exports, so this entry
  // exists to satisfy the exhaustive Record and is never rendered. The swatch is
  // the real gradient rather than a placeholder so that whoever brings the
  // preset to web finds the values already here; what is still missing is the
  // `.workplace-chat-bg--mesh` class in workplace-sunrise.css.
  mesh: {
    className: 'workplace-chat-bg--mesh',
    swatch:
      'radial-gradient(120% 80% at 12% 24%, rgb(248 205 197 / 0.95) 0%, rgb(248 205 197 / 0) 62%),' +
      'radial-gradient(100% 70% at 44% 82%, rgb(244 238 186 / 0.85) 0%, rgb(244 238 186 / 0) 60%),' +
      'radial-gradient(95% 65% at 92% 58%, rgb(199 228 215 / 0.95) 0%, rgb(199 228 215 / 0) 62%),' +
      'radial-gradient(85% 55% at 82% 100%, rgb(215 213 243 / 0.9) 0%, rgb(215 213 243 / 0) 58%),' +
      'radial-gradient(110% 55% at 50% 0%, rgb(253 247 237 / 1) 0%, rgb(253 247 237 / 0) 60%),' +
      '#fcf9f4',
  },
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

// `chatBackgroundsFor('web')` rather than every shared preset: a preset can be
// drawn on one platform before the other, and offering one the browser has no
// class for would show the previous preset's look under a different name.
export const CHAT_BACKGROUND_PRESETS: readonly ChatBackgroundPreset[] = chatBackgroundsFor(
  'web'
).map((preset) => ({ ...preset, ...RENDERING[preset.key] }));

/** Falls back to `sunrise` for unset, unknown, legacy or app-only values. */
export const resolveChatBackground = (value: unknown): ChatBackgroundPreset => {
  const parsed = chatBackgroundSchema.safeParse(value);
  const key = parsed.success ? parsed.data : DEFAULT_CHAT_BACKGROUND;
  return (
    CHAT_BACKGROUND_PRESETS.find((preset) => preset.key === key) ??
    (CHAT_BACKGROUND_PRESETS[0] as ChatBackgroundPreset)
  );
};
