import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatCollaborationProvider } from '../../context/ChatCollaborationContext';
import {
  cacheThreadShareMetaForTest,
  setThreadGroupId,
} from '../../runtime/GrueneratorThreadListAdapter';
import { useAgentStore } from '../../stores/chatStore';

import { ThreadProjectCrumb } from './ThreadProjectCrumb';

vi.mock('@gruenerator/shared/groups', () => ({
  buildGroupPath: (g: { id: string }) => `/projekte/${g.id}`,
  useUserGroups: () => ({ data: [{ id: 'g1', name: 'Wärmewende' }] }),
}));

const collaborators = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@gruenerator/collab', () => ({
  useCollaborators: () => collaborators.list,
}));

function renderCrumb() {
  return render(
    <ChatCollaborationProvider
      value={{
        provider: null,
        typingUsers: [],
        setTyping: () => {},
        broadcastNewMessage: () => {},
      }}
    >
      <ThreadProjectCrumb />
    </ChatCollaborationProvider>
  );
}

describe('ThreadProjectCrumb', () => {
  beforeEach(() => {
    collaborators.list = [];
    useAgentStore.setState({ currentThreadId: 't1', currentThreadTitle: 'Plan' });
    setThreadGroupId('t1', 'g1');
    cacheThreadShareMetaForTest('t1', { accessType: 'owner', teamShared: false });
  });

  it('shows no Team chip for a private project chat', () => {
    renderCrumb();
    expect(screen.getByText('Wärmewende')).toBeInTheDocument();
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
  });

  it('shows the Team chip and who is here for a team chat', () => {
    cacheThreadShareMetaForTest('t1', { accessType: 'owner', teamShared: true });
    collaborators.list = [{ clientId: 1 }, { clientId: 2 }];
    renderCrumb();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('2 online')).toBeInTheDocument();
  });
});
