import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PendingAction } from '../../agents/langgraph/ChatGraph/types.js';

const repo = vi.hoisted(() => ({
  getTextFormSharing: vi.fn(),
  updateTextFormSharing: vi.fn(),
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

describe('share_text_form (#3682 review)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getTextFormSharing.mockResolvedValue({ share_mode: 'private' });
    repo.updateTextFormSharing.mockResolvedValue({ ok: true, updated: true });
  });

  it('promotes a private recipe to groups BEFORE sharing it', async () => {
    const order: string[] = [];
    repo.updateTextFormSharing.mockImplementation(() => {
      order.push('promote');
      return Promise.resolve({ ok: true, updated: true });
    });
    repo.shareTextFormWithGroup.mockImplementation(() => {
      order.push('share');
      return Promise.resolve([{ groupId: 'g1' }]);
    });

    const result = await executeAction(action);

    expect(order).toEqual(['promote', 'share']);
    expect(result.url).toBe('/gruppen/g1');
  });

  it('shares nothing when the promotion fails', async () => {
    repo.updateTextFormSharing.mockResolvedValue({ ok: true, updated: false });

    await expect(executeAction(action)).rejects.toThrow('Rezept nicht gefunden.');
    expect(repo.shareTextFormWithGroup).not.toHaveBeenCalled();
  });

  it('turns a promoted recipe private again when the share is refused', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue([]);

    await expect(executeAction(action)).rejects.toThrow('nicht Mitglied');
    expect(repo.updateTextFormSharing).toHaveBeenLastCalledWith('u1', 'einladung', {
      share_mode: 'private',
    });
  });

  it('leaves a non-private share mode alone', async () => {
    repo.getTextFormSharing.mockResolvedValue({ share_mode: 'authenticated' });
    repo.shareTextFormWithGroup.mockResolvedValue([]);

    await expect(executeAction(action)).rejects.toThrow('nicht Mitglied');
    expect(repo.updateTextFormSharing).not.toHaveBeenCalled();
  });
});
