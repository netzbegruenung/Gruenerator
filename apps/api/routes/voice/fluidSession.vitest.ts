/**
 * The relay between the test page and KugelAudio Fluid 1, against fake sockets:
 * what we start the session with (EU host, voice 1887, EU back office), how
 * audio and transcripts reach the browser, and that a tool call from the back
 * office is run and answered. No network, no money.
 *
 * Run: `npx vitest run routes/voice/fluidSession.vitest.ts`
 */
import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../config/env.js', () => ({ env: { KUGELAUDIO_API_KEY: 'test-key' } }));
vi.mock('../../services/usage/UsageTrackingService.js', () => ({ recordOperation: vi.fn() }));
vi.mock('../../services/voice/voicePort.js', () => ({
  runVoicePortTool: vi.fn(),
  voicePortDeclarations: vi.fn(),
}));
vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin: vi.fn() }));
vi.mock('../../services/localization/localeCache.js', () => ({ getUserLocale: vi.fn() }));

const { handleFluidSession } = await import('./fluidSession.js');
const { recordOperation } = await import('../../services/usage/UsageTrackingService.js');

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: unknown[] = [];
  send(data: string | Buffer) {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close');
  }
}

const DECLARATION = {
  function: {
    name: 'gruenerator_search',
    description: 'Sucht in Programmen.',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
  },
};

function setup(overrides: { admin?: boolean } = {}) {
  const client = new FakeSocket();
  const upstream = new FakeSocket();
  const connect = vi.fn(() => upstream);
  const runTool = vi.fn(async () => ({ text: 'Kohleausstieg 2030.', isError: false }));
  const done = handleFluidSession(client as never, 'user-1', {
    connect: connect as never,
    isAdmin: async () => overrides.admin ?? true,
    locale: async () => 'de-DE',
    declarations: async () => [DECLARATION],
    runTool,
  });
  const fromUpstream = (event: unknown) =>
    upstream.emit('message', Buffer.from(JSON.stringify(event)));
  return { client, upstream, connect, runTool, done, fromUpstream };
}

describe('handleFluidSession', () => {
  it('starts fluid-1 on the EU host with voice 1887 and an EU back office', async () => {
    const { upstream, connect, done } = setup();
    await done;
    upstream.emit('open');

    expect(connect).toHaveBeenCalledWith(
      'wss://api.eu.kugelaudio.com/v1/live/sessions',
      'test-key'
    );
    const start = upstream.sent[0] as { type: string; session: Record<string, any> };
    expect(start.type).toBe('session.start');
    expect(start.session.model).toBe('fluid-1');
    expect(start.session.audio).toEqual({
      format: { type: 'audio/pcm', rate: 16000 },
      output: { voice: '1887' },
    });
    expect(start.session.delegation.type).toBe('responses');
    expect(start.session.delegation.responses.model).toBe('mistral-medium-3.5-128b');
    // Flat OpenAI function tools, not Mistral's nested `function` object.
    expect(start.session.delegation.responses.tools).toEqual([
      {
        type: 'function',
        name: 'gruenerator_search',
        description: 'Sucht in Programmen.',
        parameters: DECLARATION.function.parameters,
      },
    ]);
  });

  it('refuses non-admins before anything reaches KugelAudio', async () => {
    const { client, connect, done } = setup({ admin: false });
    await done;
    expect(connect).not.toHaveBeenCalled();
    expect(client.sent).toEqual([{ type: 'error', message: 'Nur für Instanz-Admins' }]);
    expect(client.readyState).toBe(3);
  });

  it('forwards microphone audio only once the session has started', async () => {
    const { client, upstream, done, fromUpstream } = setup();
    await done;
    upstream.emit('open');
    client.emit('message', Buffer.from([1, 2, 3, 4]), true);
    expect(upstream.sent).toHaveLength(1);

    fromUpstream({ type: 'session.started', session: {} });
    client.emit('message', Buffer.from([1, 2, 3, 4]), true);
    expect(upstream.sent[1]).toEqual({ type: 'session.input_audio.append', audio: 'AQIDBA==' });
    expect(client.sent[0]).toEqual({ type: 'ready' });
  });

  it('passes audio and both transcripts to the browser', async () => {
    const { client, done, fromUpstream } = setup();
    await done;
    fromUpstream({ type: 'session.output_audio.delta', delta: 'AAAA' });
    fromUpstream({ type: 'session.input_transcript.delta', delta: 'Was sagt ' });
    fromUpstream({ type: 'session.output_transcript.delta', delta: 'Hallo' });
    expect(client.sent).toEqual([
      { type: 'audio', delta: 'AAAA' },
      { type: 'transcript', role: 'user', delta: 'Was sagt ' },
      { type: 'transcript', role: 'assistant', delta: 'Hallo' },
    ]);
  });

  it('runs a back-office tool call and returns its output, then response.create', async () => {
    const { client, upstream, runTool, done, fromUpstream } = setup();
    await done;
    upstream.emit('open');
    fromUpstream({
      type: 'response.event',
      delegation_id: 'd1',
      event: {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'c1',
          name: 'gruenerator_search',
          arguments: '{"query":"Kohle"}',
        },
      },
    });
    await vi.waitFor(() => expect(upstream.sent).toHaveLength(3));

    expect(runTool).toHaveBeenCalledWith('user-1', 'de-DE', 'gruenerator_search', {
      query: 'Kohle',
    });
    expect(upstream.sent.slice(1)).toEqual([
      {
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: 'c1', output: 'Kohleausstieg 2030.' },
      },
      { type: 'response.create' },
    ]);
    expect(client.sent).toContainEqual(
      expect.objectContaining({ type: 'tool', name: 'gruenerator_search', ok: true })
    );
  });

  it('hangs up on stop and books the seconds KugelAudio reports', async () => {
    const { client, upstream, done, fromUpstream } = setup();
    await done;
    upstream.emit('open');
    client.emit('message', Buffer.from('{"type":"stop"}'), false);
    expect(upstream.sent.at(-1)).toEqual({ type: 'session.close' });

    fromUpstream({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 41.2 } });
    expect(recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'kugelaudio', model: 'fluid-1', count: 42 })
    );
    expect(client.sent.at(-1)).toEqual({ type: 'closed', seconds: 41.2 });
    expect(client.readyState).toBe(3);
  });
});
