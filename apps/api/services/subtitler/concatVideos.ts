/**
 * Several uploads, in the order the person sorted them on /video, become one
 * video before subtitling. Every part is scaled into the first one's frame
 * (letterboxed, not cropped) at 30 fps with stereo audio; a part without sound
 * gets silence, so concat always sees matching streams.
 */
import { ffmpeg, ffprobe } from './ffmpegWrapper.js';
import { probeVideoMetadata } from './videoMetadata.js';

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export interface ConcatResult {
  /** Length of each part in seconds, in output order. */
  partDurations: number[];
}

export function buildConcatFilter(
  parts: { hasAudio: boolean; duration: number }[],
  width: number,
  height: number
): string {
  const chains = parts.map((part, i) => {
    const video = `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`;
    const audio = part.hasAudio
      ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${part.duration.toFixed(3)}[a${i}]`;
    return `${video};${audio}`;
  });
  const inputs = parts.map((_, i) => `[v${i}][a${i}]`).join('');
  return `${chains.join(';')};${inputs}concat=n=${parts.length}:v=1:a=1[v][a]`;
}

export async function concatVideos(inputs: string[], output: string): Promise<ConcatResult> {
  const parts = await Promise.all(
    inputs.map(async (input) => {
      const [meta, probe] = await Promise.all([probeVideoMetadata(input), ffprobe(input)]);
      return {
        width: meta.width,
        height: meta.height,
        duration: Number(meta.duration) || 0,
        hasAudio: probe.streams.some((s) => s.codec_type === 'audio'),
      };
    })
  );
  const width = even(parts[0].width);
  const height = even(parts[0].height);

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg();
    for (const input of inputs) command.input(input);
    command
      .outputOptions([
        '-filter_complex',
        buildConcatFilter(parts, width, height),
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-movflags',
        '+faststart',
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(output);
  });

  return { partDurations: parts.map((p) => p.duration) };
}
