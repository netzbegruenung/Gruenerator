/**
 * Queueing turns typed while a run is still streaming, against the real
 * assistant-ui runtime rather than a stand-in for it.
 *
 * The load-bearing case is **two** turns queued during the same run. One alone
 * passes even on a broken driver, because after the first run the frozen
 * parent still happens to be the tail. The second one is where a driver that
 * reuses the enqueue-time parent forks the thread into a branch instead of
 * appending, which hides the turn behind the branch picker and drops it from
 * the next run's context. That is why this file exists, and why it sends
 * three.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

  return {
    adapter,
    /** Let every turn through from here on. */
    release() {
      open();
    },
  };
}

function mountRuntime(adapter: ChatModelAdapter) {
  const box: { current: AssistantRuntime | null } = { current: null };

  function Harness() {
    const runtime = useLocalRuntime(adapter, { unstable_enableMessageQueue: true });
    box.current = runtime;
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <div />
      </AssistantRuntimeProvider>
    );
  }

  render(<Harness />);
  const runtime = box.current;
  if (!runtime) throw new Error('runtime not mounted');
  return runtime;
}

async function send(runtime: AssistantRuntime, text: string) {
  await act(async () => {
    runtime.thread.composer.setText(text);
    runtime.thread.composer.send();
  });
}

function userTexts(runtime: AssistantRuntime): string[] {
  return runtime.thread
    .getState()
    .messages.filter((message) => message.role === 'user')
    .map((message) =>
      message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
    );
}

describe('message queue', () => {
  it('advertises the capability when the runtime opts in', () => {
    const runtime = mountRuntime(gatedAdapter().adapter);
    expect(runtime.thread.getState().capabilities.queue).toBe(true);
  });

  it('holds a turn sent mid-run instead of starting a second run', async () => {
    const gated = gatedAdapter();
    const runtime = mountRuntime(gated.adapter);

    await send(runtime, 'eins');
    await waitFor(() => {
      expect(runtime.thread.getState().isRunning).toBe(true);
    });

    await send(runtime, 'zwei');

    expect(runtime.thread.composer.getState().queue).toHaveLength(1);
    // Still only the first turn in the thread — the second is waiting, not sent.
    expect(userTexts(runtime)).toEqual(['eins']);
  });

  it('appends two queued turns in order instead of forking a branch', async () => {
    const gated = gatedAdapter();
    const runtime = mountRuntime(gated.adapter);

    await send(runtime, 'eins');
    await waitFor(() => {
      expect(runtime.thread.getState().isRunning).toBe(true);
    });
    await send(runtime, 'zwei');
    await send(runtime, 'drei');
    expect(runtime.thread.composer.getState().queue).toHaveLength(2);

    await act(async () => {
      gated.release();
    });

    await waitFor(() => {
      expect(runtime.thread.composer.getState().queue).toHaveLength(0);
      expect(runtime.thread.getState().isRunning).toBe(false);
    });

    // All three on one path. A driver that reuses the enqueue-time parent
    // makes "drei" a sibling of "zwei", and one of them drops out here.
    expect(userTexts(runtime)).toEqual(['eins', 'zwei', 'drei']);
  });

  it('drops the waiting turns when the run is cancelled', async () => {
    const gated = gatedAdapter();
    const runtime = mountRuntime(gated.adapter);

    await send(runtime, 'eins');
    await waitFor(() => {
      expect(runtime.thread.getState().isRunning).toBe(true);
    });
    await send(runtime, 'zwei');
    expect(runtime.thread.composer.getState().queue).toHaveLength(1);

    await act(async () => {
      runtime.thread.cancelRun();
    });

    expect(runtime.thread.composer.getState().queue).toHaveLength(0);
    expect(userTexts(runtime)).toEqual(['eins']);
  });
});
