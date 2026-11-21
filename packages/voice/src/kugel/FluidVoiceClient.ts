import { AudioBufferQueue } from '../lib/audioBufferQueue';
import {
  installPcmDownsampleWorklet,
  PCM_DOWNSAMPLE_PROCESSOR_NAME,
  TARGET_SAMPLE_RATE,
} from '../lib/pcmDownsampleWorklet';
import { base64PCM16ToFloat32 } from '../lib/pcmUtils';
import { resolveVoiceWsUrl } from '../lib/resolveVoiceWsUrl';

/**
 * What `/api/voice/fluid` sends (`FluidClientEvent` in apps/api
 * routes/voice/fluidSession.ts). Audio is base64 PCM16 at the worklet's 16 kHz,
 * the rate the session runs at in both directions.
 */
type FluidServerEvent =
  | { type: 'ready' }
  | { type: 'audio'; delta: string }
  | { type: 'transcript'; role: 'user' | 'assistant'; delta: string }
  | { type: 'tool'; name: string; ms: number; ok: boolean }
  | { type: 'error'; message: string }
  | { type: 'closed'; seconds: number | null };

export interface FluidVoiceCallbacks {
  onReady?: () => void;
  onTranscript?: (role: 'user' | 'assistant', delta: string) => void;
  onTool?: (name: string, ms: number, ok: boolean) => void;
  /** First audible sample of a reply after silence — for the response clock. */
  onAgentAudio?: () => void;
  onError?: (message: string) => void;
  onClosed?: (seconds: number | null) => void;
}

/**
 * KugelAudio Fluid 1 through our server: the microphone goes up as PCM16
 * frames, the agent's voice comes back and plays as it arrives. Fluid paces its
 * audio at speaking speed and cuts an interrupted reply off in the stream, so
 * there is no queue to clear — and the mic stays open while the agent talks,
 * which is what lets the caller interrupt (headphones, or the browser's echo
 * cancellation).
 */
export class FluidVoiceClient {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private playback: AudioBufferQueue | null = null;
  private silentSince = 0;

  constructor(private readonly apiBaseUrl?: string) {}

  async start(cb: FluidVoiceCallbacks): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    await installPcmDownsampleWorklet(ctx);
    const worklet = new AudioWorkletNode(ctx, PCM_DOWNSAMPLE_PROCESSOR_NAME);
    ctx.createMediaStreamSource(this.stream).connect(worklet);
    // Keeps the worklet's process loop scheduled on some browsers.
    worklet.connect(ctx.destination);

    this.playback = new AudioBufferQueue();
    const ws = new WebSocket(resolveVoiceWsUrl(this.apiBaseUrl, '/api/voice/fluid'));
    this.ws = ws;
    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      let msg: FluidServerEvent;
      try {
        // Boundary cast: our own server's event, see the type above.
        msg = JSON.parse(e.data) as FluidServerEvent;
      } catch {
        return;
      }
      if (msg.type === 'ready') cb.onReady?.();
      else if (msg.type === 'audio') {
        const now = performance.now();
        // 20 ms frames at speaking pace; a gap means a new reply began.
        if (now - this.silentSince > 400) cb.onAgentAudio?.();
        this.silentSince = now;
        this.playback?.enqueueFloat32(base64PCM16ToFloat32(msg.delta), TARGET_SAMPLE_RATE);
      } else if (msg.type === 'transcript') cb.onTranscript?.(msg.role, msg.delta);
      else if (msg.type === 'tool') cb.onTool?.(msg.name, msg.ms, msg.ok);
      else if (msg.type === 'error') cb.onError?.(msg.message);
      else if (msg.type === 'closed') cb.onClosed?.(msg.seconds);
    };
    ws.onclose = () => {
      this.release();
      cb.onClosed?.(null);
    };
  }

  /** Hang up: the agent finishes its sentence, then the server closes. */
  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'stop' }));
    else this.release();
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    void this.playback?.close();
    this.playback = null;
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) this.ws.close();
    this.ws = null;
  }
}
