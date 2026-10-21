import { WebSocket, type WebSocket as WsWebSocket } from 'ws';

import { env } from '../../config/env.js';
import { getUserLocale } from '../../services/localization/localeCache.js';
import { buildVoiceContextBias } from '../../services/transcription/transcriptionBias.js';
import { recordOperation } from '../../services/usage/UsageTrackingService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('voiceTurns');

export const TURN_MODEL = 'voxtral-mini-transcribe-realtime-3';

/**
 * After `turn.end` the last words of the turn can still be on their way as
 * text deltas (Mistral's turn-detection docs). Each delta restarts this window;
 * once it stays quiet the turn is handed to the client.
 */
const TRAILING_DELTA_MS = 250;

interface UpstreamEvent {
  type?: string;
  text?: string;
  end_reason?: string;
  error?: { message?: unknown };
}

/**
 * One Voxtral Realtime 3 connection for the whole conversation, with the
 * server deciding when a turn is over — the job the client's mic-volume VAD
 * does for the v2 path in `realtimeHandler.ts`.
 *
 * Speaks the same protocol to the client as that path (`session.ready`,
 * `text.delta`, `done`, `error`), so the adapter only has to stop sending its
 * own `stop`. The difference: `done` closes a turn, not the socket.
 *
 * The SDK's `RealtimeConnection` (2.7 and 3.1) cannot set `turn_detection` —
 * its `updateSession` takes only an audio format — hence the raw socket.
 */
export function handleTurnSession(clientWs: WsWebSocket, userId: string): void {
  const host = env.MISTRAL_REGION === 'global' ? 'api.mistral.ai' : 'api.eu.mistral.ai';
  const upstream = new WebSocket(
    `wss://${host}/v1/audio/transcriptions/realtime?model=${TURN_MODEL}`,
    { headers: { Authorization: `Bearer ${env.MISTRAL_API_KEY}` } }
  );

  const localeLookup = getUserLocale(userId).catch(() => null);
  let ready = false;
  let receivedAudio = false;
  let turnEnded = false;
  let flushTimer: NodeJS.Timeout | null = null;
  const pendingAudio: Buffer[] = [];

  const toClient = (msg: Record<string, unknown>) => {
    if (clientWs.readyState === clientWs.OPEN) clientWs.send(JSON.stringify(msg));
  };
  const appendAudio = (chunk: Buffer) => {
    upstream.send(JSON.stringify({ type: 'input_audio.append', audio: chunk.toString('base64') }));
  };
  const scheduleTurnDone = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      turnEnded = false;
      toClient({ type: 'done' });
    }, TRAILING_DELTA_MS);
  };

  upstream.on('message', (raw) => {
    let event: UpstreamEvent;
    try {
      // Boundary cast: Mistral's wire event; every field is read defensively below.
      event = JSON.parse(raw.toString()) as UpstreamEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case 'session.created':
        // Audio waits in `pendingAudio` until `session.updated`, so the
        // locale lookup costs no speech.
        void localeLookup.then((locale) => {
          if (upstream.readyState !== WebSocket.OPEN) return;
          upstream.send(
            JSON.stringify({
              type: 'session.update',
              session: {
                audio_format: { encoding: 'pcm_s16le', sample_rate: 16000 },
                language: 'de',
                context_bias: buildVoiceContextBias(locale === 'de-AT' ? 'de-AT' : 'de-DE'),
                turn_detection: {},
              },
            })
          );
        });
        break;
      case 'session.updated':
        if (ready) break;
        ready = true;
        for (const chunk of pendingAudio) appendAudio(chunk);
        pendingAudio.length = 0;
        toClient({ type: 'session.ready' });
        break;
      case 'transcription.text.delta':
        toClient({ type: 'text.delta', text: event.text ?? '' });
        if (turnEnded) scheduleTurnDone();
        break;
      case 'turn.end':
        log.debug('[Turns] turn.end reason=%s', event.end_reason);
        turnEnded = true;
        scheduleTurnDone();
        break;
      case 'error':
        toClient({
          type: 'error',
          message:
            typeof event.error?.message === 'string' ? event.error.message : 'Transcription error',
        });
        break;
      default:
        // turn.start / eager_end / resume and the final transcription.done
        break;
    }
  });

  upstream.on('unexpected-response', (_req, res) => {
    log.error('[Turns] Upstream refused the connection: HTTP %d', res.statusCode);
    toClient({ type: 'error', message: `Voxtral Realtime antwortete mit ${res.statusCode}` });
    clientWs.close();
  });
  upstream.on('error', (err) => {
    log.error('[Turns] Upstream error: %s', err.message);
    toClient({ type: 'error', message: err.message });
  });
  upstream.on('close', () => {
    if (flushTimer) clearTimeout(flushTimer);
    if (clientWs.readyState === clientWs.OPEN) clientWs.close();
  });

  clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    if (isBinary) {
      receivedAudio = true;
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (ready && upstream.readyState === WebSocket.OPEN) appendAudio(chunk);
      else pendingAudio.push(chunk);
      return;
    }
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === 'stop' && upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: 'input_audio.end' }));
      }
    } catch {
      // Ignore malformed JSON
    }
  });

  clientWs.on('close', () => {
    if (flushTimer) clearTimeout(flushTimer);
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
    }
    // Ein Upgrade-Handler läuft ausserhalb der Express-Middleware — Nutzer und
    // Bereich werden ausdrücklich übergeben (wie in realtimeHandler.ts).
    if (receivedAudio) {
      recordOperation({
        unit: 'transcriptions',
        provider: 'mistral',
        model: TURN_MODEL,
        userId,
        feature: 'chat',
      });
    }
  });
}
