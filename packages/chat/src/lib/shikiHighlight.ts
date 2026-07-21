import type { HighlighterCore } from 'shiki/core';

// Fine-grained Shiki: createHighlighterCore + the JS regex engine + only the
// languages/themes we actually use. This emits chunks ONLY for these grammars
// (not all ~200) and avoids the oniguruma WASM — keeping the lazy chunk small.
const LANGS = ['python', 'javascript', 'typescript', 'tsx', 'jsx', 'bash', 'json'] as const;

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

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
      ]);
      return createHighlighterCore({
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
    })();
  }
  return highlighterPromise;
}

/**
 * Highlight `code` to an HTML string with dual light/dark themes. `defaultColor:
 * false` emits CSS variables (--shiki-light / --shiki-dark) instead of inline
 * colors, so the `.dark` class can swap them (see chat.css). Unknown languages
 * fall back to plain text.
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter();
  const language = hl.getLoadedLanguages().includes(lang) ? lang : 'text';
  return hl.codeToHtml(code, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}

// `LANGS` documents the supported set; referenced to keep it from being flagged unused.
export const SUPPORTED_LANGS: readonly string[] = LANGS;
