import { beforeEach, describe, expect, it, vi } from 'vitest';

const shareContent = vi.fn();
vi.mock('../api/index.js', () => ({
  getContractsClient: () => ({ groups: { shareContent } }),
}));

const { addItemsToGroup, addableKey } = await import('./addContent.js');

describe('addItemsToGroup', () => {
  beforeEach(() => shareContent.mockReset());

  it('teilt jeden Inhalt nur lesend, mit derselben gekürzten Notiz', async () => {
    shareContent.mockResolvedValue({ status: 200, body: { success: true } });
    const result = await addItemsToGroup(
      'g1',
      [
        { contentType: 'user_agents', id: 'a1', title: 'Presse' },
        { contentType: 'user_text_forms', id: 'r1', title: 'Antrag' },
      ],
      '  Für die Sitzung  '
    );
    expect(result).toEqual({ added: 2, failed: 0, firstError: null });
    expect(shareContent).toHaveBeenCalledWith({
      params: { groupId: 'g1' },
      body: {
        contentType: 'user_agents',
        contentId: 'a1',
        note: 'Für die Sitzung',
        permissions: { read: true, write: false, collaborative: false },
      },
    });
  });

  it('meldet Teilerfolge mit dem Satz des Servers', async () => {
    shareContent
      .mockResolvedValueOnce({ status: 200, body: { success: true } })
      .mockResolvedValueOnce({
        status: 403,
        body: { success: false, message: 'Du kannst nur eigene Inhalte teilen.' },
      });
    const result = await addItemsToGroup(
      'g1',
      [
        { contentType: 'notebook_collections', id: 'n1', title: 'A' },
        { contentType: 'collaborative_documents', id: 'd1', title: 'B' },
      ],
      ''
    );
    expect(result).toEqual({
      added: 1,
      failed: 1,
      firstError: 'Du kannst nur eigene Inhalte teilen.',
    });
    expect(shareContent.mock.calls[0]?.[0].body.note).toBeNull();
  });

  it('nutzt den Schlüssel des Feeds', () => {
    expect(addableKey({ contentType: 'user_agents', id: 'a1' })).toBe('user_agents:a1');
  });
});
