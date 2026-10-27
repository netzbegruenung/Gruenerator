// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { lockToAxis } from '@ggraphic/editor/utils/axisLock';

describe('lockToAxis', () => {
  const origin = { x: 100, y: 100 };

  it('hält y fest, wenn der Zeiger weiter waagrecht gewandert ist', () => {
    expect(lockToAxis({ x: 70, y: 46 }, { x: 40, y: 34 }, { x: 130, y: 112 }, origin)).toEqual({
      pos: { x: 70, y: 34 },
      axis: 'x',
    });
  });

  it('hält x fest, wenn der Zeiger weiter senkrecht gewandert ist', () => {
    expect(lockToAxis({ x: 70, y: 46 }, { x: 75, y: 52 }, { x: 95, y: 40 }, origin)).toEqual({
      pos: { x: 75, y: 46 },
      axis: 'y',
    });
  });
});
