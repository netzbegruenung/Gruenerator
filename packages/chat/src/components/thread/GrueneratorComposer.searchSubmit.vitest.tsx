/**
 * The composer as a search field (notebook „Manuell“), against the real
 * assistant-ui runtime. The claim under test is a negative one — the model is
 * never asked — and only the real Root/Input pair can show it: Enter goes
 * through `form.requestSubmit()`, and the Root's own send runs after our
 * handler unless that handler prevents it.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrueneratorComposer } from './GrueneratorComposer';

function mount(onSearchSubmit?: (text: string) => void, onChatSubmit?: (text: string) => void) {
  const run = vi.fn<ChatModelAdapter['run']>(async function* () {
    yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
  });
  const adapter: ChatModelAdapter = { run };
  const box: { current: AssistantRuntime | null } = { current: null };

  function Harness() {
    const runtime = useLocalRuntime(adapter);
    box.current = runtime;
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <GrueneratorComposer
          variant="pill"
          showMentions={false}
          showPlusMenu={false}
          showToolToggles={false}
          showModelPicker={false}
          {...(onSearchSubmit ? { onSearchSubmit } : {})}
          {...(onChatSubmit ? { onChatSubmit } : {})}
        />
      </AssistantRuntimeProvider>
    );
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  );
  if (!box.current) throw new Error('runtime not mounted');
  return { runtime: box.current, run };
}

describe('GrueneratorComposer — search submit', () => {
  it('hands Enter to the search and never starts a run', async () => {
    const user = userEvent.setup();
    const onSearchSubmit = vi.fn();
    const { runtime, run } = mount(onSearchSubmit);

    await user.type(screen.getByRole('textbox'), 'Radverkehr{Enter}');

    expect(onSearchSubmit).toHaveBeenCalledWith('Radverkehr');
    expect(run).not.toHaveBeenCalled();
    expect(runtime.thread.getState().messages).toHaveLength(0);
  });

  it('shows a magnifier that searches on click', async () => {
    const user = userEvent.setup();
    const onSearchSubmit = vi.fn();
    const { run } = mount(onSearchSubmit);

    await user.type(screen.getByRole('textbox'), 'Mieten');
    expect(screen.queryByRole('button', { name: 'Nachricht senden' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suchen' }));

    expect(onSearchSubmit).toHaveBeenCalledWith('Mieten');
    expect(run).not.toHaveBeenCalled();
  });

  it('still sends to the model without a search handler', async () => {
    const user = userEvent.setup();
    const { run } = mount();

    await user.type(screen.getByRole('textbox'), 'Hallo{Enter}');

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Suchen' })).not.toBeInTheDocument();
  });

  it('hands a chat elsewhere behind the send arrow, without a run here', async () => {
    const user = userEvent.setup();
    const onChatSubmit = vi.fn();
    const { runtime, run } = mount(undefined, onChatSubmit);

    await user.type(screen.getByRole('textbox'), 'Was fordern die Grünen?{Enter}');
    expect(onChatSubmit).toHaveBeenCalledWith('Was fordern die Grünen?');

    await user.click(screen.getByRole('button', { name: 'Nachricht senden' }));
    expect(onChatSubmit).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();
    expect(runtime.thread.getState().messages).toHaveLength(0);
  });
});
