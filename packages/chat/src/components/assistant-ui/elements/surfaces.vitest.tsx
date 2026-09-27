/**
 * Regression: SwapLabel must survive a re-render under the React Compiler.
 *
 * The production build compiles this package with babel-plugin-react-compiler
 * (this lane applies the same preset, see vitest.config.ts). When the two
 * useRef calls lived inside the `layers` array literal, the compiler memoized
 * them into its memo cache: they ran on mount only, every re-render skipped
 * them, the hook order shifted, and React threw error #311 in every thread
 * with a tool card (GlitchTip issue 586). The `rerender` with a flipped
 * `active` below is exactly that trigger.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SwapLabel } from './surfaces';

describe('SwapLabel', () => {
  it('re-renders with a flipped active layer without crashing', () => {
    const { rerender, getByText } = render(
      <SwapLabel active={0}>
        <span>running</span>
        <span>done</span>
      </SwapLabel>
    );

    expect(getByText('running').parentElement).toHaveAttribute('aria-hidden', 'false');

    rerender(
      <SwapLabel active={1}>
        <span>running</span>
        <span>done</span>
      </SwapLabel>
    );

    expect(getByText('done').parentElement).toHaveAttribute('aria-hidden', 'false');
    expect(getByText('running').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});
