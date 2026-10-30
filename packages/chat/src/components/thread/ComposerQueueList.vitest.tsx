/**
 * The queue list against the real assistant-ui runtime: the primitives it is
 * built on read the composer scope, so a mocked hook would test nothing.
 *
 * What is pinned is what this file decides: the label, the position in the
 * button names, that "Als Nächstes senden" reorders without touching the
 * running answer, and that it is missing on the row that already goes next.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { axe } from '../../test-utils';

import { ComposerQueueList } from './ComposerQueueList';

/** An adapter whose turns do not finish until the test lets them. */
function gatedAdapter() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let turn = 0;
  const adapter: ChatModelAdapter = {
    async *run() {
      await gate;
      turn += 1;
      yield { content: [{ type: 'text', text: `Antwort ${turn}` }] };
    },
  };
  return { adapter, release: () => open() };
}

function mount(adapter: ChatModelAdapter) {
  const box: { current: AssistantRuntime | null } = { current: null };
  function Harness() {
    const runtime = useLocalRuntime(adapter, { unstable_enableMessageQueue: true });
    box.current = runtime;
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <ComposerQueueList />
      </AssistantRuntimeProvider>
    );
  }
  const view = render(<Harness />);
  const runtime = box.current;
  if (!runtime) throw new Error('runtime not mounted');
  return { runtime, container: view.container };
}

async function send(runtime: AssistantRuntime, text: string) {
  await act(async () => {
    runtime.thread.composer.setText(text);
    runtime.thread.composer.send();
  });
}

/** Mount, start a run on "läuft", and queue `texts` behind it. */
async function queueBehindRun(texts: string[]) {
  const gated = gatedAdapter();
  const mounted = mount(gated.adapter);
  await send(mounted.runtime, 'läuft');
  await waitFor(() => {
    expect(mounted.runtime.thread.getState().isRunning).toBe(true);
  });
  for (const text of texts) await send(mounted.runtime, text);
  return { ...mounted, release: gated.release };
}

const rowTexts = () => screen.getAllByRole('listitem').map((row) => row.textContent);

describe('ComposerQueueList', () => {
  it('renders nothing while nothing is waiting', () => {
    const { container } = mount(gatedAdapter().adapter);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the waiting turns in the order they will send, with a count', async () => {
    await queueBehindRun(['Erste Frage', 'Zweite Frage']);

    expect(rowTexts()[0]).toContain('Erste Frage');
    expect(rowTexts()[1]).toContain('Zweite Frage');
    expect(screen.getByText(/2 Nachrichten warten/)).toBeVisible();
  });

  it('offers "Als Nächstes senden" on every row but the one that already goes next', async () => {
    await queueBehindRun(['Erste', 'Zweite', 'Dritte']);

    const [first, second, third] = screen.getAllByRole('listitem');
    expect(within(first!).queryByRole('button', { name: /Als Nächstes senden/ })).toBeNull();
    expect(within(second!).getByRole('button', { name: /Als Nächstes senden/ })).toBeVisible();
    expect(within(third!).getByRole('button', { name: /Als Nächstes senden/ })).toBeVisible();
  });

  it('moves the turn to the front without interrupting the running answer', async () => {
    const user = userEvent.setup();
    const { runtime, release } = await queueBehindRun(['Erste', 'Zweite', 'Dritte']);

    await user.click(screen.getByRole('button', { name: 'Als Nächstes senden: Nachricht 3' }));

    expect(rowTexts()[0]).toContain('Dritte');
    expect(runtime.thread.getState().isRunning).toBe(true);

    await act(async () => {
      release();
    });
    await waitFor(() => {
      expect(runtime.thread.composer.getState().queue).toHaveLength(0);
      expect(runtime.thread.getState().isRunning).toBe(false);
    });
    const users = runtime.thread
      .getState()
      .messages.filter((m) => m.role === 'user')
      .map((m) => m.content.map((p) => (p.type === 'text' ? p.text : '')).join(''));
    expect(users).toEqual(['läuft', 'Dritte', 'Erste', 'Zweite']);
  });

  it('removes the clicked turn, told apart by position when two say the same thing', async () => {
    const user = userEvent.setup();
    const { runtime } = await queueBehindRun(['Nochmal', 'Nochmal', 'Anders']);
    const secondId = runtime.thread.composer.getState().queue[1]!.id;

    await user.click(
      screen.getByRole('button', { name: 'Wartende Nachricht 2 entfernen: „Nochmal“' })
    );

    const ids = runtime.thread.composer.getState().queue.map((q) => q.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(secondId);
  });

  it('has no accessibility violations', async () => {
    const { container } = await queueBehindRun(['Erste', 'Zweite']);
    expect(await axe(container)).toHaveNoViolations();
  });
});
