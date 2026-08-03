import { chatBackgroundSchema, type ChatBackground } from '@gruenerator/contracts';
import {
  CHAT_BACKGROUND_FAMILIES,
  DEFAULT_CHAT_BACKGROUND,
  chatBackgroundsFor,
  type ChatBackgroundFamily,
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
  // `mesh` is still app-only: `chatBackgroundsFor('web')` filters it out of the
  // list this file exports, so this entry exists to satisfy the exhaustive
  // Record and is never rendered. The swatch is the real gradient rather than a
  // placeholder, so whoever brings it to web finds the values already here; what
  // is missing is a `.workplace-chat-bg--mesh` class in workplace-sunrise.css.
  //
  // The swatches for the mesh presets are the screen gradients re-aimed at a
  // 28px circle: same colours and alphas, wider radii, centres pulled off the
  // rim. Stated at full-screen geometry the clouds would sit outside the chip.
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
  nebel: {
    className: 'workplace-chat-bg--nebel',
    swatch:
      'radial-gradient(130% 78% at 50% 50%, rgb(255 255 255 / 0.82) 0%, rgb(255 255 255 / 0.45) 38%, rgb(255 255 255 / 0.08) 68%, rgb(255 255 255 / 0) 88%),' +
      'radial-gradient(150% 100% at 10% 20%, rgb(248 214 207 / 0.6) 0%, rgb(248 214 207 / 0) 70%),' +
      'radial-gradient(140% 90% at 44% 84%, rgb(244 239 199 / 0.5) 0%, rgb(244 239 199 / 0) 68%),' +
      'radial-gradient(130% 85% at 96% 56%, rgb(206 230 219 / 0.55) 0%, rgb(206 230 219 / 0) 70%),' +
      'radial-gradient(120% 75% at 84% 102%, rgb(220 218 244 / 0.5) 0%, rgb(220 218 244 / 0) 66%),' +
      'radial-gradient(130% 62% at 50% -4%, rgb(253 248 240 / 1) 0%, rgb(253 248 240 / 0) 64%),' +
      '#fdfbf7',
  },
  kern: {
    className: 'workplace-chat-bg--kern',
    swatch:
      'radial-gradient(104% 82% at 50% 50%, rgb(255 255 255 / 0.97) 0%, rgb(255 255 255 / 0.82) 40%, rgb(255 255 255 / 0.2) 72%, rgb(255 255 255 / 0) 90%),' +
      'radial-gradient(120% 100% at 4% 16%, rgb(247 206 198 / 0.8) 0%, rgb(247 206 198 / 0) 64%),' +
      'radial-gradient(110% 95% at 96% 24%, rgb(220 218 246 / 0.75) 0%, rgb(220 218 246 / 0) 62%),' +
      'radial-gradient(110% 95% at 96% 88%, rgb(199 228 216 / 0.8) 0%, rgb(199 228 216 / 0) 62%),' +
      'radial-gradient(110% 90% at 6% 96%, rgb(243 238 190 / 0.7) 0%, rgb(243 238 190 / 0) 62%),' +
      '#fdfcf9',
  },
  dunst: {
    className: 'workplace-chat-bg--dunst',
    swatch:
      'radial-gradient(120% 60% at 50% 24%, rgb(255 255 255 / 0.95) 0%, rgb(255 255 255 / 0.6) 46%, rgb(255 255 255 / 0) 82%),' +
      'radial-gradient(120% 46% at 14% 92%, rgb(248 210 202 / 0.75) 0%, rgb(248 210 202 / 0) 68%),' +
      'radial-gradient(130% 44% at 56% 104%, rgb(244 238 192 / 0.7) 0%, rgb(244 238 192 / 0) 66%),' +
      'radial-gradient(120% 46% at 96% 84%, rgb(203 229 217 / 0.7) 0%, rgb(203 229 217 / 0) 66%),' +
      'radial-gradient(110% 40% at 88% 110%, rgb(219 217 245 / 0.6) 0%, rgb(219 217 245 / 0) 62%),' +
      'radial-gradient(120% 40% at 50% 0%, rgb(253 249 242 / 1) 0%, rgb(253 249 242 / 0) 58%),' +
      '#fdfcfa',
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

export interface ChatBackgroundGroup {
  family: ChatBackgroundFamily;
  label: string;
  description: string;
  presets: readonly ChatBackgroundPreset[];
}

/**
 * The picker's sections, in the order of `CHAT_BACKGROUND_FAMILIES`.
 *
 * A family the platform draws nothing for is dropped rather than rendered as an
 * empty heading — the `platforms` filter above can empty one out.
 */
export const CHAT_BACKGROUND_GROUPS: readonly ChatBackgroundGroup[] = CHAT_BACKGROUND_FAMILIES.map(
  ({ key, label, description }) => ({
    family: key,
    label,
    description,
    presets: CHAT_BACKGROUND_PRESETS.filter((preset) => preset.family === key),
  })
).filter((group) => group.presets.length > 0);

/** Falls back to `sunrise` for unset, unknown, legacy or app-only values. */
export const resolveChatBackground = (value: unknown): ChatBackgroundPreset => {
  const parsed = chatBackgroundSchema.safeParse(value);
  const key = parsed.success ? parsed.data : DEFAULT_CHAT_BACKGROUND;
  return (
    CHAT_BACKGROUND_PRESETS.find((preset) => preset.key === key) ??
    (CHAT_BACKGROUND_PRESETS[0] as ChatBackgroundPreset)
  );
};
