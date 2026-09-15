import fs from 'fs';

import { describe, expect, it } from 'vitest';

import { ffmpegPath } from '../../subtitler/ffmpegWrapper.js';
import { pcm16ToWav } from '../pcmCodec.js';
import { encodeSpeech } from '../speechEncoder.js';

/** One second of a 440 Hz tone at 24 kHz, the rate the provider delivers. */
function toneWav(): Buffer {
  const rate = 24000;
  const pcm = Buffer.alloc(rate * 2);
  for (let i = 0; i < rate; i++) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
  }
  return pcm16ToWav(pcm, rate);
}

const hasFfmpeg = fs.existsSync(ffmpegPath);

describe.skipIf(!hasFfmpeg)('encodeSpeech (real ffmpeg)', () => {
  it('produces an 8 kHz mono PCM16 WAV for the telephone preset', async () => {
    const { buffer, mimeType, extension } = await encodeSpeech(toneWav(), 'wav_phone');
    expect(mimeType).toBe('audio/wav');
    expect(extension).toBe('wav');
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
    // fmt chunk: audio format 1 = PCM, channels, sample rate, bits per sample.
    const fmtIndex = buffer.indexOf('fmt ');
    expect(buffer.readUInt16LE(fmtIndex + 8)).toBe(1);
    expect(buffer.readUInt16LE(fmtIndex + 10)).toBe(1);
    expect(buffer.readUInt32LE(fmtIndex + 12)).toBe(8000);
    expect(buffer.readUInt16LE(fmtIndex + 22)).toBe(16);
  });

  it('produces an MP3 stream', async () => {
    const { buffer, mimeType, extension } = await encodeSpeech(toneWav(), 'mp3');
    expect(mimeType).toBe('audio/mpeg');
    expect(extension).toBe('mp3');
    const isId3 = buffer.toString('ascii', 0, 3) === 'ID3';
    const isFrameSync = buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0;
    expect(isId3 || isFrameSync).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
