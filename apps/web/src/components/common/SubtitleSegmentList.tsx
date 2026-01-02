import { JSX, useState, useRef, useEffect } from 'react';

import './SubtitleSegmentList.css';

interface SubtitleSegmentListProps {
  segments: {
    id?: number;
    startTime?: number;
    endTime: number;
    text: string
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

const SubtitleSegmentList = ({ segments,
  currentTime,
  selectedSegmentId,
  correctedSegmentIds = new Set<number>(),
  onSegmentClick,
  onTextChange,
  onSeek,
  formatTime,
  columns = 3 }: SubtitleSegmentListProps): JSX.Element => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const segmentRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const getActiveSegmentId = () => {
    const active = segments.find(s => currentTime >= s.startTime && currentTime < s.endTime);
    return active?.id ?? null;
  };

  const activeSegmentId = getActiveSegmentId();

  const handleSegmentClick = (segment) => {
    setEditingId(segment.id);
    onSegmentClick?.(segment.id);
    onSeek?.(segment.startTime);
  };

  const handleInputBlur = () => {
    setEditingId(null);
  };

  const handleInputKeyDown = (e) => {
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

  const defaultFormatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  const timeFormatter = formatTime || defaultFormatTime;

  return (
    <div
      className="subtitle-segment-list"
      style={{ '--columns': columns }}
    >
      {segments.map((segment) => {
        const isActive = activeSegmentId === segment.id;
        const isSelected = selectedSegmentId === segment.id;
        const isEditing = editingId === segment.id;
        const isCorrected = correctedSegmentIds.has(segment.id);

        return (
          <div
            key={segment.id}
            ref={(el: HTMLDivElement | null) => { if (segment.id !== undefined) segmentRefs.current[segment.id] = el; }}
            className={`subtitle-segment ${isActive ? 'subtitle-segment--active' : ''} ${isSelected ? 'subtitle-segment--selected' : ''} ${isEditing ? 'subtitle-segment--editing' : ''} ${isCorrected ? 'subtitle-segment--corrected' : ''}`}
            onClick={() => handleSegmentClick(segment)}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                className="subtitle-segment__input"
                value={segment.text}
                onChange={(e) => onTextChange?.(segment.id, e.target.value)}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="subtitle-segment__text">{segment.text}</span>
            )}
            <span className="subtitle-segment__time">
              {timeFormatter(segment.startTime)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default SubtitleSegmentList;
