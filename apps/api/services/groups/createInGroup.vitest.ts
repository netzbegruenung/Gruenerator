import { beforeEach, describe, expect, it, vi } from 'vitest';

const addGroupShare = vi.fn();
const assertCanShareToGroup = vi.fn();

vi.mock('./groupShareWriter.js', () => ({ addGroupShare }));
vi.mock('./groupMembership.js', () => ({ assertCanShareToGroup }));
vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: vi.fn() }));

const { mayShareIntoGroup, shareNewDocumentIntoGroup } = await import('./createInGroup.js');

const target = { userId: 'u1', groupId: 'g1', documentId: 'd1' };

beforeEach(() => {
  addGroupShare.mockReset();
  assertCanShareToGroup.mockReset();
});

describe('mayShareIntoGroup', () => {
  it('answers the gate as a yes or no', async () => {
    assertCanShareToGroup.mockResolvedValueOnce({});
    expect(await mayShareIntoGroup('g1', 'u1')).toBe(true);
    assertCanShareToGroup.mockRejectedValueOnce(new Error('Keine Berechtigung für diese Aktion.'));
    expect(await mayShareIntoGroup('g1', 'u1')).toBe(false);
  });
});

describe('shareNewDocumentIntoGroup', () => {
  it('shares the new document read-only and leaves it alone', async () => {
    addGroupShare.mockResolvedValueOnce({ created: true });
    const undo = vi.fn(async () => {});
    await shareNewDocumentIntoGroup(target, undo);
    expect(addGroupShare).toHaveBeenCalledWith({
      userId: 'u1',
      groupId: 'g1',
      contentType: 'documents',
      contentId: 'd1',
      permissions: { read: true, write: false },
    });
    expect(undo).not.toHaveBeenCalled();
  });

  it('removes the document again when sharing fails, and still reports the failure', async () => {
    const failure = new Error('db down');
    addGroupShare.mockRejectedValueOnce(failure);
    const undo = vi.fn(async () => {});
    await expect(shareNewDocumentIntoGroup(target, undo)).rejects.toBe(failure);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('reports the share failure even if the clean-up fails too', async () => {
    const failure = new Error('db down');
    addGroupShare.mockRejectedValueOnce(failure);
    await expect(
      shareNewDocumentIntoGroup(target, async () => {
        throw new Error('undo failed');
      })
    ).rejects.toBe(failure);
  });
});
