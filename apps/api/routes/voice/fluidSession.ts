/**
 * KugelAudio Fluid 1 (speech to speech) for the internal comparison page
 * `/voice-agent-test`. The browser streams its microphone here, we hold the one
 * WebSocket to KugelAudio (the key never leaves the server) and pass the agent's
 * voice and both transcripts back.
 *
 * Back office `responses` on the EU host: Fluid talks, Mistral Medium 3.5 at
 * Scaleway Paris decides on tool calls, and we run them through the voice port,
 * the same lookup tools the Mistral kit gets. Nothing leaves the EU — the
 * default host would route a call to the US back office when the EU one is busy.
 * No thread, so the creating tools stay off (see `voicePort.ts`).
 *
 * Without `session.kugel` the agent's audio arrives at the pace of speech and an
 * interrupted reply simply stops in the stream, so the browser plays every frame
 * as it comes and needs no cancel handling.
 *
 * Wire protocol: https://docs.kugelaudio.com/speech-to-speech/api-reference
 */

import { WebSocket, type WebSocket as WsWebSocket } from 'ws';

import { env } from '../../config/env.js';
import { getUserLocale } from '../../services/localization/localeCache.js';
import { recordOperation } from '../../services/usage/UsageTrackingService.js';
import { runVoicePortTool, voicePortDeclarations } from '../../services/voice/voicePort.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { createLogger } from '../../utils/logger.js';

type UserLocale = 'de-DE' | 'de-AT';

const log = createLogger('voiceFluid');

const EU_HOST = 'https://api.eu.kugelaudio.com';
export const FLUID_MODEL = 'fluid-1';
/** The voice asked for on the test page. */
export const FLUID_VOICE_ID = '1887';
/** PCM16 mono, both directions: what the browser's downsample worklet produces. */
export const FLUID_SAMPLE_RATE = 16000;

const AGENT_INSTRUCTIONS = [
  'Du bist der Grünerator, ein Sprachassistent für Mitglieder von Bündnis 90/Die Grünen.',
  'Antworte auf Deutsch, kurz und gesprochen: zwei bis drei Sätze, keine Listen, kein Markdown, keine Links vorlesen.',
  'Begrüße kurz mit: Hallo, hier ist der Grünerator. Was kann ich für dich tun?',
  'Für Programme, Beschlüsse, Notebooks, eigene Inhalte, Bundestag, Umfragen oder aktuelle Fakten frag das Back Office, nicht dein Gedächtnis.',
  'Nenne kein KI-Unternehmen und kein Modell, auf dem du läufst.',
].join(' ');

const BACK_OFFICE_INSTRUCTIONS = [
  'Du bist das Back Office des Grünerators. Nutze die Werkzeuge und antworte nur aus ihren Ergebnissen.',
  'Was du schreibst, wird wörtlich vorgelesen: Deutsch, gesprochen, zwei bis vier Sätze, keine Listen, kein Markdown, keine Links.',
  'Findet ein Werkzeug nichts, sag das ehrlich.',
].join(' ');

/** A voice-port declaration (Mistral's nested wire format), as far as we read it. */
interface PortDeclaration {
  function: { name: string; description: string; parameters: unknown };
}

/** OpenAI Live / Responses function tools are flat. */
export function toFluidTools(declarations: readonly PortDeclaration[]) {
  return declarations.map((d) => ({
    type: 'function' as const,
    name: d.function.name,
    description: d.function.description,
    parameters: d.function.parameters,
  }));
}

export function fluidSessionStart(tools: ReturnType<typeof toFluidTools>, locale: UserLocale) {
  return {
    type: 'session.start',
    session: {
      model: FLUID_MODEL,
      instructions:
        locale === 'de-AT'
          ? `${AGENT_INSTRUCTIONS} Die Person ist bei den Grünen in Österreich.`
          : AGENT_INSTRUCTIONS,
      audio: {
        format: { type: 'audio/pcm', rate: FLUID_SAMPLE_RATE },
        output: { voice: FLUID_VOICE_ID },
      },
      delegation: {
        type: 'responses',
        responses: {
          // Named, not left to the host: Mistral Medium 3.5 at Scaleway Paris.
          model: 'mistral-medium-3.5-128b',
          instructions: BACK_OFFICE_INSTRUCTIONS,
          tools,
          tool_choice: 'auto',
          // One call per response: run it, return it, `response.create`.
          parallel_tool_calls: false,
        },
      },
    },
  };
}

function fluidUrl(): string {
  const base = env.KUGELAUDIO_BASE_URL || EU_HOST;
  return `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/v1/live/sessions`;
}

/** What the browser hears from us. Audio is base64 PCM16 at FLUID_SAMPLE_RATE. */
export type FluidClientEvent =
  | { type: 'ready' }
  | { type: 'audio'; delta: string }
  | { type: 'transcript'; role: 'user' | 'assistant'; delta: string }
  | { type: 'tool'; name: string; ms: number; ok: boolean }
  | { type: 'error'; message: string }
  | { type: 'closed'; seconds: number | null };

interface UpstreamEvent {
  type?: string;
  delta?: string;
  error?: { code?: string; message?: string };
  reason?: string;
  usage?: { seconds?: number };
  event?: {
    type?: string;
    item?: { type?: string; call_id?: string; name?: string; arguments?: string };
  };
}

type Socket = Pick<WsWebSocket, 'send' | 'close' | 'on' | 'readyState'>;

export interface FluidDeps {
  connect: (url: string, apiKey: string) => Socket;
  isAdmin: (userId: string) => Promise<boolean>;
  locale: (userId: string) => Promise<UserLocale>;
  declarations: (userId: string, locale: UserLocale) => Promise<PortDeclaration[]>;
  runTool: (
    userId: string,
    locale: UserLocale,
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ text: string; isError: boolean }>;
}

const defaultDeps: FluidDeps = {
  connect: (url, apiKey) => new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` } }),
  isAdmin: (userId) => requireInstanceAdmin(userId),
  locale: async (userId) =>
    (await getUserLocale(userId).catch(() => null)) === 'de-AT' ? 'de-AT' : 'de-DE',
  declarations: (userId, locale) => voicePortDeclarations(userId, locale),
  runTool: (userId, locale, name, args) =>
    runVoicePortTool(userId, locale, name, args, { thread: null }),
};

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw || '{}');
    // Boundary cast: the model's arguments; the tool's own schema validates them.
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleFluidSession(
  clientWs: Socket,
  userId: string,
  deps: FluidDeps = defaultDeps
): Promise<void> {
  const OPEN = 1;
  const toClient = (msg: FluidClientEvent) => {
    if (clientWs.readyState === OPEN) clientWs.send(JSON.stringify(msg));
  };
  const fail = (message: string) => {
    toClient({ type: 'error', message });
    clientWs.close();
  };

  // The internal boundary, as on the Mistral kit's routes: admins only.
  if (!(await deps.isAdmin(userId))) return fail('Nur für Instanz-Admins');
  const apiKey = env.KUGELAUDIO_API_KEY;
  if (!apiKey) return fail('KUGELAUDIO_API_KEY fehlt');

  const locale = await deps.locale(userId);
  const tools = toFluidTools(await deps.declarations(userId, locale));
  const upstream = deps.connect(fluidUrl(), apiKey);
  let started = false;
  let seconds: number | null = null;
  const toUpstream = (msg: unknown) => {
    if (upstream.readyState === OPEN) upstream.send(JSON.stringify(msg));
  };

  upstream.on('open', () => toUpstream(fluidSessionStart(tools, locale)));

  upstream.on('message', (raw: Buffer) => {
    let event: UpstreamEvent;
    try {
      // Boundary cast: KugelAudio's wire event; every field is read defensively.
      event = JSON.parse(raw.toString()) as UpstreamEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case 'session.started':
        started = true;
        toClient({ type: 'ready' });
        break;
      case 'session.output_audio.delta':
        if (event.delta) toClient({ type: 'audio', delta: event.delta });
        break;
      case 'session.input_transcript.delta':
        if (event.delta) toClient({ type: 'transcript', role: 'user', delta: event.delta });
        break;
      case 'session.output_transcript.delta':
        if (event.delta) toClient({ type: 'transcript', role: 'assistant', delta: event.delta });
        break;
      case 'response.event': {
        const item = event.event?.item;
        if (event.event?.type !== 'response.output_item.done' || item?.type !== 'function_call') {
          break;
        }
        const name = item.name ?? '';
        const callId = item.call_id ?? '';
        const t0 = Date.now();
        void deps
          .runTool(userId, locale, name, parseArgs(item.arguments))
          .catch((err: unknown) => {
            log.error('[Fluid] Tool %s failed:', name, err);
            return { text: 'Das Werkzeug ist fehlgeschlagen.', isError: true };
          })
          .then((result) => {
            toClient({ type: 'tool', name, ms: Date.now() - t0, ok: !result.isError });
            toUpstream({
              type: 'response.item.create',
              item: { type: 'function_call_output', call_id: callId, output: result.text },
            });
            toUpstream({ type: 'response.create' });
          });
        break;
      }
      case 'session.usage.updated':
        seconds = event.usage?.seconds ?? seconds;
        break;
      case 'error':
        log.warn('[Fluid] %s: %s', event.error?.code, event.error?.message);
        toClient({
          type: 'error',
          message: `${event.error?.code ?? 'error'}: ${event.error?.message ?? ''}`,
        });
        break;
      case 'session.closed':
        seconds = event.usage?.seconds ?? seconds;
        log.debug('[Fluid] closed reason=%s seconds=%s', event.reason, seconds);
        upstream.close();
        break;
      default:
        // `info`, `session.*.appended`, mute answers: nothing for the page.
        break;
    }
  });

  // A refused upgrade (403: key without realtime:write, organisation not enabled).
  upstream.on('unexpected-response', (_req: unknown, res: { statusCode?: number }) => {
    fail(`KugelAudio lehnte die Sitzung ab (HTTP ${res.statusCode ?? '?'})`);
  });
  upstream.on('error', (err: Error) => {
    log.error('[Fluid] Upstream error:', err.message);
    fail(`Verbindung zu KugelAudio fehlgeschlagen: ${err.message}`);
  });
  upstream.on('close', () => {
    if (seconds !== null && seconds > 0) {
      // Upgrade handlers run outside Express: no usage context, so explicit.
      recordOperation({
        unit: 'speech_seconds',
        provider: 'kugelaudio',
        model: FLUID_MODEL,
        count: Math.ceil(seconds),
        userId,
        feature: 'chat',
      });
    }
    toClient({ type: 'closed', seconds });
    clientWs.close();
  });

  clientWs.on('message', (data: Buffer, isBinary: boolean) => {
    if (!isBinary) {
      // The only control message: hang up, letting the agent finish its sentence.
      if (parseArgs(data.toString()).type === 'stop') toUpstream({ type: 'session.close' });
      return;
    }
    // Microphone frames before `session.started` would be refused.
    if (started) toUpstream({ type: 'session.input_audio.append', audio: data.toString('base64') });
  });
  clientWs.on('close', () => {
    if (upstream.readyState === OPEN) toUpstream({ type: 'session.close' });
    else upstream.close();
  });
}
