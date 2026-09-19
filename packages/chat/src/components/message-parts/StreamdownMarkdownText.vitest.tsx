import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownStreamingProvider } from '../../context/MarkdownStreamingContext';

import { StreamdownMarkdownText } from './StreamdownMarkdownText';

/**
 * `smooth` must come from `MarkdownStreamingContext`, not from a literal.
 *
 * The regression this guards is invisible in the DOM: a bare `smooth` prop
 * renders identically in general chat, where the context default is `true`
 * anyway. It only breaks notebook and read-only threads, which set
 * `smooth={false}` (NotebookChatProvider, ReadonlyThreadProvider) to stop the
 * reveal recomputing line wrap and citation-badge placement every frame. Those
 * surfaces render through THIS component since `DEFAULT_STREAMDOWN` became
 * true, so nothing else catches a hardcoded value.
 *
 * The prop is read off a stubbed primitive because it has no DOM footprint —
 * asserting on rendered output cannot tell the two values apart.
 */
const captured = vi.hoisted(() => ({ smooth: undefined as unknown }));

vi.mock('@assistant-ui/react-streamdown', () => ({
  StreamdownTextPrimitive: (props: { smooth?: unknown }) => {
    captured.smooth = props.smooth;
    return null;
  },
}));

// Neither loader is under test here, and both are slow to pull in under jsdom.
vi.mock('../../lib/shikiHighlight', () => ({
  shikiCodePlugin: {},
  normalizeLang: (lang?: string) => lang ?? '',
  highlightCode: async (code: string) => code,
}));
vi.mock('../../lib/katexCss', () => ({ maybeLoadKatexCss: () => {} }));

describe('StreamdownMarkdownText — the smooth opt-out', () => {
  it('reveals smoothly where the context leaves its default', () => {
    render(<StreamdownMarkdownText />);
    expect(captured.smooth).toBe(true);
  });

  it('honours a thread that turned the reveal off', () => {
    render(
      <MarkdownStreamingProvider smooth={false}>
        <StreamdownMarkdownText />
      </MarkdownStreamingProvider>
    );
    expect(captured.smooth).toBe(false);
  });
});
