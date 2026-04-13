import type { SubtitleChunk } from '../types/subtitle';

interface ExportableChunk extends SubtitleChunk {
  deleted?: boolean;
}

function formatSubtitleTime(seconds: number, msSeparator: string): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}${msSeparator}${ms.toString().padStart(3, '0')}`;
}

function formatChunks(chunks: ExportableChunk[], msSeparator: string): string {
  return chunks
    .filter((c) => !c.deleted && c.text.trim())
    .map((chunk, i) => {
      const start = formatSubtitleTime(chunk.timestamp[0], msSeparator);
      const end = formatSubtitleTime(chunk.timestamp[1], msSeparator);
      return `${i + 1}\n${start} --> ${end}\n${chunk.text}`;
    })
    .join('\n\n');
}

export function chunksToSRT(chunks: ExportableChunk[]): string {
  return formatChunks(chunks, ',');
}

export function chunksToVTT(chunks: ExportableChunk[]): string {
  return `WEBVTT\n\n${formatChunks(chunks, '.')}`;
}
