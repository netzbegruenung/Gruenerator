import { describe, expect, it } from 'vitest';

import { dropSameContent, findNameClashes } from './uploadFiles';

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

describe('findNameClashes', () => {
  const file = (name: string) => new File(['x'], name);
  const docs = [
    { id: 'a', title: 'Haushaltsantrag.docx' },
    { id: 'b', title: 'Protokoll.pdf' },
  ];

  it('findet einen gleichen Namen, auch in anderer Schreibung', () => {
    const neu = file('haushaltsantrag.DOCX');
    const clashes = findNameClashes([neu, file('Neu.pdf')], docs);
    expect([...clashes.keys()]).toEqual([neu]);
    expect(clashes.get(neu)?.map((d) => d.id)).toEqual(['a']);
  });

  it('nennt alle Quellen, die schon so heißen', () => {
    const neu = file('Protokoll.pdf');
    const clashes = findNameClashes([neu], [...docs, { id: 'c', title: 'Protokoll.pdf' }]);
    expect(clashes.get(neu)?.map((d) => d.id)).toEqual(['b', 'c']);
  });

  it('meldet nichts ohne gleichen Namen', () => {
    expect(findNameClashes([file('Neu.pdf')], docs).size).toBe(0);
  });
});
