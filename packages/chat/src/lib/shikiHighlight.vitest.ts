import { describe, expect, it } from 'vitest';

import { shikiCodePlugin } from './shikiHighlight';

type Result = NonNullable<ReturnType<typeof shikiCodePlugin.highlight>>;

const themes: [string, string] = ['github-light', 'github-dark'];

/** Resolves through whichever path the plugin takes: sync result or callback. */
function highlight(code: string, language: string): Promise<Result> {
  return new Promise((resolve) => {
    const sync = shikiCodePlugin.highlight({ code, language, themes }, resolve);
    if (sync) resolve(sync);
  });
}

describe('shikiCodePlugin', () => {
  it('reports only the fine-grained grammar set, through the alias table', () => {
    expect(shikiCodePlugin.supportsLanguage('py')).toBe(true);
    expect(shikiCodePlugin.supportsLanguage('TypeScript')).toBe(true);
    expect(shikiCodePlugin.supportsLanguage('rust')).toBe(false);
    expect(shikiCodePlugin.getThemes()).toEqual(themes);
  });

  it('delivers dual-theme tokens and answers synchronously once loaded', async () => {
    const first = await highlight('x = 1', 'python');
    const line = first.tokens[0] ?? [];
    expect(line.map((t) => t.content).join('')).toBe('x = 1');
    // Streamdown's body reads the dark colour from this variable under its
    // `dark:` variant; without it dark mode would show the light palette.
    expect(line.some((t) => t.htmlStyle && '--shiki-dark' in t.htmlStyle)).toBe(true);

    // Same input: served from the cache, same object.
    expect(shikiCodePlugin.highlight({ code: 'x = 1', language: 'python', themes })).toBe(first);
    // New input after load: no callback round-trip needed.
    expect(shikiCodePlugin.highlight({ code: 'y = 2', language: 'py', themes })).not.toBeNull();
  });

  it('falls back to plain text for languages outside the set', async () => {
    const result = await highlight('fn main() {}', 'rust');
    expect(result.tokens[0]?.map((t) => t.content).join('')).toBe('fn main() {}');
  });
});
