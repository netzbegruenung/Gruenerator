import { describe, expect, it, vi } from 'vitest';

import { type StoredApprovalState } from './toolApprovalStateStore.js';

const saved = new Map<string, string>();
vi.mock('../../../utils/redis/client.js', () => ({
  default: {
    setEx: vi.fn(async (k: string, _ttl: number, v: string) => {
      saved.set(k, v);
      return 'OK';
    }),
    get: vi.fn(async (k: string) => saved.get(k) ?? null),
  },
}));

const { toolApprovalStateStore } = await import('./toolApprovalStateStore.js');

/**
 * Since image turns can reach the loop (#3841), a paused loop turn can carry
 * several MB of photos for 24 h. The bytes are kept once, in the request
 * context, and put back on read — the resumed loop needs them to mount
 * `bild_ansehen`.
 */
describe('suspended turn store — image bytes', () => {
  it('stores the image bytes once and restores them into the state', async () => {
    const image = { name: 'plakat.png', type: 'image/png', data: 'X'.repeat(1000) };
    const data = {
      approvalTurnId: 't1',
      calls: [],
      priorSteps: [],
      partialText: '',
      pausedMessageId: null,
      classifiedState: { intent: 'produktion', imageAttachments: [image] },
      requestContext: { imageAttachments: [image], processedMeta: [] },
    } as unknown as Omit<StoredApprovalState, 'createdAt'>;

    expect(await toolApprovalStateStore.store('thread-1', data)).toBe(true);
    const raw = [...saved.values()][0] ?? '';
    expect(raw.split('X'.repeat(1000)).length - 1).toBe(1);

    const back = await toolApprovalStateStore.get('thread-1');
    expect(back?.classifiedState.imageAttachments).toEqual([image]);
  });
});
