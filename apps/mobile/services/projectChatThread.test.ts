import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPost = jest.fn<(url: string, body: unknown) => Promise<{ id: string }>>();
const mockMint = jest.fn();
const mockMarkTeam = jest.fn();
const mockSetGroup = jest.fn();

jest.mock('./chatConfig', () => ({ getMobileChatApiClient: () => ({ post: mockPost }) }));
jest.mock('@gruenerator/chat', () => ({
  getDefaultAgent: () => 'gruenerator-universal',
  markThreadTeamShared: (id: string) => mockMarkTeam(id),
  setThreadGroupId: (id: string, groupId: string) => mockSetGroup(id, groupId),
  requestThreadListReload: jest.fn(),
  useAgentStore: {
    getState: () => ({
      selectedAgentId: null,
      threadMode: 'chat',
      mintThreadFromDraft: mockMint,
    }),
  },
}));

import { createProjectChatThread } from './projectChatThread';

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ id: 't1' });
});

describe('createProjectChatThread', () => {
  it('files a team chat in the Projekt and sends teamShared', async () => {
    await createProjectChatThread({ groupId: 'g1', teamShared: true });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/chat-service/threads',
      expect.objectContaining({ groupId: 'g1', teamShared: true })
    );
    expect(mockMarkTeam).toHaveBeenCalledWith('t1');
    expect(mockMint).toHaveBeenCalledWith('t1');
  });

  it('leaves teamShared out when the switch is off', async () => {
    await createProjectChatThread({ groupId: 'g1', teamShared: false });

    const body = mockPost.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.groupId).toBe('g1');
    expect(body).not.toHaveProperty('teamShared');
    expect(mockMarkTeam).not.toHaveBeenCalled();
  });
});
