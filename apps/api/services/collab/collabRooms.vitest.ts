/**
 * Room naming must match `checkRoomAccess` in services/hocuspocus/src/auth.ts,
 * otherwise a close request names a room nobody is in and revokes nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { closeCollabRooms, query } = vi.hoisted(() => ({
  closeCollabRooms: vi.fn(),
  query: vi.fn(),
}));

vi.mock('./hocuspocusInternal.js', () => ({ closeCollabRooms }));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { closeGroupCollabRooms, closeShareRoom, collabRoomForShare } =
  await import('./collabRooms.js');

beforeEach(() => {
  closeCollabRooms.mockReset().mockResolvedValue(undefined);
  query.mockReset();
});

describe('collabRoomForShare', () => {
  it.each([
    ['collaborative_documents', 'doc-1', 'doc-1'],
    ['canvas_template', 'canvas-1', 'canvas-1'],
    ['chat_threads', 't-1', 'chat-t-1'],
    ['user_agents', 'a-1', null],
    ['notebook_collections', 'n-1', null],
  ])('%s %s → %s', (type, id, room) => {
    expect(collabRoomForShare(type, id)).toBe(room);
  });
});

describe('closeShareRoom', () => {
  it('closes the room of a shared document or chat thread', async () => {
    await closeShareRoom('collaborative_documents', 'doc-1');
    await closeShareRoom('chat_threads', 't-1');
    expect(closeCollabRooms.mock.calls).toEqual([[['doc-1']], [['chat-t-1']]]);
  });

  it('does nothing for content without a live room', async () => {
    await closeShareRoom('user_agents', 'a-1');
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });
});

describe('closeGroupCollabRooms', () => {
  it("closes every shared room plus the project's presence room", async () => {
    query.mockResolvedValue([
      { content_type: 'collaborative_documents', content_id: 'doc-1' },
      { content_type: 'canvas_template', content_id: 'canvas-1' },
      { content_type: 'chat_threads', content_id: 't-1' },
    ]);

    await closeGroupCollabRooms('g-1', 'user-1');

    expect(query.mock.calls[0]?.[1]).toEqual(['g-1']);
    expect(closeCollabRooms).toHaveBeenCalledWith(
      ['doc-1', 'canvas-1', 'chat-t-1', 'group-presence-g-1'],
      'user-1'
    );
  });

  it('closes for everyone when no user is given', async () => {
    query.mockResolvedValue([]);
    await closeGroupCollabRooms('g-1', null);
    expect(closeCollabRooms).toHaveBeenCalledWith(['group-presence-g-1'], null);
  });

  it('resolves when the share lookup fails', async () => {
    query.mockRejectedValue(new Error('db down'));
    await expect(closeGroupCollabRooms('g-1', null)).resolves.toBeUndefined();
  });
});
