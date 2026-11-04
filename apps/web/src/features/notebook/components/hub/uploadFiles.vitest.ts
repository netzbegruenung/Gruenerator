import { describe, expect, it } from 'vitest';

import { dropSameContent } from './uploadFiles';

const file = (name: string, content: string) => new File([content], name);

describe('dropSameContent', () => {
  it('keeps the first of two identical files even under different names', async () => {
    const a = file('beschluss.pdf', 'same bytes');
    const b = file('beschluss (1).pdf', 'same bytes');
    const c = file('other.pdf', 'other bytes!');
    expect(await dropSameContent([a, b, c])).toEqual([a, c]);
  });

  it('keeps files of equal size with different content', async () => {
    const a = file('a.txt', 'aaaa');
    const b = file('b.txt', 'bbbb');
    expect(await dropSameContent([a, b])).toEqual([a, b]);
  });
});
