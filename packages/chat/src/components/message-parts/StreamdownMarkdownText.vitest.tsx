import { render } from '@testing-library/react';
import { defaultRemarkPlugins } from 'streamdown';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownStreamingProvider } from '../../context/MarkdownStreamingContext';
import { normalizeMathDelimiters, normalizeUnicodeMath } from '../../lib/normalizeMathDelimiters';
import { remarkCitationMarkers } from '../../lib/remarkCitationMarkers';

import { StreamdownMarkdownText } from './StreamdownMarkdownText';

/**
 * Two things this renderer must get right have no DOM footprint, so both are
 * read off a stubbed primitive:
 *
 * 1. `smooth` comes from `MarkdownStreamingContext`, not from a literal. A
 *    bare prop renders identically in general chat (context default `true`)
 *    and only breaks read-only threads, which set `false`.
 *
 * 2. Citation markers reach the primitive as RAW `[N]` text and become
 *    elements on the syntax tree. The primitive runs `preprocess` before
 *    `useSmooth`, so a marker rewritten there is walked by the reveal cursor
 *    and breaks its prefix invariant — the "text jumps at citations" report
 *    after #3483. See remarkCitationMarkers for the mechanism.
 */
type CapturedProps = {
  smooth?: unknown;
  preprocess?: (text: string) => string;
  remarkPlugins?: unknown[];
};
const captured = vi.hoisted(() => ({ props: {} as CapturedProps }));

vi.mock('@assistant-ui/react-streamdown', () => ({
  StreamdownTextPrimitive: (props: CapturedProps) => {
    captured.props = props;
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
    expect(captured.props.smooth).toBe(true);
  });

  it('honours a thread that turned the reveal off', () => {
    render(
      <MarkdownStreamingProvider smooth={false}>
        <StreamdownMarkdownText />
      </MarkdownStreamingProvider>
    );
    expect(captured.props.smooth).toBe(false);
  });
});

describe('StreamdownMarkdownText — citations stay out of preprocess', () => {
  it('leaves [N] markers alone before the reveal, so a stream stays a prefix of itself', () => {
    render(<StreamdownMarkdownText />);
    const preprocess = captured.props.preprocess;
    expect(preprocess).toBeTypeOf('function');
    const before = 'Der Beschluss nennt drei Ziele [1';
    const after = 'Der Beschluss nennt drei Ziele [1] und [2, 7] mehr.';
    expect(preprocess!(before)).toBe(before);
    expect(preprocess!(after)).toBe(after);
    // The invariant useSmooth checks, on the text it actually receives.
    expect(preprocess!(after).startsWith(preprocess!(before))).toBe(true);
  });

  it('is exactly the math normalisation and nothing else', () => {
    render(<StreamdownMarkdownText />);
    const input = 'Formel \\(a ≠ b\\) laut Quelle [1] und \\[x\\].';
    expect(captured.props.preprocess!(input)).toBe(
      normalizeUnicodeMath(normalizeMathDelimiters(input))
    );
  });

  it('builds citations on the tree, on top of Streamdown’s own remark plugins', () => {
    render(<StreamdownMarkdownText />);
    const plugins = captured.props.remarkPlugins ?? [];
    expect(plugins).toContain(remarkCitationMarkers);
    // A custom list REPLACES the defaults inside Streamdown; without gfm, tables die.
    for (const plugin of Object.values(defaultRemarkPlugins)) expect(plugins).toContain(plugin);
  });
});
