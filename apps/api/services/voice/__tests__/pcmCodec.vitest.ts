import { describe, expect, it } from 'vitest';

import { Pcm16ToFloat32Stream, pcm16ToFloat32LE, pcm16ToWav } from '../pcmCodec.js';

/** Endpoints and awkward middles — the values most likely to expose a bad shift. */
const SAMPLES = [0, 1, -1, 32767, -32768, 1234, -4321, 999, -12345, 7];

const pcm = Buffer.alloc(SAMPLES.length * 2);
SAMPLES.forEach((value, i) => pcm.writeInt16LE(value, i * 2));

const whole = pcm16ToFloat32LE(pcm);

function feed(chunks: Buffer[]): { audio: Buffer; codec: Pcm16ToFloat32Stream } {
  const codec = new Pcm16ToFloat32Stream();
  return { audio: Buffer.concat(chunks.map((chunk) => codec.push(chunk))), codec };
}

describe('Pcm16ToFloat32Stream', () => {
  // KugelAudio answers with a raw byte stream, so the chunking is the network's
  // choice, not ours. Every split has to produce the same audio.
  it('reproduces the one-shot result at every chunk size, down to one byte', () => {
    for (let size = 1; size <= pcm.length; size++) {
      const chunks: Buffer[] = [];
      for (let i = 0; i < pcm.length; i += size) {
        chunks.push(pcm.subarray(i, Math.min(i + size, pcm.length)));
      }
      const { audio, codec } = feed(chunks);
      expect(audio, `chunk size ${size}`).toEqual(whole);
      expect(codec.pendingBytes, `chunk size ${size}`).toBe(0);
    }
  });

  it('reproduces the one-shot result across ragged splits', () => {
    const splits = [
      [3, 3, 4],
      [1, 9],
      [7, 1, 2],
      [pcm.length - 1, 1],
      [1, 1, 1, 17],
    ];

    for (const split of splits) {
      const chunks: Buffer[] = [];
      let offset = 0;
      for (const size of split) {
        chunks.push(pcm.subarray(offset, offset + size));
        offset += size;
      }
      if (offset < pcm.length) chunks.push(pcm.subarray(offset));
      expect(feed(chunks).audio, `split ${split.join('/')}`).toEqual(whole);
    }
  });

  // The regression this class exists for. Without the carry the second half of
  // the straddling sample is dropped and every later sample shifts by one byte
  // — which throws nothing and simply sounds like noise.
  it('keeps a sample that straddles a chunk boundary intact', () => {
    const codec = new Pcm16ToFloat32Stream();

    const first = codec.push(pcm.subarray(0, 3));
    expect(first.length / 4).toBe(1);
    expect(codec.pendingBytes).toBe(1);

    const second = codec.push(pcm.subarray(3, 6));
    expect(second.length / 4).toBe(2);

    expect(Buffer.concat([first, second]).readFloatLE(4)).toBe(whole.readFloatLE(4));
  });

  // The held-back byte must be a copy: the stream reader is free to recycle the
  // buffer it handed us for the next read.
  it('survives the caller reusing the backing buffer of a chunk', () => {
    const view = new Uint8Array(new ArrayBuffer(3));
    view.set(pcm.subarray(0, 3));

    const codec = new Pcm16ToFloat32Stream();
    const first = codec.push(Buffer.from(view));
    view.fill(0xff);
    const second = codec.push(pcm.subarray(3, 6));

    expect(Buffer.concat([first, second])).toEqual(whole.subarray(0, 12));
  });

  it('holds back a truncated tail rather than padding a sample', () => {
    const codec = new Pcm16ToFloat32Stream();
    expect(codec.push(pcm.subarray(0, 7)).length / 4).toBe(3);
    expect(codec.pendingBytes).toBe(1);
  });

  it('scales by 32768, matching base64PCM16ToFloat32 on the client', () => {
    expect(whole.readFloatLE(4 * 4)).toBe(-1);
    expect(whole.readFloatLE(0)).toBe(0);
    expect(whole.readFloatLE(3 * 4)).toBe(32767 / 32768);
  });
});

describe('pcm16ToWav', () => {
  it('writes a header that describes the payload it carries', () => {
    const wav = pcm16ToWav(pcm, 24000);

    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length);
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(28)).toBe(24000 * 2);
    expect(wav.readUInt16LE(32)).toBe(2);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  // PCM16 is already what a 16-bit WAV stores — nothing is re-quantised.
  it('leaves the payload byte-identical', () => {
    expect(pcm16ToWav(pcm, 24000).subarray(44)).toEqual(pcm);
  });
});
