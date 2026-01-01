import { spawn } from 'child_process';
import { createLogger } from '../../../utils/logger.js';

// Use system ffmpeg/ffprobe (Debian 12: ffmpeg 5.1.7)
const ffmpegPath = '/usr/bin/ffmpeg';
const ffprobePath = '/usr/bin/ffprobe';

const log = createLogger('ffmpeg-wrapper');

/**
 * FFmpeg command builder - replaces fluent-ffmpeg
 *
 * Usage:
 *   const cmd = new FFmpegCommand(inputPath)
 *     .inputOptions(['-vaapi_device', '/dev/dri/renderD128'])
 *     .outputOptions(['-c:v', 'libx264', '-crf', '20'])
 *     .videoFilters(['scale=1920:1080', 'subtitles=file.ass'])
 *     .on('start', (cmdLine) => console.log(cmdLine))
 *     .on('progress', ({ percent, time }) => console.log(percent))
 *     .on('error', (err) => console.error(err))
 *     .on('end', () => console.log('done'))
 *     .save(outputPath);
 */
class FFmpegCommand {
  #input;
  #inputOpts = [];
  #outputOpts = [];
  #filters = [];
  #duration = null;
  #listeners = { start: [], progress: [], error: [], end: [] };

  constructor(input) {
    this.#input = input;
  }

  inputOptions(opts) {
    if (Array.isArray(opts)) {
      this.#inputOpts.push(...opts);
    } else if (typeof opts === 'string') {
      this.#inputOpts.push(opts);
    }
    return this;
  }

  outputOptions(opts) {
    if (Array.isArray(opts)) {
      this.#outputOpts.push(...opts);
    } else if (typeof opts === 'string') {
      this.#outputOpts.push(opts);
    }
    return this;
  }

  videoFilters(filters) {
    if (Array.isArray(filters)) {
      this.#filters.push(...filters);
    } else if (typeof filters === 'string') {
      this.#filters.push(filters);
    }
    return this;
  }

  setDuration(duration) {
    this.#duration = duration;
    return this;
  }

  on(event, callback) {
    if (this.#listeners[event]) {
      this.#listeners[event].push(callback);
    }
    return this;
  }

  #emit(event, ...args) {
    for (const cb of this.#listeners[event]) {
      try {
        cb(...args);
      } catch (e) {
        log.warn(`Error in ${event} listener:`, e.message);
      }
    }
  }

  #buildArgs(output) {
    const args = [];

    // Input options (before -i)
    args.push(...this.#inputOpts);

    // Input file
    args.push('-i', this.#input);

    // Video filters
    if (this.#filters.length > 0) {
      args.push('-vf', this.#filters.join(','));
    }

    // Output options
    args.push(...this.#outputOpts);

    // Output file
    args.push(output);

    return args;
  }

  #parseProgress(data) {
    const str = data.toString();

    // Parse time: time=00:01:23.45
    const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
    if (!timeMatch) return null;

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseFloat(timeMatch[3]);
    const currentTime = hours * 3600 + minutes * 60 + seconds;

    // Parse other fields
    const frameMatch = str.match(/frame=\s*(\d+)/);
    const fpsMatch = str.match(/fps=\s*([\d.]+)/);
    const bitrateMatch = str.match(/bitrate=\s*([\d.]+)/);

    const progress = {
      time: currentTime,
      timemark: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`,
      frame: frameMatch ? parseInt(frameMatch[1], 10) : null,
      fps: fpsMatch ? parseFloat(fpsMatch[1]) : null,
      bitrate: bitrateMatch ? parseFloat(bitrateMatch[1]) : null,
      percent: null
    };

    // Calculate percent if duration is known
    if (this.#duration && this.#duration > 0) {
      progress.percent = Math.min(100, (currentTime / this.#duration) * 100);
    }

    return progress;
  }

  save(output) {
    const args = this.#buildArgs(output);
    const commandLine = `${ffmpegPath} ${args.join(' ')}`;

    this.#emit('start', commandLine);

    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      const data = chunk.toString();
      stderr += data;

      const progress = this.#parseProgress(data);
      if (progress) {
        this.#emit('progress', progress);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        this.#emit('end');
      } else {
        const errorLines = stderr.split('\n').slice(-10).join('\n');
        const error = new Error(`FFmpeg exited with code ${code}: ${errorLines}`);
        error.code = code;
        error.stderr = stderr;
        this.#emit('error', error);
      }
    });

    proc.on('error', (err) => {
      this.#emit('error', err);
    });

    return this;
  }
}

/**
 * Probe video metadata using ffprobe
 *
 * Usage:
 *   const metadata = await ffprobe(videoPath);
 *   console.log(metadata.streams, metadata.format);
 */
async function ffprobe(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath
    ];

    const proc = spawn(ffprobePath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const metadata = JSON.parse(stdout);
          resolve(metadata);
        } catch (e) {
          reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
        }
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Factory function matching fluent-ffmpeg API
 *
 * Usage:
 *   const command = ffmpeg(inputPath);
 *   // Same as: const command = new FFmpegCommand(inputPath);
 */
function ffmpeg(input) {
  return new FFmpegCommand(input);
}

// Attach ffprobe to the factory (matches fluent-ffmpeg API)
ffmpeg.ffprobe = function(inputPath, callback) {
  ffprobe(inputPath)
    .then((metadata) => callback(null, metadata))
    .catch((err) => callback(err));
};

// Set paths (compatibility with fluent-ffmpeg)
ffmpeg.setFfmpegPath = function() {
  // No-op, path is hardcoded from @ffmpeg-installer
};

ffmpeg.setFfprobePath = function() {
  // No-op, path is hardcoded from @ffprobe-installer
};

export { FFmpegCommand, ffprobe, ffmpeg, ffmpegPath, ffprobePath };