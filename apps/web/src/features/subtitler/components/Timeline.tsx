import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import '../styles/SubtitleEditor.css';

const Timeline = ({
  duration,
  currentTime,
  segments,
  selectedSegmentId,
  correctedSegmentIds = new Set(),
  onSeek,
  onSegmentClick,
  onTextChange,
}) => {
  const segmentRefs = useRef({});
  const inputRef = useRef(null);
  const [editingSegmentId, setEditingSegmentId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const wasScrubbingRef = useRef(false);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activeSegmentId = useMemo(() => {
    const active = segments.find(
      seg => currentTime >= seg.startTime && currentTime <= seg.endTime
    );
    return active ? active.id : null;
  }, [segments, currentTime]);

  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile && activeSegmentId !== null && segmentRefs.current[activeSegmentId]) {
      segmentRefs.current[activeSegmentId].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [activeSegmentId]);

  useEffect(() => {
    if (editingSegmentId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSegmentId]);

  const handleScrubStart = useCallback((e) => {
    if (editingSegmentId !== null) return;
    wasScrubbingRef.current = false;
    setIsDragging(true);
  }, [editingSegmentId]);

  const handleScrubMove = useCallback((e) => {
    if (!isDragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;

    const element = document.elementFromPoint(clientX, e.touches ? e.touches[0].clientY : e.clientY);
    const segmentEl = element?.closest('.timeline-segment');

    if (segmentEl) {
      const segmentId = parseInt(segmentEl.dataset.segmentId, 10);
      const segment = segments.find(s => s.id === segmentId);

      if (segment) {
        const rect = segmentEl.getBoundingClientRect();
        const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const segmentDuration = segment.endTime - segment.startTime;
        const seekTime = segment.startTime + (relativeX * segmentDuration);

        wasScrubbingRef.current = true;
        onSeek(seekTime);
      }
    }
  }, [isDragging, segments, onSeek]);

  const handleScrubEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e) => handleScrubMove(e);
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

  const handleSegmentClick = useCallback((e, segment) => {
    e.stopPropagation();
    if (wasScrubbingRef.current) {
      wasScrubbingRef.current = false;
      return;
    }
    onSegmentClick(segment.id);
    onSeek(segment.startTime);
    setEditingSegmentId(segment.id);
  }, [onSegmentClick, onSeek]);

  const handleSegmentKeyDown = useCallback((e, currentSegmentId) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const currentIndex = segments.findIndex(s => s.id === currentSegmentId);
      let targetIndex;
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
  }, [segments, onSegmentClick, onSeek]);

  const handleInputBlur = useCallback(() => {
    setEditingSegmentId(null);
  }, []);

  const handleInputKeyDown = useCallback((e, currentSegmentId) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setEditingSegmentId(null);
    }
    if (e.key === 'Escape') {
      setEditingSegmentId(null);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const currentIndex = segments.findIndex(s => s.id === currentSegmentId);
      if (e.shiftKey) {
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : segments.length - 1;
        setEditingSegmentId(segments[prevIndex].id);
      } else {
        const nextIndex = currentIndex < segments.length - 1 ? currentIndex + 1 : 0;
        setEditingSegmentId(segments[nextIndex].id);
      }
    }
  }, [segments]);

  if (duration <= 0) {
    return (
      <div className="timeline-container">
        <div className="timeline-loading">Lade Timeline...</div>
      </div>
    );
  }

  return (
    <div className="timeline-container">
      <div className="timeline-track">
        {segments.map(segment => {
          const isActive = activeSegmentId === segment.id;
          const isSelected = selectedSegmentId === segment.id;
          const isEditing = editingSegmentId === segment.id;
          const isCorrected = correctedSegmentIds.has(segment.id);

          return (
            <div
              key={segment.id}
              ref={el => segmentRefs.current[segment.id] = el}
              data-segment-id={segment.id}
              className={`timeline-segment ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''} ${isCorrected ? 'corrected' : ''}`}
              tabIndex={0}
              onClick={(e) => handleSegmentClick(e, segment)}
              onKeyDown={(e) => !isEditing && handleSegmentKeyDown(e, segment.id)}
              onMouseDown={handleScrubStart}
              onTouchStart={handleScrubStart}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  className="segment-text-input"
                  value={segment.text}
                  onChange={(e) => onTextChange(segment.id, e.target.value)}
                  onBlur={handleInputBlur}
                  onKeyDown={(e) => handleInputKeyDown(e, segment.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="segment-text">{segment.text}</span>
              )}
              <span className="segment-time">{formatTime(segment.startTime)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;
