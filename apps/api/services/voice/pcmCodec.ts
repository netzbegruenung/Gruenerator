/**
 * PCM helpers for the text-to-speech path.
 *
 * Deliberately free of env and I/O so the conversion can be tested without a
 * network or a parsed environment — this is where the one silent failure mode
 * of the KugelAudio switch lives.
 */

/** One int16 sample is 2 bytes, and a chunk boundary can split one. */
const BYTES_PER_PCM16_SAMPLE = 2;
const EMPTY = Buffer.alloc(0);

/**
 * Streaming pcm_s16le → float32 LE converter.
 *
 * Stateful on purpose. KugelAudio answers with a raw byte stream, so a chunk
 * ends wherever the network splits it — including between the two bytes of a
 * sample. That half sample belongs to the next chunk. Converting each chunk on
 * its own drops one byte per boundary and shifts every later sample by one,
 * which does not throw: it turns speech into noise.
 *
 * float32 is our format, not KugelAudio's. `useNativeTTS.ts` in the shipped
 * mobile app does `new Float32Array(bytes.buffer)` on this payload, so the
 * conversion has to happen server-side and cannot move to the clients.
 */
export class Pcm16ToFloat32Stream {
  /** Always 0 or 1 byte — never more, since we consume whole samples. */
  #carry: Buffer = EMPTY;

  /**
   * @returns float32 LE bytes, ready for base64. Empty when the chunk held no
   * complete sample, which a one-byte read legitimately does.
   */
  push(chunk: Buffer): Buffer {
    const buf = this.#carry.length > 0 ? Buffer.concat([this.#carry, chunk]) : chunk;
    const usable = buf.length - (buf.length % BYTES_PER_PCM16_SAMPLE);

    // `subarray` is a view onto the reader's buffer, which may be reused for
    // the next read. The carry has to be a copy or it can be overwritten
    // between chunks.
    this.#carry = usable === buf.length ? EMPTY : Buffer.from(buf.subarray(usable));

    return convert(buf, usable);
  }

  /** Bytes still held back. 1 means the response ended mid-sample. */
  get pendingBytes(): number {
    return this.#carry.length;
  }
}

/**
 * One-shot equivalent of feeding everything through {@link Pcm16ToFloat32Stream}.
 * Must stay byte-identical to the streaming path under any chunking — the tests
 * pin exactly that.
 */
export function pcm16ToFloat32LE(pcm: Buffer): Buffer {
  return convert(pcm, pcm.length - (pcm.length % BYTES_PER_PCM16_SAMPLE));
}

function convert(buf: Buffer, usable: number): Buffer {
  const samples = usable / BYTES_PER_PCM16_SAMPLE;
  const out = Buffer.allocUnsafe(samples * 4);

  for (let i = 0; i < samples; i++) {
    // 32768 matches `base64PCM16ToFloat32` in packages/voice/src/lib/pcmUtils.ts,
    // so server and client agree on the scale.
    out.writeFloatLE(buf.readInt16LE(i * BYTES_PER_PCM16_SAMPLE) / 32768, i * 4);
  }

  return out;
}

/**
 * Wraps raw PCM16 in a canonical 44-byte RIFF/WAVE header.
 *
 * No resampling and no re-quantising: a 16-bit WAV stores exactly the bytes
 * KugelAudio already returned, so this only prepends a header. Mirrors
 * `float32ToWavBlob` in packages/voice/src/lib/pcmUtils.ts field for field.
 */
export function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
