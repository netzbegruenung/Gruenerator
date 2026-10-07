import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic } from './draftAgent.js';
import { chapterText } from './styleguide.js';

type Validate = (input: unknown) => { ok: boolean; error?: string; value?: unknown };

const current: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'mint' },
      position: 'mitte',
      align: 'links',
      logo: true,
      items: [
        {
          type: 'zitat',
          text: 'Klimaschutz ist Gerechtigkeit',
          name: 'Anna Beispiel',
          funktion: 'Landtagsabgeordnete',
        },
      ],
    },
  ],
};
const withoutFunction = {
  slides: [
    {
      ...current.slides[0],
      items: [{ type: 'zitat', text: 'Klimaschutz ist Gerechtigkeit', name: 'Anna Beispiel' }],
    },
  ],
};
const needs = {
  land: 'de-DE',
  anlass: ['zitat'],
  kapitel: ['liste-zahl'],
  fotos_suchen: [],
  form: 'zitat',
  alternativen: [],
};

let validate: Validate = () => ({ ok: false });
let system = '';

beforeEach(() => {
  aiObject.mockReset();
  aiObject
    .mockResolvedValueOnce({ ok: true, data: needs })
    .mockImplementationOnce((call: { validate: Validate; system: string }) => {
      validate = call.validate;
      system = call.system;
      return Promise.resolve({
        ok: true,
        data: { spec: { ...current }, scene: null },
      });
    });
});

describe('draftSharepic — a revision', () => {
  it('leaves the needs step’s chapters and examples out (#4252)', async () => {
    const result = await draftSharepic('Mach die Headline kürzer', 'de-DE', current);
    expect(system).not.toContain(chapterText('liste-zahl'));
    expect(result.chapters).toEqual([]);
  });

  it('rejects a draft that drops a field the request does not name, then restores it', async () => {
    await draftSharepic('Mach die Headline kürzer und knackiger', 'de-DE', current);
    const first = validate(withoutFunction);
    expect(first.ok).toBe(false);
    expect(first.error).toContain('funktion „Landtagsabgeordnete“');
    expect(validate(withoutFunction).ok).toBe(false);
    const last = validate(withoutFunction) as {
      ok: true;
      value: { spec: SharepicSpec; kept: string | null };
    };
    expect(last.ok).toBe(true);
    expect(last.value.spec.slides[0]!.items[0]).toMatchObject({ funktion: 'Landtagsabgeordnete' });
    expect(last.value.kept).toContain('Landtagsabgeordnete');
  });

  it('lets a field go when the request names it', async () => {
    await draftSharepic('Entferne die Funktion unter dem Namen', 'de-DE', current);
    expect(validate(withoutFunction).ok).toBe(true);
  });
});
