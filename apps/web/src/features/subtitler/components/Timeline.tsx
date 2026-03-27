import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

import { cn } from '@/utils/cn';

interface SubtitleSegment {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  segments: SubtitleSegment[];
  selectedSegmentId: number | null;
  onSeek: (time: number) => void;
  onSegmentClick: (segmentId: number) => void;
  onTextChange: (segmentId: number, text: string) => void;
}

const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  segments,
  selectedSegmentId,
  onSeek,
  onSegmentClick,
  onTextChange,
}) => {
  const segmentRefs = useRef<Record<number, HTMLDivElement>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const wasScrubbingRef = useRef(false);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activeSegmentId = useMemo((): number | null => {
    const active = segments.find(
      (seg: SubtitleSegment) => currentTime >= seg.startTime && currentTime <= seg.endTime
    );
    return active ? active.id : null;
  }, [segments, currentTime]);

  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile && activeSegmentId !== null && segmentRefs.current[activeSegmentId]) {
      segmentRefs.current[activeSegmentId].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeSegmentId]);

  useEffect(() => {
    if (editingSegmentId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSegmentId]);

  const handleScrubStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (editingSegmentId !== null) return;
      wasScrubbingRef.current = false;
      setIsDragging(true);
    },
    [editingSegmentId]
  );

  const handleScrubMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const element = document.elementFromPoint(clientX, clientY);
      const segmentEl = element?.closest('[data-segment-id]');

      if (segmentEl) {
        const segmentId = parseInt((segmentEl as HTMLElement).dataset.segmentId || '0', 10);
        const segment = segments.find((s: SubtitleSegment) => s.id === segmentId);

        if (segment) {
          const rect = segmentEl.getBoundingClientRect();
          const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const segmentDuration = segment.endTime - segment.startTime;
          const seekTime = segment.startTime + relativeX * segmentDuration;

          wasScrubbingRef.current = true;
          onSeek(seekTime);
        }
      }
    },
    [isDragging, segments, onSeek]
  );

  const handleScrubEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => handleScrubMove(e);
    const onEnd = () => handleScrubEnd();

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [isDragging, handleScrubMove, handleScrubEnd]);

  const handleSegmentClick = useCallback(
    (e: React.MouseEvent, segment: SubtitleSegment) => {
      e.stopPropagation();
      if (wasScrubbingRef.current) {
        wasScrubbingRef.current = false;
        return;
      }
      onSegmentClick(segment.id);
      onSeek(segment.startTime);
      setEditingSegmentId(segment.id);
    },
    [onSegmentClick, onSeek]
  );

  const handleSegmentKeyDown = useCallback(
    (e: React.KeyboardEvent, currentSegmentId: number) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = segments.findIndex((s: SubtitleSegment) => s.id === currentSegmentId);
        let targetIndex: number;
        if (e.shiftKey) {
          targetIndex = currentIndex > 0 ? currentIndex - 1 : segments.length - 1;
        } else {
          targetIndex = currentIndex < segments.length - 1 ? currentIndex + 1 : 0;
        }
        const targetSegment = segments[targetIndex];
        onSegmentClick(targetSegment.id);
        onSeek(targetSegment.startTime);
        if (segmentRefs.current[targetSegment.id]) {
          segmentRefs.current[targetSegment.id].focus();
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        setEditingSegmentId(currentSegmentId);
      }
    },
    [segments, onSegmentClick, onSeek]
  );

  const handleInputBlur = useCallback(() => {
    setEditingSegmentId(null);
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent, currentSegmentId: number) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        setEditingSegmentId(null);
      }
      if (e.key === 'Escape') {
        setEditingSegmentId(null);
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = segments.findIndex((s: SubtitleSegment) => s.id === currentSegmentId);
        if (e.shiftKey) {
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : segments.length - 1;
          setEditingSegmentId(segments[prevIndex].id);
        } else {
          const nextIndex = currentIndex < segments.length - 1 ? currentIndex + 1 : 0;
          setEditingSegmentId(segments[nextIndex].id);
        }
      }
    },
    [segments]
  );

  if (duration <= 0) {
    return (
      <div className="flex w-full flex-col gap-xs rounded-lg border border-grey-200 bg-background p-sm dark:border-grey-700">
        <div className="py-lg text-center text-sm text-grey-400">Lade Timeline...</div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-xs rounded-lg border border-grey-200 bg-background p-sm dark:border-grey-700">
      <div className="grid max-h-[350px] grid-cols-3 gap-3 overflow-y-auto p-sm max-md:max-h-[250px] max-md:grid-cols-1 max-md:gap-2">
        {segments.map((segment: SubtitleSegment) => {
          const isActive = activeSegmentId === segment.id;
          const isSelected = selectedSegmentId === segment.id;
          const isEditing = editingSegmentId === segment.id;
          return (
            <div
              key={segment.id}
              ref={(el: HTMLDivElement | null) => {
                if (el) segmentRefs.current[segment.id] = el;
              }}
              data-segment-id={segment.id}
              className={cn(
                'relative flex cursor-pointer select-none items-center gap-3 rounded-lg border px-5 py-4 transition-all',
                'border-grey-200 bg-background-alt dark:border-grey-700 dark:bg-grey-800',
                'hover:border-primary-300 hover:bg-grey-100 dark:hover:bg-grey-700',
                isActive &&
                  'border-primary-500 bg-primary-50 ring-2 ring-primary-500/15 dark:bg-grey-700',
                isSelected && 'outline-2 outline-primary-500 outline-offset-2',
                isEditing && 'border-primary-500 p-0'
              )}
              tabIndex={0}
              onClick={(e: React.MouseEvent) => handleSegmentClick(e, segment)}
              onKeyDown={(e: React.KeyboardEvent) =>
                !isEditing && handleSegmentKeyDown(e, segment.id)
              }
              onMouseDown={handleScrubStart}
              onTouchStart={handleScrubStart}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  className="min-w-0 flex-1 rounded-lg border-none bg-background px-5 py-4 font-inherit text-[1.05rem] font-medium leading-relaxed text-foreground outline-none"
                  value={segment.text}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onTextChange(segment.id, e.target.value)
                  }
                  onBlur={handleInputBlur}
                  onKeyDown={(e: React.KeyboardEvent) => handleInputKeyDown(e, segment.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 text-[1.05rem] font-medium leading-relaxed text-foreground">
                  {segment.text}
                </span>
              )}
              <span className="absolute right-2 top-1.5 font-mono text-[0.65rem] font-medium text-foreground opacity-60">
                {formatTime(segment.startTime)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;
