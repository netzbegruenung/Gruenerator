import Markdown from '../../../components/common/Markdown/Markdown';

import type { TranscriptionSegment } from '../hooks/useTranscription';

import { cn } from '@/utils/cn';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SPEAKER_COLORS = [
  'text-primary-600 dark:text-primary-400',
  'text-blue-600 dark:text-blue-400',
  'text-amber-600 dark:text-amber-400',
  'text-rose-600 dark:text-rose-400',
  'text-violet-600 dark:text-violet-400',
  'text-teal-600 dark:text-teal-400',
];

function getSpeakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function getSpeakerLabel(id: string, speakerMap?: Record<string, string>): string {
  if (speakerMap?.[id]) return speakerMap[id];
  const match = id.match(/speaker_(\d+)/);
  if (!match) return id;
  return `Sprecher*in ${parseInt(match[1]) + 1}`;
}

interface TranscriptionResultProps {
  text: string;
  segments: TranscriptionSegment[];
  hasTimestamps: boolean;
  isStreaming?: boolean;
  formattedText?: string;
  onShowOriginal?: () => void;
  speakerMap?: Record<string, string>;
}

export default function TranscriptionResult({
  text,
  segments,
  hasTimestamps,
  isStreaming,
  formattedText,
  onShowOriginal,
  speakerMap,
}: TranscriptionResultProps) {
  if (formattedText) {
    return (
      <div className="display-container flex flex-col rounded-md bg-background-pure shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-lg max-h-[75vh] overflow-y-auto max-md:p-md max-md:shadow-none">
        <Markdown className="prose prose-sm dark:prose-invert max-w-none">{formattedText}</Markdown>
        {onShowOriginal && (
          <button
            type="button"
            onClick={onShowOriginal}
            className="mt-md text-xs text-grey-400 dark:text-grey-500 hover:text-foreground transition-colors cursor-pointer"
          >
            Originaltext anzeigen
          </button>
        )}
      </div>
    );
  }
  // Diarized text: parse [speaker_N] markers (check before timestamps — diarized output also has segments)
  const hasSpeakers = text.includes('[speaker_');
  if (hasSpeakers) {
    const parts = text.split(/(\[speaker_\d+\])/g).filter(Boolean);
    let currentSpeaker = '';
    const blocks: { speaker: string; text: string }[] = [];

    for (const part of parts) {
      if (part.startsWith('[speaker_')) {
        currentSpeaker = part.slice(1, -1);
      } else {
        const trimmed = part.trim();
        if (trimmed) {
          blocks.push({ speaker: currentSpeaker, text: trimmed });
        }
      }
    }

    return (
      <div className="display-container flex flex-col rounded-md bg-background-pure shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-lg max-h-[75vh] overflow-y-auto max-md:p-md max-md:shadow-none">
        <div className="flex flex-col gap-md">
          {blocks.map((block, i) => {
            const speakerIndex = parseInt(block.speaker.match(/\d+/)?.[0] ?? '0');
            return (
              <div key={i}>
                {block.speaker && (
                  <span className={cn('text-xs font-semibold', getSpeakerColor(speakerIndex))}>
                    {getSpeakerLabel(block.speaker, speakerMap)}
                  </span>
                )}
                <p className="text-sm text-foreground m-0 mt-xs leading-relaxed">{block.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (hasTimestamps && segments.length > 0) {
    return (
      <div className="display-container flex flex-col rounded-md bg-background-pure shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-lg max-h-[75vh] overflow-y-auto max-md:p-md max-md:shadow-none">
        <div className="flex flex-col gap-sm">
          {segments.map((seg, i) => (
            <div key={i} className="flex gap-sm">
              <span className="text-xs text-grey-400 dark:text-grey-500 font-mono whitespace-nowrap pt-0.5 min-w-[5rem]">
                {formatTime(seg.start)} – {formatTime(seg.end)}
              </span>
              <p className="text-sm text-foreground m-0 leading-relaxed">{seg.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Plain text
  return (
    <div className="display-container flex flex-col rounded-md bg-background-pure shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-lg max-h-[75vh] overflow-y-auto max-md:p-md max-md:shadow-none">
      <p className="text-sm text-foreground m-0 leading-relaxed whitespace-pre-wrap">
        {text}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-primary-500 ml-0.5 animate-pulse rounded-sm" />
        )}
      </p>
    </div>
  );
}
