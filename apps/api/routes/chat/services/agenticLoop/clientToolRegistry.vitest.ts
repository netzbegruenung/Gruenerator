/**
 * Die Registry der Loop-Werkzeuge, die der Browser ausführt — und die
 * Weiche, die eine `client_tool`-Antwort der Loop-Fortsetzung zuschlägt.
 */
import { describe, it, expect, vi } from 'vitest';

const { reviewMock, targetMock } = vi.hoisted(() => ({
  reviewMock: vi.fn(),
  targetMock: vi.fn(),
}));

vi.mock('../../agents/sharepicCheckTool.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../agents/sharepicCheckTool.js')>()),
  reviewRenderedSharepic: reviewMock,
}));
vi.mock('../sharepicLoopTarget.js', () => ({ resolveLoopSharepicTarget: targetMock }));

import {
  clientToolResumeRejection,
  LOOP_CLIENT_TOOLS,
  loopClientToolForClientName,
  routesToLoopClientToolResume,
} from './clientToolRegistry.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { StoredLoopClientToolState } from '../loopClientToolStateStore.js';
import type { SSEWriter } from '../sseHelpers.js';

const sse = { send: vi.fn() } as unknown as SSEWriter;

describe('LOOP_CLIENT_TOOLS', () => {
  it('check_sharepic läuft im Browser als render_sharepic', () => {
    expect(LOOP_CLIENT_TOOLS.get('check_sharepic')?.clientToolName).toBe('render_sharepic');
    expect(loopClientToolForClientName('render_sharepic')?.loopToolName).toBe('check_sharepic');
  });

  it('unbekannter Browser-Name ⇒ null', () => {
    expect(loopClientToolForClientName('nope')).toBeNull();
  });
});

describe('check_sharepic resolve', () => {
  const sharepic = LOOP_CLIENT_TOOLS.get('check_sharepic')!;

  it('schon geprüft in diesem Zug ⇒ Fehler, kein DB-Zugriff', async () => {
    const out = await sharepic.resolve({
      threadId: 't1',
      state: { sharepicCheck: { ok: true } } as unknown as ChatGraphState,
      args: {},
      priorSteps: [],
    });
    expect(out).toEqual({ error: expect.stringContaining('schon geprüft') });
    expect(targetMock).not.toHaveBeenCalled();
  });

  it('löst das Ziel auf und reicht die Render-Argumente weiter', async () => {
    targetMock.mockResolvedValueOnce({
      prior: { variantId: 'v1', canvasType: 'x' },
      props: { creatorSpec: {} },
    });
    const out = await sharepic.resolve({
      threadId: 't1',
      state: {} as ChatGraphState,
      args: { variantId: 'v1' },
      priorSteps: [],
    });
    expect(out).toEqual({
      clientArgs: { variantId: 'v1', canvasType: 'x', initialProps: { creatorSpec: {} } },
    });
  });
});

describe('check_sharepic toToolResult', () => {
  const sharepic = LOOP_CLIENT_TOOLS.get('check_sharepic')!;
  const stored = {
    clientArgs: { variantId: 'v1' },
    classifiedState: { lastUserTextNoMentions: 'Passt das?' },
  } as unknown as StoredLoopClientToolState;

  it('prüft das Bild und legt die Prüfung in den Zustand', async () => {
    reviewMock.mockResolvedValueOnce({ ok: true, issues: [] });
    const out = await sharepic.toToolResult({
      threadId: 't1',
      stored,
      result: { image: 'data:image/png;base64,AA' },
      sse,
      userId: 'u1',
    });
    expect(reviewMock).toHaveBeenCalledWith({
      threadId: 't1',
      variantId: 'v1',
      userText: 'Passt das?',
      image: 'data:image/png;base64,AA',
    });
    expect(out).toEqual({
      toolResult: { ok: true, issues: [] },
      classifiedStatePatch: { sharepicCheck: { ok: true, issues: [] } },
    });
  });

  it('ohne Bild ⇒ Schritt als fehlgeschlagen markiert', async () => {
    reviewMock.mockResolvedValueOnce({ ok: false, note: 'x' });
    const out = await sharepic.toToolResult({
      threadId: 't1',
      stored,
      result: {},
      sse,
      userId: 'u1',
    });
    expect(out.ok).toBe(false);
  });
});

describe('routesToLoopClientToolResume', () => {
  const loop = (clientToolName: string) => ({ clientToolName });

  it('gespeicherter Loop-Zustand für denselben Browser-Namen ⇒ Loop-Fortsetzung', () => {
    expect(routesToLoopClientToolResume('render_sharepic', loop('render_sharepic'))).toBe(true);
    expect(routesToLoopClientToolResume('run_python', loop('run_python'))).toBe(true);
  });

  it('Loop-Zustand für ein anderes Werkzeug ⇒ nicht die Loop-Fortsetzung', () => {
    expect(routesToLoopClientToolResume('run_python', loop('render_sharepic'))).toBe(false);
  });

  it('registriertes Werkzeug ohne Zustand ⇒ trotzdem Loop-Fortsetzung (meldet „abgelaufen")', () => {
    expect(routesToLoopClientToolResume('render_sharepic', null)).toBe(true);
    expect(routesToLoopClientToolResume('run_python', null)).toBe(true);
  });

  it('unbekanntes Werkzeug ohne Zustand ⇒ nicht die Loop-Fortsetzung', () => {
    expect(routesToLoopClientToolResume('nope', null)).toBe(false);
  });
});

describe('clientToolResumeRejection', () => {
  const loop = (clientToolName: string) => ({ clientToolName });
  const expired = {
    message: 'Diese Berechnung ist abgelaufen, bitte erneut fragen',
    code: 'invalid_request',
  };

  it('run_python ohne gespeicherten run_python-Zustand ⇒ abgelaufen', () => {
    expect(clientToolResumeRejection('run_python', null)).toEqual(expired);
    expect(clientToolResumeRejection('run_python', loop('render_sharepic'))).toEqual(expired);
  });

  it('run_python mit wartendem Zustand ⇒ keine Ablehnung', () => {
    expect(clientToolResumeRejection('run_python', loop('run_python'))).toBeNull();
  });

  it('unbekanntes Werkzeug ⇒ nicht unterstützt', () => {
    expect(clientToolResumeRejection('nope', null)).toEqual({
      message: 'Dieser Tool-Typ wird noch nicht unterstützt.',
      code: 'invalid_request',
    });
  });

  it('render_sharepic ohne Zustand ⇒ keine Ablehnung (die Fortsetzung meldet selbst)', () => {
    expect(clientToolResumeRejection('render_sharepic', null)).toBeNull();
  });
});

describe('tabelle_auswerten im Register', () => {
  it('läuft im Browser als run_python', () => {
    expect(LOOP_CLIENT_TOOLS.get('tabelle_auswerten')?.clientToolName).toBe('run_python');
  });
});
