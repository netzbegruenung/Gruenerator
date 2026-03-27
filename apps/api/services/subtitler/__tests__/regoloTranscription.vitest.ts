import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { transcribeWithRegolo } from '../regoloTranscriptionService.js';

const HAS_REGOLO_KEY = !!process.env.REGOLO_API_KEY;

describe('Regolo transcription — unit tests', () => {
  it('throws when REGOLO_API_KEY is not set', async () => {
    const origKey = process.env.REGOLO_API_KEY;
    delete process.env.REGOLO_API_KEY;
    try {
      await expect(transcribeWithRegolo('/tmp/nonexistent.mp3')).rejects.toThrow('REGOLO_API_KEY');
    } finally {
      if (origKey) process.env.REGOLO_API_KEY = origKey;
    }
  });
});

describe.skipIf(!HAS_REGOLO_KEY)(
  'Regolo transcription — integration tests (requires REGOLO_API_KEY)',
  () => {
    it('transcribes a generated WAV file with word timestamps', async () => {
      const sampleRate = 16000;
      const duration = 2;
      const numSamples = sampleRate * duration;
      const buffer = Buffer.alloc(44 + numSamples * 2);

      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(36 + numSamples * 2, 4);
      buffer.write('WAVE', 8);
      buffer.write('fmt ', 12);
      buffer.writeUInt32LE(16, 16);
      buffer.writeUInt16LE(1, 20);
      buffer.writeUInt16LE(1, 22);
      buffer.writeUInt32LE(sampleRate, 24);
      buffer.writeUInt32LE(sampleRate * 2, 28);
      buffer.writeUInt16LE(2, 32);
      buffer.writeUInt16LE(16, 34);
      buffer.write('data', 36);
      buffer.writeUInt32LE(numSamples * 2, 40);

      for (let i = 0; i < numSamples; i++) {
        const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000;
        buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
      }

      const tempPath = path.join('/tmp', `regolo_test_${Date.now()}.wav`);
      fs.writeFileSync(tempPath, buffer);

      try {
        const result = await transcribeWithRegolo(tempPath, true);
        expect(result).toHaveProperty('text');
        expect(typeof result.text).toBe('string');
        console.log(`  Transcription text: "${result.text.substring(0, 100)}"`);
        console.log(`  Word timestamps: ${result.words?.length ?? 0}`);
      } finally {
        fs.unlinkSync(tempPath);
      }
    }, 30000);
  }
);
