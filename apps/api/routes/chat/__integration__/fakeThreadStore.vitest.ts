import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMessage,
  createPendingAssistantMessage,
  finalizeAssistantMessage,
  getRecentToolSteps,
  readThreadToolHistory,
  resetThreadStore,
} from './harness/fakeThreadStore.js';

const THREAD = 'thread-1';
const step = (toolName: string) => ({ toolName, args: {}, result: {} });

async function completeTurn(metadata?: Record<string, unknown>) {
  const id = await createPendingAssistantMessage(THREAD);
  await finalizeAssistantMessage(id, 'Antwort', metadata);
}

describe('fakeThreadStore tool history', () => {
  beforeEach(resetThreadStore);

  it('derives tool steps and sources from persisted assistant metadata', async () => {
    await createMessage(THREAD, 'user', 'frage');
    await completeTurn({
      toolCalls: [step('abgeordnetenwatch'), step('web_search')],
      searchResults: [{ title: 't', url: 'https://x.test', content: 'inhalt' }],
    });

    const history = await readThreadToolHistory(THREAD);
    expect(history.toolSteps().map((s) => s.toolName)).toEqual(['abgeordnetenwatch', 'web_search']);
    expect(history.lastTurnToolSteps().map((s) => s.toolName)).toEqual([
      'abgeordnetenwatch',
      'web_search',
    ]);
    expect(history.sources()).toHaveLength(1);
    expect((await getRecentToolSteps(THREAD)).length).toBe(2);
  });

  it('reports no last-turn steps when the newest turn ran no tools', async () => {
    await completeTurn({ toolCalls: [step('web_search')] });
    await completeTurn();

    const history = await readThreadToolHistory(THREAD);
    expect(history.toolSteps()).toHaveLength(1);
    expect(history.lastTurnToolSteps()).toEqual([]);
  });

  it('ignores a still-streaming assistant row', async () => {
    await createPendingAssistantMessage(THREAD);
    const history = await readThreadToolHistory(THREAD);
    expect(history.toolSteps()).toEqual([]);
    expect(history.lastTurnToolSteps()).toEqual([]);
  });
});
