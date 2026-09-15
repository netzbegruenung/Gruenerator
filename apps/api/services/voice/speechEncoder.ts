import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { type SpeechMimeType, type SpeechOutputFormat } from '@gruenerator/contracts';

import { ffmpeg } from '../subtitler/ffmpegWrapper.js';

export interface EncodedSpeech {
  buffer: Buffer;
  mimeType: SpeechMimeType;
  extension: 'mp3' | 'wav';
}

/**
 * KugelAudio hands back raw PCM; the files people download are made here.
 *
 * `mp3`: mono speech at 44.1 kHz so old players do not trip over MPEG-2 LSF,
 * constant bitrate for predictable file sizes.
 * `wav_phone`: 8 kHz mono PCM16 — what Fritz!Box, Asterisk and 3CX document
 * as the greeting format. 16 kHz "HD voice" is rejected by many boxes.
 */
const ENCODINGS: Record<
  SpeechOutputFormat,
  { args: string[]; mimeType: EncodedSpeech['mimeType']; extension: EncodedSpeech['extension'] }
> = {
  mp3: {
    args: ['-vn', '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k'],
    mimeType: 'audio/mpeg',
    extension: 'mp3',
  },
  wav_phone: {
    args: ['-vn', '-ar', '8000', '-ac', '1', '-c:a', 'pcm_s16le'],
    mimeType: 'audio/wav',
    extension: 'wav',
  },
};

export async function encodeSpeech(
  wav: Buffer,
  format: SpeechOutputFormat
): Promise<EncodedSpeech> {
  const { args, mimeType, extension } = ENCODINGS[format];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-'));
  try {
    const input = path.join(dir, 'input.wav');
    const output = path.join(dir, `output.${extension}`);
    await fs.writeFile(input, wav);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input)
        .outputOptions([...args, '-y'])
        .save(output)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });
    return { buffer: await fs.readFile(output), mimeType, extension };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
