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

async function run(text: string, bericht: unknown[]) {
  getLast.mockResolvedValue(prior(bericht));
  const classifiedState = { intent: 'direct', lastTurnEditables: ['sharepic'] } as never;
  const out = await runEarlyHandlerStage({
    sse: { send: vi.fn() } as never,
    req: {} as never,
    classifiedState,
    initialState: { lastTurnEditables: ['sharepic'] } as never,
    cleanupPending: vi.fn() as never,
    actualThreadId: 't1',
    userId: 'u1',
    lastUserMessage: { role: 'user', content: text } as never,
    lastUserTextNoMentions: text,
    imageAttachments: [],
    universalEditForced: false,
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
      'Setz den Termin ein: Do., 20.11., 18 Uhr, Kreisbüro'
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
});
