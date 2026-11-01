/**
 * Shell-style recall of earlier messages (assistant-ui's input history),
 * against the real runtime: the history is read from the thread's user
 * messages, so only a real send can fill it.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrueneratorComposer } from './GrueneratorComposer';

function mount() {
  const run = vi.fn<ChatModelAdapter['run']>(async function* () {
    yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
  });
  const adapter: ChatModelAdapter = { run };

  function Harness() {
    const runtime = useLocalRuntime(adapter);
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <GrueneratorComposer
          variant="pill"
          showMentions={false}
          showPlusMenu={false}
          showToolToggles={false}
          showModelPicker={false}
        />
      </AssistantRuntimeProvider>
    );
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  );
  return { run };
}

async function sendTwo(
  user: ReturnType<typeof userEvent.setup>,
  run: ReturnType<typeof mount>['run']
) {
  const input = screen.getByRole('textbox');
  await user.type(input, 'Erste Frage{Enter}');
  await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  await user.type(input, 'Zweite Frage{Enter}');
  await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(input).toHaveValue(''));
  return input;
}

describe('GrueneratorComposer — input history', () => {
  it('steps through sent messages and back to the empty draft', async () => {
    const user = userEvent.setup();
    const { run } = mount();
    const input = await sendTwo(user, run);

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('Zweite Frage');
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('Erste Frage');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('Zweite Frage');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('');
  });

  it('leaves a typed draft alone', async () => {
    const user = userEvent.setup();
    const { run } = mount();
    const input = await sendTwo(user, run);

    await user.type(input, 'Entwurf');
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('Entwurf');
  });
});
