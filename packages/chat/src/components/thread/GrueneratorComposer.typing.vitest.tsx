/** Typing in a team chat: the composer tells the room, a send/run clears it. */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatCollaborationProvider } from '../../context/ChatCollaborationContext';

import { GrueneratorComposer } from './GrueneratorComposer';

function mount(withCollab: boolean, isRunning = false, peerRunning = false) {
  const setTyping = vi.fn();
  const adapter: ChatModelAdapter = {
    async *run() {
      yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
    },
  };
  function Harness() {
    const runtime = useLocalRuntime(adapter);
    const composer = (
      <GrueneratorComposer
        variant="pill"
        showMentions={false}
        showPlusMenu={false}
        showToolToggles={false}
        showModelPicker={false}
        isRunning={isRunning}
      />
    );
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        {withCollab ? (
          <ChatCollaborationProvider
            value={{
              provider: null,
              typingUsers: [],
              setTyping,
              broadcastNewMessage: vi.fn(),
              peerRunning,
            }}
          >
            {composer}
          </ChatCollaborationProvider>
        ) : (
          composer
        )}
      </AssistantRuntimeProvider>
    );
  }
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  );
  return { setTyping, ...view };
}

describe('GrueneratorComposer — typing indicator', () => {
  it('reports typing while there is text and stops when it is cleared', async () => {
    const user = userEvent.setup();
    const { setTyping } = mount(true);
    const input = screen.getByRole('textbox', { name: 'Nachricht an den Grünerator' });
    await user.type(input, 'ab');
    expect(setTyping).toHaveBeenLastCalledWith(true);
    await user.clear(input);
    expect(setTyping).toHaveBeenLastCalledWith(false);
  });

  it('reports the edge only: one true for a burst of keystrokes', async () => {
    const user = userEvent.setup();
    const { setTyping } = mount(true);
    const input = screen.getByRole('textbox', { name: 'Nachricht an den Grünerator' });
    await user.type(input, 'abc');
    expect(setTyping.mock.calls.filter(([v]) => v === true)).toHaveLength(1);
  });

  it('clears typing on send', async () => {
    const user = userEvent.setup();
    const { setTyping } = mount(true);
    const input = screen.getByRole('textbox', { name: 'Nachricht an den Grünerator' });
    await user.type(input, 'ab{Enter}');
    await waitFor(() => expect(setTyping).toHaveBeenLastCalledWith(false));
  });

  it('clears typing on unmount', async () => {
    const user = userEvent.setup();
    const { setTyping, unmount } = mount(true);
    const input = screen.getByRole('textbox', { name: 'Nachricht an den Grünerator' });
    await user.type(input, 'ab');
    unmount();
    expect(setTyping).toHaveBeenLastCalledWith(false);
  });

  it('shows no cancel button while a PEER turn runs, only a disabled send', () => {
    mount(true, true, true);
    expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nachricht senden' })).toBeDisabled();
  });

  it('keeps the cancel button for the sender’s own running turn', () => {
    mount(true, true, false);
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('stops reporting typing when a turn is running', () => {
    const { setTyping } = mount(true, true);
    expect(setTyping).not.toHaveBeenCalledWith(true);
  });

  it('works without a collaboration context (private chat)', async () => {
    const user = userEvent.setup();
    mount(false);
    const input = screen.getByRole('textbox', { name: 'Nachricht an den Grünerator' });
    await user.type(input, 'ab');
    expect(input).toHaveValue('ab');
  });
});
