/**
 * FFmpeg Wrapper
 *
 * Custom FFmpeg command builder replacing fluent-ffmpeg.
 */

import { spawn } from 'child_process';

import { createLogger } from '../../utils/logger.js';

export const ffmpegPath = '/usr/bin/ffmpeg';
export const ffprobePath = '/usr/bin/ffprobe';

const log = createLogger('ffmpeg-wrapper');

type EventType = 'start' | 'progress' | 'error' | 'end';

interface FFmpegProgress {
  time: number;
  timemark: string;
  frame: number | null;
  fps: number | null;
  bitrate: number | null;
  percent: number | null;
}

interface FFprobeStream {
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  display_aspect_ratio?: string;
  sample_aspect_ratio?: string;
  pix_fmt?: string;
  profile?: string;
  level?: number;
  bit_rate?: string;
  rotation?: string;
  tags?: { rotate?: string };
}

interface FFprobeFormat {
  duration?: string;
  bit_rate?: string;
  [key: string]: any;
}

interface FFprobeMetadata {
  streams: FFprobeStream[];
  format: FFprobeFormat;
}

class FFmpegCommand {
  private inputs: string[] = [];
  private inputOpts: string[] = [];
  private outputOpts: string[] = [];
  private filters: string[] = [];
  private duration: number | null = null;
  private listeners: Record<EventType, Array<(...args: any[]) => void>> = {
    start: [],
    progress: [],
    error: [],
    end: [],
  };

  constructor(input?: string) {
    if (input) {
      this.inputs.push(input);
    }
  }

  input(inputPath: string): this {
    this.inputs.push(inputPath);
    return this;
  }

  inputOptions(opts: string | string[]): this {
    if (Array.isArray(opts)) {
      this.inputOpts.push(...opts);
    } else {
      this.inputOpts.push(opts);
    }
    return this;
  }

  outputOptions(opts: string | string[]): this {
    if (Array.isArray(opts)) {
      this.outputOpts.push(...opts);
    } else {
      this.outputOpts.push(opts);
    }
    return this;
  }

  videoFilters(filters: string | string[]): this {
    if (Array.isArray(filters)) {
      this.filters.push(...filters);
    } else {
      this.filters.push(filters);
    }
    return this;
  }

  setDuration(duration: number): this {
    this.duration = duration;
    return this;
  }

  on(event: EventType, callback: (...args: any[]) => void): this {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  private emit(event: EventType, ...args: any[]): void {
    for (const cb of this.listeners[event]) {
      try {
        cb(...args);
      } catch (e: any) {
        log.warn(`Error in ${event} listener:`, e.message);
      }
    }
  }

  private buildArgs(output: string): string[] {
    const args: string[] = [];
    args.push(...this.inputOpts);
    for (const input of this.inputs) {
      args.push('-i', input);
    }
    if (this.filters.length > 0) {
      args.push('-vf', this.filters.join(','));
    }
    args.push(...this.outputOpts);
    args.push(output);
    return args;
  }

  private parseProgress(data: string): FFmpegProgress | null {
    const timeMatch = data.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
    if (!timeMatch) return null;

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseFloat(timeMatch[3]);
    const currentTime = hours * 3600 + minutes * 60 + seconds;

    const frameMatch = data.match(/frame=\s*(\d+)/);
    const fpsMatch = data.match(/fps=\s*([\d.]+)/);
    const bitrateMatch = data.match(/bitrate=\s*([\d.]+)/);

    const progress: FFmpegProgress = {
      time: currentTime,
      timemark: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`,
      frame: frameMatch ? parseInt(frameMatch[1], 10) : null,
      fps: fpsMatch ? parseFloat(fpsMatch[1]) : null,
      bitrate: bitrateMatch ? parseFloat(bitrateMatch[1]) : null,
      percent: null,
    };

    if (this.duration && this.duration > 0) {
      progress.percent = Math.min(100, (currentTime / this.duration) * 100);
    }

    return progress;
  }

  save(output: string): this {
    const args = this.buildArgs(output);
    const commandLine = `${ffmpegPath} ${args.join(' ')}`;

    this.emit('start', commandLine);

    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      stderr += data;
      const progress = this.parseProgress(data);
      if (progress) {
        this.emit('progress', progress);
      }
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        this.emit('end');
      } else {
        const errorLines = stderr.split('\n').slice(-10).join('\n');
        const error = new Error(`FFmpeg exited with code ${code}: ${errorLines}`) as Error & {
          code: number | null;
          stderr: string;
        };
        error.code = code;
        error.stderr = stderr;
        this.emit('error', error);
      }
    });

    proc.on('error', (err: Error) => {
      this.emit('error', err);
    });

    return this;
  }
}

async function ffprobe(inputPath: string): Promise<FFprobeMetadata> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ];
    const proc = spawn(ffprobePath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e: any) {
          reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
        }
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

interface FFmpegFactory {
  (input?: string): FFmpegCommand;
  ffprobe: (
    inputPath: string,
    callback: (err: Error | null, metadata?: FFprobeMetadata) => void
  ) => void;
  setFfmpegPath: () => void;
  setFfprobePath: () => void;
}

const ffmpeg: FFmpegFactory = Object.assign((input?: string) => new FFmpegCommand(input), {
  ffprobe: (
    inputPath: string,
    callback: (err: Error | null, metadata?: FFprobeMetadata) => void
  ) => {
    ffprobe(inputPath)
      .then((metadata) => callback(null, metadata))
      .catch((err) => callback(err));
  },
  setFfmpegPath: () => {},
  setFfprobePath: () => {},
});

export { FFmpegCommand, ffprobe, ffmpeg };
export type { FFmpegProgress, FFprobeMetadata, FFprobeStream, FFprobeFormat };
