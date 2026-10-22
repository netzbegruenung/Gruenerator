/**
 * A card a voice call creates joins the running thread, against the real
 * assistant-ui runtime: the import that brings it in happens mid-session,
 * which assistant-ui does not document. The load-bearing case is a reply that
 * is still being spoken when the card arrives — it must land after the card,
 * not vanish with the repository the import replaces.
 */
import {
  AssistantRuntimeProvider,
  createVoiceSession,
  useLocalRuntime,
  type AssistantRuntime,
  type VoiceSessionHelpers,
} from '@assistant-ui/react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type ChatApiClient } from '../context/ChatContext';

import { convertToThreadMessageLike, type LoadedMessage } from './threadMessageConversion';
import { insertSavedMessage, reloadSavedThread } from './voiceThreadSync';

const CARD: LoadedMessage = {
  id: 'card-1',
  role: 'assistant',
  content: '',
  metadata: {
    toolCalls: [
      {
        toolCallId: 'voice-sharepic-1',
        toolName: 'sharepic',
        args: { text: 'Klimaschutz' },
        result: { note: 'Sharepic erstellt' },
      },
    ],
  },
};

function serverWith(rows: LoadedMessage[]): ChatApiClient {
  return {
    get: vi.fn(async () => rows) as ChatApiClient['get'],
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function mountCall() {
  const box: { runtime: AssistantRuntime | null; helpers: VoiceSessionHelpers | null } = {
    runtime: null,
    helpers: null,
  };
  const voice = {
    connect: (options: { abortSignal?: AbortSignal }) =>
      createVoiceSession(options, async (helpers) => {
        box.helpers = helpers;
        helpers.setStatus({ type: 'running' });
        return { disconnect: vi.fn(), mute: vi.fn(), unmute: vi.fn() };
      }),
  };

  function Harness() {
    const runtime = useLocalRuntime(
      { run: async () => ({ content: [] }) },
      { adapters: { voice } }
    );
    box.runtime = runtime;
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <div />
      </AssistantRuntimeProvider>
    );
  }

  render(<Harness />);
  const runtime = box.runtime as AssistantRuntime | null;
  if (!runtime) throw new Error('runtime not mounted');
  return {
    runtime,
    thread: () => runtime.thread,
    say: async (role: 'user' | 'assistant', text: string, isFinal = true) => {
      await act(async () => {
        box.helpers?.emitTranscript({ role, text, isFinal });
        await Promise.resolve();
      });
    },
    connect: async () => {
      await act(async () => {
        runtime.thread.connectVoice();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

function shape(runtime: AssistantRuntime) {
  return runtime.thread.getState().messages.map((message) => ({
    role: message.role,
    text: message.content.map((part) => (part.type === 'text' ? part.text : '')).join(''),
    tools: message.content.flatMap((part) => (part.type === 'tool-call' ? [part.toolName] : [])),
  }));
}

describe('insertSavedMessage during a voice call', () => {
  it('puts the card after what was said, and the reply still being spoken after it', async () => {
    const call = mountCall();
    await call.connect();
    await call.say('user', 'Mach ein Sharepic zu Klimaschutz');
    await call.say('assistant', 'Hier ist', false);

    await act(async () => {
      await insertSavedMessage(call.thread, serverWith([CARD]), '/messages', 'card-1', (rows) =>
        convertToThreadMessageLike(rows)
      );
    });
    await call.say('assistant', 'Hier ist dein Sharepic.');

    expect(shape(call.runtime)).toEqual([
      { role: 'user', text: 'Mach ein Sharepic zu Klimaschutz', tools: [] },
      { role: 'assistant', text: '', tools: ['sharepic'] },
      { role: 'assistant', text: 'Hier ist dein Sharepic.', tools: [] },
    ]);
  });

  it('brings a card in only once', async () => {
    const call = mountCall();
    await call.connect();
    await call.say('user', 'Mach ein Sharepic');
    const insert = () =>
      insertSavedMessage(call.thread, serverWith([CARD]), '/messages', 'card-1', (rows) =>
        convertToThreadMessageLike(rows)
      );

    await act(async () => {
      await insert();
      await insert();
    });

    expect(shape(call.runtime).filter((m) => m.tools.includes('sharepic'))).toHaveLength(1);
  });

  it('leaves the thread alone when the server does not list the message', async () => {
    const call = mountCall();
    await call.connect();
    await call.say('user', 'Mach ein Sharepic');

    await act(async () => {
      await insertSavedMessage(call.thread, serverWith([]), '/messages', 'card-1', (rows) =>
        convertToThreadMessageLike(rows)
      );
    });

    expect(shape(call.runtime)).toEqual([{ role: 'user', text: 'Mach ein Sharepic', tools: [] }]);
  });
});

describe('reloadSavedThread', () => {
  it('replaces the thread with what the server saved', async () => {
    const call = mountCall();
    await call.connect();
    await call.say('user', 'Mach ein Sharepic');
    const saved: LoadedMessage[] = [
      { id: 'u-1', role: 'user', content: 'Mach ein Sharepic' },
      CARD,
      { id: 'a-1', role: 'assistant', content: 'Hier ist dein Sharepic.' },
    ];

    await act(async () => {
      await reloadSavedThread(call.thread, serverWith(saved), '/messages', (rows) =>
        convertToThreadMessageLike(rows)
      );
    });

    expect(call.runtime.thread.getState().messages.map((m) => m.id)).toEqual([
      'u-1',
      'card-1',
      'a-1',
    ]);
  });
});
