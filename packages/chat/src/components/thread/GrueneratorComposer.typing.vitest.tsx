/** Typing in a team chat: the composer tells the room, a send/run clears it. */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatCollaborationProvider } from '../../context/ChatCollaborationContext';

import { GrueneratorComposer } from './GrueneratorComposer';

function mount(withCollab: boolean, isRunning = false) {
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

  it('stops reporting typing when a turn is running', () => {
    const { setTyping } = mount(true, true);
    expect(setTyping).toHaveBeenCalledWith(false);
  });

  it('works without a collaboration context (private chat)', async () => {
    const user = userEvent.setup();
    mount(false);
    const input = screen.getByRole('textbox', { name: 'Nachricht an den Grünerator' });
    await user.type(input, 'ab');
    expect(input).toHaveValue('ab');
  });
});
