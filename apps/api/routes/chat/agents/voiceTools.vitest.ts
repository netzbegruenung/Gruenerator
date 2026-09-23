/**
 * `vertonen` against a mocked speech service.
 *
 * The two tests that matter are the idempotency guard and the quota path: the
 * model cannot hear the file it made and asks again, and every extra call
 * spends real seconds from the person's daily budget.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  TreeBudgetExceededError,
  TreeBudgetUnavailableError,
  treeBudgetSpentMessage,
  type TreeBalance,
} from '../../../services/trees/index.js';
import { toUserFacingMessage } from '../../../utils/errors/index.js';

import { makeVertonenTool } from './voiceTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const generateSpeechFiles = vi.fn();

vi.mock('../../../services/voice/speechService.js', () => ({
  generateSpeechFiles: (...args: unknown[]) => generateSpeechFiles(...args),
}));

const EXCEEDED_STATUS: TreeBalance = {
  usedUnits: 100,
  limitUnits: 100,
  remainingUnits: 0,
  resetsAt: new Date('2024-01-02T00:00:00.000Z'),
  newsletterBonus: false,
};

function makeCtx(userId: string | null = 'user-1') {
  const sent: Array<{ event: string; payload: unknown }> = [];
  const state = {
    ...(userId ? { agentConfig: { userId } } : {}),
  } as unknown as ChatGraphState;
  const sse = {
    send: (event: string, payload: unknown) => sent.push({ event, payload }),
  } as unknown as SSEWriter;
  return { ctx: { state, sse, voiceId: null }, sent, state };
}

// The AI-SDK Tool type keeps execute optional; the loop always calls it.
const run = (tool: unknown, input: unknown) =>
  (tool as { execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    { toolCallId: 'c1', messages: [] }
  );

const speechResult = (over: Record<string, unknown> = {}) => ({
  durationSeconds: 83,
  chunks: 1,
  files: [
    {
      format: 'mp3',
      mediaId: 'm1',
      shareToken: 'tok-123',
      mimeType: 'audio/mpeg',
      fileSize: 1024,
      shareUrl: '/share/tok-123',
    },
  ],
  quota: {
    used: 0.83,
    limit: 18,
    remaining: 17.17,
    resetsAt: '2024-01-02T00:00:00.000Z',
    newsletterBonus: false,
  },
  ...over,
});

describe('vertonen', () => {
  beforeEach(() => {
    generateSpeechFiles.mockReset();
  });

  it('streams a compute event with the share download as the file asset', async () => {
    generateSpeechFiles.mockResolvedValue(speechResult());
    const { ctx, sent, state } = makeCtx();

    const result = await run(makeVertonenTool(ctx), {
      text: 'Guten Tag, hier ist das Grüne Büro.',
      titel: 'Ansage Bürgerbüro',
    });

    expect(result.ok).toBe(true);
    expect(result.fileName).toBe('ansage-buergerbuero.mp3');
    expect(result.laenge).toBe('1:23 Minuten');

    const compute = sent.find((e) => e.event === 'compute');
    expect(compute).toBeDefined();
    const payload = (compute?.payload as { compute: Record<string, unknown> }).compute;
    // The bytes live in the Mediathek — the card points there rather than at a
    // copy under uploads/compute-assets.
    expect(payload.fileAssets).toEqual([
      { name: 'ansage-buergerbuero.mp3', url: '/api/share/tok-123/download' },
    ]);
    expect(state.computedResult).toBe(payload);
    expect(state.computedResultFresh).toBe(true);
  });

  it('passes the chosen format and the settings voice through', async () => {
    generateSpeechFiles.mockResolvedValue(
      speechResult({
        files: [
          {
            format: 'wav_phone',
            mediaId: 'm2',
            shareToken: 'tok-9',
            mimeType: 'audio/wav',
            fileSize: 99,
            shareUrl: '/share/tok-9',
          },
        ],
      })
    );
    const { ctx } = makeCtx();
    ctx.voiceId = '1885';

    const result = await run(makeVertonenTool(ctx), { text: 'Ansage', format: 'wav_phone' });

    expect(result.fileName).toBe('vertonung.wav');
    expect(generateSpeechFiles).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ formats: ['wav_phone'], voiceId: '1885' })
    );
  });

  it('hands the loop abort signal to the provider', async () => {
    generateSpeechFiles.mockResolvedValue(speechResult());
    const { ctx } = makeCtx();
    const controller = new AbortController();

    await (
      makeVertonenTool(ctx) as unknown as {
        execute: (i: unknown, o: unknown) => Promise<unknown>;
      }
    ).execute(
      { text: 'Ein Satz.' },
      { toolCallId: 'c1', messages: [], abortSignal: controller.signal }
    );

    // Without this the synthesis outlives an abandoned turn: seconds spent, a
    // Mediathek row written, a compute event into a turn that already gave up.
    expect(generateSpeechFiles).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('does not synthesise twice in one turn', async () => {
    generateSpeechFiles.mockResolvedValue(speechResult());
    const { ctx } = makeCtx();
    const tool = makeVertonenTool(ctx);

    await run(tool, { text: 'Erster Anlauf' });
    const second = await run(tool, { text: 'Erster Anlauf' });

    expect(generateSpeechFiles).toHaveBeenCalledTimes(1);
    expect(second.ok).toBe(true);
    expect(String(second.note)).toMatch(/bereits eine Audiodatei/);
  });

  it('hands the budget message to the model unchanged', async () => {
    generateSpeechFiles.mockRejectedValue(new TreeBudgetExceededError(EXCEEDED_STATUS, 10));
    const { ctx, sent } = makeCtx();

    const result = await run(makeVertonenTool(ctx), { text: 'Zu viel' });

    expect(result.error).toBe(treeBudgetSpentMessage(EXCEEDED_STATUS, 10));
    expect(sent).toHaveLength(0);
  });

  it('hands the unavailable message to the model unchanged', async () => {
    generateSpeechFiles.mockRejectedValue(new TreeBudgetUnavailableError());
    const { ctx, sent } = makeCtx();

    const result = await run(makeVertonenTool(ctx), { text: 'Zu viel' });

    // Goes through toUserFacingMessage like every other error here — assert
    // against that, not the raw error text, since the classifier may rewrite it.
    expect(result.error).toBe(toUserFacingMessage(new TreeBudgetUnavailableError()));
    expect(sent).toHaveLength(0);
  });

  it('reports a provider failure without leaking its message', async () => {
    generateSpeechFiles.mockRejectedValue(new Error('KugelAudio 500 at https://internal'));
    const { ctx } = makeCtx();

    const result = await run(makeVertonenTool(ctx), { text: 'Fehlschlag' });

    expect(result.error).toBe('Die Vertonung ist fehlgeschlagen.');
  });

  it('refuses without a session', async () => {
    const { ctx } = makeCtx(null);

    const result = await run(makeVertonenTool(ctx), { text: 'Ohne Sitzung' });

    expect(String(result.error)).toMatch(/Keine Sitzung/);
    expect(generateSpeechFiles).not.toHaveBeenCalled();
  });

  it('retries after a failure — the guard holds only for a produced file', async () => {
    generateSpeechFiles.mockRejectedValueOnce(new Error('kurzer Aussetzer'));
    generateSpeechFiles.mockResolvedValueOnce(speechResult());
    const { ctx } = makeCtx();
    const tool = makeVertonenTool(ctx);

    await run(tool, { text: 'Anlauf' });
    const second = await run(tool, { text: 'Anlauf' });

    expect(second.ok).toBe(true);
    expect(generateSpeechFiles).toHaveBeenCalledTimes(2);
  });
});
