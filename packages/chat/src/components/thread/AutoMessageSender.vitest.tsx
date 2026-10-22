import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildNotebookSourceAttachment } from '../../lib/documentMentionables';
import { hasPendingHandoff, useAgentStore } from '../../stores/chatStore';

import { AutoMessageSender } from './AutoMessageSender';

const calls: string[] = [];
const composer = {
  setText: vi.fn((text: string) => calls.push(`setText:${text}`)),
  addAttachment: vi.fn(async (a: { id: string }) => {
    await Promise.resolve();
    calls.push(`addAttachment:${a.id}`);
  }),
  send: vi.fn(() => calls.push('send')),
};
const threads = { switchToNewThread: vi.fn(async () => {}) };

vi.mock('@assistant-ui/react', () => ({
  useAui: () => ({ composer, threads }),
}));

const chip = buildNotebookSourceAttachment(
  { collectionId: 'hamburg-system', sourceUrl: 'https://gruene-hamburg.de/hitze' },
  'Hitzeschutz'
);

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  vi.clearAllMocks();
  useAgentStore.setState({ pendingMessage: null, pendingDraft: null, pendingAttachments: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
}

describe('AutoMessageSender', () => {
  it('hands off an attachment alone — "Im Chat besprechen" sends nothing', async () => {
    useAgentStore.getState().setPendingAttachments([chip]);
    render(<AutoMessageSender />);
    await flush();

    expect(threads.switchToNewThread).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([`addAttachment:${chip.id}`]);
    expect(hasPendingHandoff(useAgentStore.getState())).toBe(false);
  });

  it('attaches the document before sending the summary request', async () => {
    useAgentStore.getState().setPendingAttachments([chip]);
    useAgentStore.getState().setPendingMessage('Fasse dieses Dokument zusammen.');
    render(<AutoMessageSender />);
    await flush();

    expect(threads.switchToNewThread).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'setText:Fasse dieses Dokument zusammen.',
      `addAttachment:${chip.id}`,
      'send',
    ]);
    expect(hasPendingHandoff(useAgentStore.getState())).toBe(false);
  });

  it('leaves a text-only draft as before', async () => {
    useAgentStore.getState().setPendingDraft('Entwurf');
    render(<AutoMessageSender />);
    await flush();

    expect(calls).toEqual(['setText:Entwurf']);
    expect(useAgentStore.getState().pendingDraft).toBeNull();
  });
});
