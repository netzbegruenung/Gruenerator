import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@gruenerator/chat', () => ({ useAgentStore: { getState: () => ({}) } }));

import { projectChatRoute } from './projectChatStart';

type Route = { params: Record<string, string> };

describe('projectChatRoute', () => {
  it('shares the chat in the Projekt when the switch is on', () => {
    const route = projectChatRoute({ groupId: 'g1', text: 'Hallo', teamShared: true });
    expect((route as unknown as Route).params).toMatchObject({
      threadId: 'new',
      initialMessage: 'Hallo',
      groupId: 'g1',
      teamShared: '1',
    });
  });

  it('keeps it private, but still in the Projekt, when the switch is off', () => {
    const route = projectChatRoute({ groupId: 'g1', text: 'Hallo', teamShared: false });
    expect((route as unknown as Route).params).toMatchObject({ groupId: 'g1' });
    expect((route as unknown as Route).params).not.toHaveProperty('teamShared');
  });
});
