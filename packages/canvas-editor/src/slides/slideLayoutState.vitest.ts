import { describe, expectTypeOf, it } from 'vitest';

import type { SlideLayoutState } from './slideLayouts';
import type { ComposedSlide } from '../composer/composeTypes';

describe('SlideLayoutState', () => {
  it('stays assignable to what the editor reads', () => {
    expectTypeOf<SlideLayoutState>().toExtend<
      ComposedSlide & { lockedLayerIds: string[]; notes: string }
    >();
  });
});
