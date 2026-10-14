/**
 * The role line over the person's own message. The role lives account-wide in the agent store,
 * so a surface that never sends it (the studio's editor chats) must be able to leave it out.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) =>
    selector({
      message: { id: 'u1', role: 'user', content: [{ type: 'text', text: 'Hallo' }], metadata: {} },
      thread: { capabilities: { edit: false } },
    }),
  useAui: () => ({ message: {} }),
  useMessageQuote: () => null,
  MessagePrimitive: {
    Root: ({ children }: { children?: unknown }) => children ?? null,
    Parts: () => null,
  },
}));
vi.mock('../assistant-ui/attachment', () => ({ UserMessageAttachments: () => null }));
vi.mock('../message-parts/MessageBranchPicker', () => ({ MessageBranchPicker: () => null }));
vi.mock('../message-parts/MessageTimestamp', () => ({
  MessageDaySeparator: () => null,
  MessageTime: () => null,
}));

const { useAgentStore } = await import('../../stores/chatStore');
const { UserMessage } = await import('./UserMessage');
const { ChatRoleBadgeContext } = await import('./chatDensityContext');

afterEach(() => {
  useAgentStore.setState({ threadMode: 'chat', customRoleName: null } as never);
});

describe('UserMessage — role line', () => {
  it('says the active chat role by default', () => {
    useAgentStore.setState({ threadMode: 'eigener', customRoleName: 'Kreisvorstand' } as never);
    render(<UserMessage />);
    expect(screen.getByText('Als Kreisvorstand')).toBeInTheDocument();
  });

  it('leaves the role out where the surface turns it off', () => {
    useAgentStore.setState({ threadMode: 'eigener', customRoleName: 'Kreisvorstand' } as never);
    render(
      <ChatRoleBadgeContext.Provider value={false}>
        <UserMessage />
      </ChatRoleBadgeContext.Provider>
    );
    expect(screen.queryByText('Als Kreisvorstand')).toBeNull();
  });
});
