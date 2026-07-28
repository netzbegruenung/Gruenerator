import Markdown from '../../../components/common/Markdown/Markdown';
import { getSpeakerLabel, parseSpeakerBlocks } from '../utils/formatTranscript';

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

interface TranscriptionResultProps {
  text: string;
  segments: TranscriptionSegment[];
  hasTimestamps: boolean;
  formattedText?: string;
  speakerMap?: Record<string, string>;
  /** Omit to render speaker labels as plain, non-editable text. */
  onRenameSpeaker?: (speakerId: string, currentLabel: string) => void;
}

export default function TranscriptionResult({
  text,
  segments,
  hasTimestamps,
  formattedText,
  speakerMap,
  onRenameSpeaker,
}: TranscriptionResultProps) {
  if (formattedText) {
    return (
      <div className="display-container flex flex-col rounded-md bg-background-pure shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-lg max-h-[75vh] overflow-y-auto max-md:p-md max-md:shadow-none">
        <Markdown className="prose prose-sm dark:prose-invert max-w-none">{formattedText}</Markdown>
      </div>
    );
  }
  // Diarized text: parse [speaker_N] markers (check before timestamps — diarized output also has segments)
  const hasSpeakers = text.includes('[speaker_');
  if (hasSpeakers) {
    const blocks = parseSpeakerBlocks(text);

    return (
      <div className="display-container flex flex-col rounded-md bg-background-pure shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-lg max-h-[75vh] overflow-y-auto max-md:p-md max-md:shadow-none">
        {onRenameSpeaker && (
          <p className="text-xs text-grey-500 dark:text-grey-400 m-0 mb-md">
            Namen werden automatisch erkannt — zum Korrigieren auf einen Namen klicken.
          </p>
        )}
        <div className="flex flex-col gap-md">
          {blocks.map((block) => {
            const speakerIndex = parseInt(block.speaker.match(/\d+/)?.[0] ?? '0');
            const label = getSpeakerLabel(block.speaker, speakerMap);
            return (
              <div key={block.offset}>
                {block.speaker &&
                  (onRenameSpeaker ? (
                    <button
                      type="button"
                      onClick={() => onRenameSpeaker(block.speaker, label)}
                      title="Sprecher*in umbenennen"
                      className={cn(
                        'text-xs font-semibold bg-transparent border-none p-0 cursor-pointer hover:underline',
                        getSpeakerColor(speakerIndex)
                      )}
                    >
                      {label}
                    </button>
                  ) : (
                    <span className={cn('text-xs font-semibold', getSpeakerColor(speakerIndex))}>
                      {label}
                    </span>
                  ))}
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
          {segments.map((seg) => (
            <div key={`${seg.start}-${seg.end}`} className="flex gap-sm">
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
      <p className="text-sm text-foreground m-0 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}
