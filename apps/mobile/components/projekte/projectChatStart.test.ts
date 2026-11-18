import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@gruenerator/chat', () => ({ useAgentStore: { getState: () => ({}) } }));

import { projectChatRoute } from './projectChatStart';

type Route = { params: Record<string, string> };

describe('projectChatRoute', () => {
  it('asks for a team chat when the switch is on in a team Projekt', () => {
    const route = projectChatRoute({ groupId: 'g1', text: 'Hallo', teamShared: true, solo: false });
    expect((route as unknown as Route).params).toMatchObject({
      threadId: 'new',
      initialMessage: 'Hallo',
      groupId: 'g1',
      teamShared: '1',
    });
  });

  it('does not ask for one when the switch is off', () => {
    const route = projectChatRoute({
      groupId: 'g1',
      text: 'Hallo',
      teamShared: false,
      solo: false,
    });
    expect((route as unknown as Route).params).not.toHaveProperty('teamShared');
  });

  it('never shares a chat of a personal Projekt', () => {
    const route = projectChatRoute({ groupId: 'g1', text: 'Hallo', teamShared: true, solo: true });
    expect((route as unknown as Route).params).not.toHaveProperty('teamShared');
  });
});
