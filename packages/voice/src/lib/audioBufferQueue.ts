import { base64Float32LEToFloat32 } from './pcmUtils';

export interface AudioBufferQueueOptions {
  onDrained?: () => void;
  onVolume?: (rms: number) => void;
}

export class AudioBufferQueue {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private active: AudioBufferSourceNode[] = [];
  private pending = 0;
  private doneSignaled = false;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;
  private opts: AudioBufferQueueOptions;

  constructor(opts: AudioBufferQueueOptions = {}) {
    this.opts = opts;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.ctx.destination);
      this.analyserBuf = new Float32Array(
        new ArrayBuffer(this.analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)
      );
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  isPlaying(): boolean {
    return this.pending > 0;
  }

  enqueueBase64Float32(pcmBase64: string, sampleRate: number): void {
    const float32 = base64Float32LEToFloat32(pcmBase64);
    this.enqueueFloat32(float32, sampleRate);
  }

  enqueueFloat32(samples: Float32Array, sampleRate: number): void {
    const ctx = this.ensureContext();
    if (samples.length === 0) return;

    const buf = ctx.createBuffer(1, samples.length, sampleRate);
    buf.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    if (this.analyser) {
      source.connect(this.analyser);
    } else {
      source.connect(ctx.destination);
    }

    const startAt = Math.max(this.nextStartTime, ctx.currentTime);
    source.start(startAt);
    this.nextStartTime = startAt + buf.duration;

    this.active.push(source);
    this.pending++;

    if (this.opts.onVolume) this.startVolumeLoop();

    source.onended = () => {
      this.pending--;
      this.active = this.active.filter((n) => n !== source);
      if (this.pending <= 0 && this.doneSignaled) {
        this.doneSignaled = false;
        this.stopVolumeLoop();
        this.opts.onDrained?.();
      }
    };
  }

  signalDone(): void {
    this.doneSignaled = true;
    if (this.pending <= 0) {
      this.doneSignaled = false;
      this.stopVolumeLoop();
      this.opts.onDrained?.();
    }
  }

  stop(): void {
    for (const node of this.active) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.active = [];
    this.pending = 0;
    this.nextStartTime = 0;
    this.doneSignaled = false;
    this.stopVolumeLoop();
  }

  async close(): Promise<void> {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close();
      } catch {
        /* swallow */
      }
    }
    this.ctx = null;
    this.analyser = null;
    this.analyserBuf = null;
  }

  private startVolumeLoop() {
    if (this.rafId != null) return;
    let lastEmitted = -1;
    const tick = () => {
      if (!this.analyser || !this.analyserBuf || !this.opts.onVolume) {
        this.rafId = null;
        return;
      }
      this.analyser.getFloatTimeDomainData(this.analyserBuf);
      let sumSquares = 0;
      for (let i = 0; i < this.analyserBuf.length; i++) {
        const v = this.analyserBuf[i] ?? 0;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / this.analyserBuf.length);
      const out = Math.min(1, rms * 2);
      // Deadband ~2% so WebGL uniforms don't update 60×/sec on flat audio.
      if (Math.abs(out - lastEmitted) > 0.02) {
        lastEmitted = out;
        this.opts.onVolume(out);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopVolumeLoop() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.opts.onVolume?.(0);
  }
}
