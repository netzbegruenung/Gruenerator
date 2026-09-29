import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PendingAction } from '../../agents/langgraph/ChatGraph/types.js';

const repo = vi.hoisted(() => ({
  shareTextFormWithGroup: vi.fn(),
}));
vi.mock('../../services/user/textFormRepository.js', () => repo);
vi.mock('./services/pendingActionStore.js', () => ({ pendingActionStore: {} }));
vi.mock('./services/threadPersistenceService.js', () => ({}));

const { executeAction } = await import('./confirmController.js');

const action: PendingAction = {
  actionId: 'a1',
  threadId: 't1',
  userId: 'u1',
  title: 'Rezept teilen',
  preview: '',
  createdAt: 0,
  type: 'share_text_form',
  payload: { mention: 'einladung', title: 'Einladung', groupId: 'g1', groupName: 'OV Mitte' },
};

// Die Hochstufung von `private` auf `groups` sitzt in `shareTextFormWithGroup`
// (#3803) — hier bleibt nur, wie die Aktion dessen Ergebnis deutet.
describe('share_text_form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shares through the repository and links the project', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue([{ groupId: 'g1' }]);

    const result = await executeAction(action);

    expect(repo.shareTextFormWithGroup).toHaveBeenCalledWith('u1', 'einladung', 'g1');
    expect(result.url).toBe('/gruppen/g1');
  });

  it('refuses a recipe that is missing or not shareable', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue(null);

    await expect(executeAction(action)).rejects.toThrow('Rezept nicht gefunden');
  });

  it('refuses when the caller is not a member of the project', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue([]);

    await expect(executeAction(action)).rejects.toThrow('nicht Mitglied');
  });
});
