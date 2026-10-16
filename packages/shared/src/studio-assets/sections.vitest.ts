import { type StudioAssetItem } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { mergeOwnAndSaved } from './sections';

const item = (id: string) => ({ id }) as StudioAssetItem;

describe('mergeOwnAndSaved', () => {
  it('puts own items first and drops saved ones that are also own', () => {
    expect(
      mergeOwnAndSaved([item('a'), item('b')], [item('b'), item('c')]).map((i) => i.id)
    ).toEqual(['a', 'b', 'c']);
  });
});
