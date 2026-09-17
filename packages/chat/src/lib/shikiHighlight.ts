import type { HighlighterCore } from 'shiki/core';
import type { CodeHighlighterPlugin } from 'streamdown';

// Fine-grained Shiki: createHighlighterCore + the JS regex engine + only the
// languages/themes we actually use. This emits chunks ONLY for these grammars
// (not all ~200) and avoids the oniguruma WASM — keeping the lazy chunk small.
const LANGS = ['python', 'javascript', 'typescript', 'tsx', 'jsx', 'bash', 'json'] as const;
const THEMES: [string, string] = ['github-light', 'github-dark'];

const LANG_ALIASES: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
};

export function normalizeLang(lang: string | undefined): string {
  if (!lang) return 'text';
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] ?? lower;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
// Set once the promise settles, so the plugin below can answer synchronously
// instead of awaiting an already-resolved promise on every code block.
let loadedHighlighter: HighlighterCore | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
      ]);
      const highlighter = await createHighlighterCore({
        themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
        langs: [
          import('shiki/langs/python.mjs'),
          import('shiki/langs/javascript.mjs'),
          import('shiki/langs/typescript.mjs'),
          import('shiki/langs/tsx.mjs'),
          import('shiki/langs/jsx.mjs'),
          import('shiki/langs/bash.mjs'),
          import('shiki/langs/json.mjs'),
        ],
        engine: createJavaScriptRegexEngine(),
      });
      loadedHighlighter = highlighter;
      return highlighter;
    })();
  }
  return highlighterPromise;
}

function resolveLoadedLang(hl: HighlighterCore, lang: string): string {
  return hl.getLoadedLanguages().includes(lang) ? lang : 'text';
}

/**
 * Highlight `code` to an HTML string with dual light/dark themes. `defaultColor:
 * false` emits CSS variables (--shiki-light / --shiki-dark) instead of inline
 * colors, so the `[data-theme='dark']` selector can swap them (see chat.css).
 * Unknown languages fall back to plain text. Used by the legacy renderer's
 * ChatCodeBlock; the Streamdown renderer goes through `shikiCodePlugin`.
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang: resolveLoadedLang(hl, lang),
    themes: { light: THEMES[0], dark: THEMES[1] },
    defaultColor: false,
  });
}

type HighlightResult = NonNullable<ReturnType<CodeHighlighterPlugin['highlight']>>;

// Streamdown asks again whenever a code block (re)mounts; the cache keeps a
// thread switch from flashing plain text before the tokens land. Bounded so a
// long session cannot grow it without limit.
const MAX_CACHED_RESULTS = 200;
const resultCache = new Map<string, HighlightResult>();
const pendingCallbacks = new Map<string, Set<(result: HighlightResult) => void>>();

function tokenize(hl: HighlighterCore, code: string, lang: string): HighlightResult {
  // Default `defaultColor` ('light'): token.color carries the light colour and
  // htmlStyle carries `--shiki-dark`, which Streamdown's body swaps in under
  // its `dark:` variant — the same shape @streamdown/code produces.
  return hl.codeToTokens(code, {
    lang: resolveLoadedLang(hl, lang),
    themes: { light: THEMES[0], dark: THEMES[1] },
  });
}

function remember(key: string, result: HighlightResult): HighlightResult {
  resultCache.set(key, result);
  if (resultCache.size > MAX_CACHED_RESULTS) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  return result;
}

/**
 * Streamdown `plugins.code` backed by the same fine-grained shiki core as
 * `highlightCode` — instead of `@streamdown/code`, which would bundle every
 * shiki grammar and theme. Streamdown's `shikiTheme` prop is ignored: only the
 * two themes above are loaded, and they match the default it passes anyway.
 *
 * Contract (streamdown's CodeHighlighterPlugin): return the result
 * synchronously when it is available, else `null` and deliver it through the
 * callback once the highlighter has loaded.
 */
export const shikiCodePlugin: CodeHighlighterPlugin = {
  name: 'shiki',
  type: 'code-highlighter',
  getThemes: () => THEMES,
  getSupportedLanguages: () => [...LANGS],
  supportsLanguage: (language) => (LANGS as readonly string[]).includes(normalizeLang(language)),
  highlight({ code, language }, callback) {
    const lang = normalizeLang(language);
    const key = JSON.stringify([lang, code]);
    const cached = resultCache.get(key);
    if (cached) return cached;
    if (loadedHighlighter) return remember(key, tokenize(loadedHighlighter, code, lang));

    if (callback) {
      const waiting = pendingCallbacks.get(key);
      if (waiting) waiting.add(callback);
      else pendingCallbacks.set(key, new Set([callback]));
    }
    getHighlighter()
      .then((hl) => {
        const result = remember(key, tokenize(hl, code, lang));
        const waiting = pendingCallbacks.get(key);
        pendingCallbacks.delete(key);
        waiting?.forEach((cb) => cb(result));
      })
      .catch(() => {
        // Streamdown keeps showing the plain tokens it rendered as fallback.
        pendingCallbacks.delete(key);
      });
    return null;
  },
};
