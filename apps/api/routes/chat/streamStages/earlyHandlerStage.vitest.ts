import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLast = vi.hoisted(() => vi.fn());
vi.mock('../services/sharepicVariantHelpers.js', async (orig) => ({
  ...(await orig<typeof import('../services/sharepicVariantHelpers.js')>()),
  getLastSharepicVariant: getLast,
}));
vi.mock('../services/sharepicEditService.js', async (orig) => ({
  ...(await orig<typeof import('../services/sharepicEditService.js')>()),
  threadHasSharepic: vi.fn(async () => true),
}));

import { runEarlyHandlerStage } from './earlyHandlerStage.js';

const spec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
      logo: false,
    },
  ],
};
const prior = (bericht: unknown[]) => ({
  canvasType: 'creator',
  props: { creatorSpec: spec, attributions: [null], bericht },
});

async function run(
  text: string,
  bericht: unknown[],
  editables: string[] = ['sharepic'],
  extra: {
    images?: unknown[];
    universalEditForced?: boolean;
    intent?: string;
    secondaryIntent?: string;
  } = {}
) {
  getLast.mockResolvedValue(prior(bericht));
  const classifiedState = {
    intent: extra.intent ?? 'direct',
    lastTurnEditables: editables,
  } as never;
  const out = await runEarlyHandlerStage({
    sse: { send: vi.fn() } as never,
    req: {} as never,
    classifiedState,
    initialState: { lastTurnEditables: editables } as never,
    cleanupPending: vi.fn() as never,
    actualThreadId: 't1',
    userId: 'u1',
    lastUserMessage: { role: 'user', content: text } as never,
    lastUserTextNoMentions: text,
    imageAttachments: (extra.images ?? []) as never,
    universalEditForced: extra.universalEditForced ?? false,
    rawCurrentSharepic: null,
    rawCurrentSocialPost: null,
  });
  return { out, classifiedState } as { out: any; classifiedState: any };
}

describe('early handler: sharepic gap filled by the next turn', () => {
  beforeEach(() => getLast.mockReset());

  it('a date turn after a missing termin becomes a refinement', async () => {
    const { out, classifiedState } = await run('Do., 20.11., 18 Uhr, Kreisbüro', [
      { art: 'fehlt', fakt: 'termin' },
    ]);
    expect(out.sharepicRefinement?.instruction).toBe(
      'Setz den Termin ein – Wochentag, Datum und Uhrzeit in "datum", einen genannten Ort in "ort": Do., 20.11., 18 Uhr, Kreisbüro'
    );
    expect(out.forcedTool).toBe(true);
    expect(classifiedState.intent).toBe('sharepic');
  });

  it('the same turn without a fehlt entry is left alone', async () => {
    const { out } = await run('Do., 20.11., 18 Uhr, Kreisbüro', []);
    expect(out.sharepicRefinement).toBeUndefined();
  });

  it('"klingt gut" with a fehlt entry is left alone', async () => {
    const { out } = await run('klingt gut', [{ art: 'fehlt', fakt: 'termin' }]);
    expect(out.sharepicRefinement).toBeUndefined();
  });

  const fehlt = [{ art: 'fehlt', fakt: 'termin' }];
  it.each(['Was ist am 20.11. im Bundestag?', 'Schreib mir einen Post für Do.'])(
    '"%s" is not an answer to the gap',
    async (text) => {
      const { out } = await run(text, fehlt);
      expect(out.sharepicRefinement).toBeUndefined();
    }
  );

  it('without an open card or a sharepic in the previous turn it is not addressed', async () => {
    const { out } = await run('Do., 20.11., 18 Uhr, Kreisbüro', fehlt, []);
    expect(out.sharepicRefinement).toBeUndefined();
  });

  it('reads nothing when the turn names no day', async () => {
    await run('klingt gut', fehlt);
    expect(getLast).not.toHaveBeenCalled();
  });
});

describe('early handler: photo swap by attachment', () => {
  beforeEach(() => getLast.mockReset());
  const img = { type: 'image', url: 'data:image/png;base64,AAAA' };

  it.each([
    ['Nimm dieses Foto fürs Sharepic', 'direct'],
    ['Tausch das Bild gegen das hier', 'image_edit'],
  ])('"%s" revises the sharepic with the photo', async (text, intent) => {
    const { out, classifiedState } = await run(text, [], ['sharepic'], {
      images: [img],
      intent,
      secondaryIntent: 'image_edit',
    });
    expect(out.sharepicRefinement?.instruction).toBe(text);
    expect(out.forcedTool).toBe(true);
    expect(classifiedState.secondaryIntent ?? null).toBeNull();
    expect(classifiedState.intent).toBe('sharepic');
  });

  it('a plain image edit stays image_edit', async () => {
    const { out, classifiedState } = await run('Mach das Bild heller', [], ['sharepic'], {
      images: [img],
      intent: 'image_edit',
    });
    expect(out.sharepicRefinement).toBeUndefined();
    expect(classifiedState.intent).toBe('image_edit');
  });

  it('@bildbearbeiten keeps image_edit', async () => {
    const { out } = await run('Nimm dieses Foto fürs Sharepic', [], ['sharepic'], {
      images: [img],
      universalEditForced: true,
      intent: 'image_edit',
    });
    expect(out.sharepicRefinement).toBeUndefined();
  });

  it('without a sharepic in the thread nothing changes', async () => {
    const { out } = await run('Nimm dieses Foto fürs Sharepic', [], [], { images: [img] });
    expect(out.sharepicRefinement).toBeUndefined();
  });
});
