import { AudioEncoding, RealtimeTranscription } from '@mistralai/mistralai/extra/realtime';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';

import { createLogger } from '../../utils/logger.js';

import type http from 'http';

const log = createLogger('voiceRealtime');
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const REALTIME_MODEL = 'voxtral-mini-transcribe-realtime-2602';

export function attachRealtimeWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname !== '/api/voice/realtime') return;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WsWebSocket) => {
    log.debug('[Realtime] Client connected');
    handleRealtimeSession(ws);
  });
}

async function handleRealtimeSession(clientWs: WsWebSocket): Promise<void> {
  try {
    const client = new RealtimeTranscription({ apiKey: MISTRAL_API_KEY });
    const connection = await client.connect(REALTIME_MODEL, {
      audioFormat: {
        encoding: AudioEncoding.PcmS16le,
        sampleRate: 16000,
      },
    });

    clientWs.send(JSON.stringify({ type: 'session.ready' }));
    log.debug('[Realtime] Mistral session established');

    // Forward audio from browser to Mistral, handle stop signal
    clientWs.on('message', async (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (connection.isClosed) return;

      if (isBinary) {
        try {
          const chunk =
            data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data as ArrayBuffer);
          await connection.sendAudio(chunk);
        } catch (err) {
          log.error('[Realtime] Error sending audio to Mistral:', err);
        }
      } else {
        // Text message — check for stop signal
        try {
          const msg = JSON.parse(data.toString()) as { type: string };
          if (msg.type === 'stop') {
            log.debug('[Realtime] Stop signal received, flushing audio');
            await connection.flushAudio();
            await connection.endAudio();
          }
        } catch {
          // Ignore malformed JSON
        }
      }
    });

    clientWs.on('close', async () => {
      log.debug('[Realtime] Client disconnected');
      try {
        if (!connection.isClosed) {
          await connection.close();
        }
      } catch {
        // Connection may already be closed
      }
    });

    // Forward transcription events from Mistral to browser
    for await (const event of connection) {
      if (clientWs.readyState !== clientWs.OPEN) break;

      const eventObj = event as Record<string, unknown>;
      const eventType = eventObj.type as string;

      if (eventType === 'transcription.text.delta') {
        clientWs.send(
          JSON.stringify({ type: 'text.delta', text: (eventObj as { text: string }).text })
        );
      } else if (eventType === 'transcription.done') {
        clientWs.send(JSON.stringify({ type: 'done' }));
        break;
      } else if (eventType === 'error') {
        const errDetail = eventObj.error as { message?: string } | undefined;
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message: errDetail?.message || 'Transcription error',
          })
        );
        break;
      }
    }

    await connection.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('[Realtime] Session error:', message);

    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', message }));
    }
  } finally {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.close();
    }
  }
}
