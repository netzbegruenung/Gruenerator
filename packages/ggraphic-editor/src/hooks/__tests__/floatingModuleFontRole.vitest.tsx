// SPDX-License-Identifier: MPL-2.0
/**
 * The bar reads the font and role of a free text from the floating module. The module keeps its
 * reference while nothing derived changes, and must change when the role does.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useFloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

import type { FullCanvasConfig, LayoutResult } from '@ggraphic/editor/configs/types';

type State = Record<string, unknown>;

const config = { elements: [] } as unknown as FullCanvasConfig<State>;
const layout = {} as LayoutResult;
const HEADLINE = {
  fontFamily: 'Alpha Sans',
  bind: { fontFamily: { ref: 'font.headline', value: 'Alpha Sans' } },
};
const BODY = {
  fontFamily: 'Beta Serif',
  bind: { fontFamily: { ref: 'font.body', value: 'Beta Serif' } },
};
const stateWith = (font: object): State => ({
  additionalTexts: [{ id: 't1', text: 'Hallo', fontSize: 40, ...font }],
});

function select(initial: State) {
  return renderHook(
    ({ state }) => useFloatingModuleState({ selectedElement: 't1', config, state, layout }),
    { initialProps: { state: initial } }
  );
}

describe('the floating module of a free text follows its font role', () => {
  it('carries the family and the binding of the text', () => {
    const { result } = select(stateWith(HEADLINE));
    expect(result.current!.data.fontFamily).toBe(HEADLINE.fontFamily);
    expect(result.current!.data.bind).toEqual(HEADLINE.bind);
  });

  it('is new when the role changes, without the selection changing', () => {
    const { result, rerender } = select(stateWith(HEADLINE));
    rerender({ state: stateWith(BODY) });
    expect(result.current!.data.fontFamily).toBe(BODY.fontFamily);
    expect(result.current!.data.bind).toEqual(BODY.bind);
  });

  it('is new when only the binding changes', () => {
    const { result, rerender } = select(stateWith({ ...HEADLINE, bind: undefined }));
    rerender({ state: stateWith(HEADLINE) });
    expect(result.current!.data.bind).toEqual(HEADLINE.bind);
  });

  it('keeps its reference while nothing about the text changes', () => {
    const { result, rerender } = select(stateWith(HEADLINE));
    const first = result.current;
    rerender({ state: stateWith(HEADLINE) });
    expect(result.current).toBe(first);
  });
});
