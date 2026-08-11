import { AudioEncoding, RealtimeTranscription } from '@mistralai/mistralai/extra/realtime';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';

import { env } from '../../config/env.js';
import { denyUpgrade, resolveUpgradeAuth } from '../../middleware/resolveUpgradeAuth.js';
import { createLogger } from '../../utils/logger.js';

import type http from 'http';

const log = createLogger('voiceRealtime');
const MISTRAL_API_KEY = env.MISTRAL_API_KEY;
const REALTIME_MODEL = 'voxtral-mini-transcribe-realtime-2602';

const AUDIO_FORMAT = {
  encoding: AudioEncoding.PcmS16le,
  sampleRate: 16000,
} as const;

export function attachRealtimeWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname !== '/api/voice/realtime') return;

    // Solange der Socket noch uns gehört, braucht er einen eigenen
    // `error`-Listener: ein roher Socket ohne Listener wirft bei einem
    // Verbindungsabbruch eine unbehandelte Ausnahme und reißt den Worker mit.
    // Vor der Einwilligungsprüfung gab es dieses Fenster nicht — `handleUpgrade`
    // lief synchron und `ws` übernahm die Fehlerbehandlung sofort. Jetzt liegt
    // ein `await` dazwischen, das jede anonyme Verbindung offen halten kann.
    const onSocketError = (err: Error): void => {
      log.warn('[Realtime] Socket-Fehler vor dem Handshake: %s', err.message);
      socket.destroy();
    };
    socket.on('error', onSocketError);

    // Anmeldung und Einwilligung müssen hier ausdrücklich geprüft werden: ein
    // Upgrade-Handler hängt am HTTP-Server, nicht an Express — das
    // `app.use('/api/voice', requireAuth, requireAiConsent, …)` in routes.ts
    // erreicht ihn nie. Ohne die Prüfung nahm dieser Pfad jede anonyme
    // Verbindung an und streamte Audio auf unseren Kosten an die
    // Realtime-Transkription.
    void (async () => {
      const result = await resolveUpgradeAuth(request, url);
      if (!result.ok) {
        log.warn('[Realtime] Upgrade abgelehnt: %s', result.reason);
        denyUpgrade(socket, result.reason);
        return;
      }
      // Ab hier führt `ws` den Socket — inklusive seiner Fehlerbehandlung.
      socket.removeListener('error', onSocketError);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, result.userId);
      });
    })();
  });

  wss.on('connection', (ws: WsWebSocket, _request: unknown, userId: string) => {
    log.debug('[Realtime] Client verbunden user=%s', userId);
    void handleRealtimeSession(ws);
  });
}

async function handleRealtimeSession(clientWs: WsWebSocket): Promise<void> {
  const client = new RealtimeTranscription({ apiKey: MISTRAL_API_KEY });
  let activeConnection: Awaited<ReturnType<typeof client.connect>> | null = null;
  let stopped = false;
  let clientDisconnected = false;
  const audioBuffer: Uint8Array[] = [];

  clientWs.on('message', async (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    if (isBinary) {
      const chunk =
        data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data as ArrayBuffer);

      if (activeConnection && !activeConnection.isClosed) {
        try {
          await activeConnection.sendAudio(chunk);
        } catch (err) {
          log.error('[Realtime] Error sending audio to Mistral:', err);
        }
      } else {
        audioBuffer.push(chunk);
      }
    } else {
      try {
        const msg = JSON.parse(data.toString()) as { type: string };
        if (msg.type === 'stop') {
          log.debug('[Realtime] Stop signal received');
          stopped = true;
          if (activeConnection && !activeConnection.isClosed) {
            await activeConnection.flushAudio();
            await activeConnection.endAudio();
          }
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  });

  clientWs.on('close', async () => {
    log.debug('[Realtime] Client disconnected');
    clientDisconnected = true;
    stopped = true;
    try {
      if (activeConnection && !activeConnection.isClosed) {
        await activeConnection.close();
      }
    } catch {
      // Connection may already be closed
    }
  });

  try {
    while (!stopped && !clientDisconnected && clientWs.readyState === clientWs.OPEN) {
      activeConnection = await client.connect(REALTIME_MODEL, { audioFormat: AUDIO_FORMAT });

      if (audioBuffer.length === 0) {
        clientWs.send(JSON.stringify({ type: 'session.ready' }));
      }
      log.debug('[Realtime] Mistral connection established');

      for (const buffered of audioBuffer) {
        if (!activeConnection.isClosed) {
          await activeConnection.sendAudio(buffered);
        }
      }
      audioBuffer.length = 0;

      let segmentDone = false;

      for await (const event of activeConnection) {
        if (clientWs.readyState !== clientWs.OPEN) break;

        const eventObj = event as Record<string, unknown>;
        const eventType = eventObj.type as string;

        if (eventType === 'transcription.text.delta') {
          clientWs.send(
            JSON.stringify({ type: 'text.delta', text: (eventObj as { text: string }).text })
          );
        } else if (eventType === 'transcription.done') {
          if (stopped) {
            clientWs.send(JSON.stringify({ type: 'done' }));
          }
          segmentDone = true;
          break;
        } else if (eventType === 'error') {
          const errDetail = eventObj.error as { message?: string } | undefined;
          clientWs.send(
            JSON.stringify({
              type: 'error',
              message: errDetail?.message || 'Transcription error',
            })
          );
          stopped = true;
          break;
        }
      }

      try {
        if (!activeConnection.isClosed) {
          await activeConnection.close();
        }
      } catch {
        // Connection may already be closed
      }
      activeConnection = null;

      if (!segmentDone) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('[Realtime] Session error:', message);

    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', message }));
    }
  } finally {
    if (activeConnection && !activeConnection.isClosed) {
      try {
        await activeConnection.close();
      } catch {
        // Ignore
      }
    }
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.close();
    }
  }
}
