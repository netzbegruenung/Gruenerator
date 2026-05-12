export const TARGET_SAMPLE_RATE = 16000;

export const PCM_DOWNSAMPLE_PROCESSOR_NAME = 'pcm-downsample-processor';

export const PCM_DOWNSAMPLE_WORKLET_CODE = `
class PCMDownsampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(16384);
    this._writePos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    const len = channelData.length;

    if (this._writePos + len > this._buffer.length) {
      const newBuf = new Float32Array(Math.max(this._buffer.length * 2, this._writePos + len));
      newBuf.set(this._buffer.subarray(0, this._writePos));
      this._buffer = newBuf;
    }
    this._buffer.set(channelData, this._writePos);
    this._writePos += len;

    const ratio = sampleRate / ${TARGET_SAMPLE_RATE};
    const targetChunkSize = 480;
    const sourceChunkSize = Math.ceil(targetChunkSize * ratio);
    let readPos = 0;

    while (this._writePos - readPos >= sourceChunkSize) {
      const downsampled = new Int16Array(targetChunkSize);
      for (let i = 0; i < targetChunkSize; i++) {
        const srcIndex = readPos + Math.min(Math.floor(i * ratio), sourceChunkSize - 1);
        const clamped = Math.max(-1, Math.min(1, this._buffer[srcIndex]));
        downsampled[i] = clamped * 0x7fff;
      }
      this.port.postMessage(downsampled.buffer, [downsampled.buffer]);
      readPos += sourceChunkSize;
    }

    if (readPos > 0) {
      const remaining = this._writePos - readPos;
      if (remaining > 0) {
        this._buffer.copyWithin(0, readPos, this._writePos);
      }
      this._writePos = remaining;
    }

    return true;
  }
}

registerProcessor('${PCM_DOWNSAMPLE_PROCESSOR_NAME}', PCMDownsampleProcessor);
`;

export async function installPcmDownsampleWorklet(audioContext: AudioContext): Promise<void> {
  const blob = new Blob([PCM_DOWNSAMPLE_WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await audioContext.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
