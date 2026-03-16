import { type JSX, useState, useRef, useEffect } from 'react';

import { cn } from '../../utils/cn';

/* Keyframes for segment correction highlight — injected once via <style> */
const correctionKeyframes = `
@keyframes segmentCorrectionHighlight {
  0% { background: var(--klee, #46962b); box-shadow: 0 0 0 3px rgba(70, 150, 43, 0.3); }
  100% { background: var(--background-color-secondary, #f5f5f5); box-shadow: none; }
}`;

interface SubtitleSegmentListProps {
  segments: {
    id?: number;
    startTime?: number;
    endTime: number;
    text: string;
  }[];
  currentTime?: number;
  selectedSegmentId?: number;
  correctedSegmentIds?: Set<number>;
  onSegmentClick?: (id: number) => void;
  onTextChange?: (id: number, text: string) => void;
  onSeek?: (time: number) => void;
  formatTime?: (seconds: number) => string;
  columns?: number;
}

const SubtitleSegmentList = ({
  segments,
  currentTime,
  selectedSegmentId,
  correctedSegmentIds = new Set<number>(),
  onSegmentClick,
  onTextChange,
  onSeek,
  formatTime,
  columns = 3,
}: SubtitleSegmentListProps): JSX.Element => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const segmentRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const getActiveSegmentId = () => {
    if (currentTime === undefined) return null;
    const active = segments.find(
      (s) => s.startTime !== undefined && currentTime >= s.startTime && currentTime < s.endTime
    );
    return active?.id ?? null;
  };

  const activeSegmentId = getActiveSegmentId();

  const handleSegmentClick = (segment: SubtitleSegmentListProps['segments'][number]) => {
    if (segment.id !== undefined) {
      setEditingId(segment.id);
      onSegmentClick?.(segment.id);
    }
    onSeek?.(segment.startTime || 0);
  };

  const handleInputBlur = () => {
    setEditingId(null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setEditingId(null);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const defaultFormatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  const timeFormatter = formatTime || defaultFormatTime;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: correctionKeyframes }} />
      <div
        className={cn(
          'grid gap-sm max-h-[280px] max-md:max-h-[200px] max-md:!grid-cols-1 overflow-y-auto p-sm',
        'bg-background dark:bg-background border border-grey-200 dark:border-grey-700 rounded-sm'
      )}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
      }}
    >
      {segments.map((segment) => {
        const isActive = activeSegmentId === segment.id;
        const isSelected = selectedSegmentId === segment.id;
        const isEditing = editingId === segment.id;
        const isCorrected = segment.id !== undefined && correctedSegmentIds.has(segment.id);

        return (
          <div
            key={segment.id}
            ref={(el: HTMLDivElement | null) => {
              if (segment.id !== undefined) segmentRefs.current[segment.id] = el;
            }}
            className={cn(
              'relative p-sm pr-[50px] cursor-pointer',
              'bg-background-alt dark:bg-background-alt border border-grey-200 dark:border-grey-700 rounded-sm',
              'transition-[background-color,border-color] duration-150 ease-in-out',
              'hover:bg-grey-200 dark:hover:bg-grey-800',
              isActive && 'bg-[rgba(70,150,43,0.15)] border-[var(--klee)]',
              isSelected && 'outline-2 outline-[var(--tanne)] -outline-offset-2',
              isEditing && 'border-[var(--klee)] shadow-[0_0_0_2px_rgba(70,150,43,0.2)]',
              isCorrected && 'animate-[segmentCorrectionHighlight_2s_ease-out]'
            )}
            onClick={() => handleSegmentClick(segment)}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                className={cn(
                  'w-full p-[4px] border border-[var(--klee)] rounded-[4px]',
                  'text-[13px] font-[inherit]',
                  'bg-background dark:bg-background text-foreground',
                  'focus:outline-none focus:shadow-[0_0_0_2px_rgba(70,150,43,0.2)]'
                )}
                value={segment.text}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  segment.id !== undefined && onTextChange?.(segment.id, e.target.value)
                }
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
            ) : (
              <span className="block text-[13px] leading-snug text-foreground break-words">
                {segment.text}
              </span>
            )}
            <span className="absolute top-[4px] right-[6px] text-[10px] font-mono text-grey-400 opacity-70">
              {timeFormatter(segment.startTime || 0)}
            </span>
          </div>
        );
      })}
    </div>
    </>
  );
};

export default SubtitleSegmentList;
