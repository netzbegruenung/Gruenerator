import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import '../styles/SubtitleEditor.css';

const Timeline = ({
  duration,
  currentTime,
  segments,
  selectedSegmentId,
  correctedSegmentIds = new Set(),
  onSeek,
  onSegmentClick,
  onTextChange
}) => {
  const segmentRefs = useRef({});
  const inputRef = useRef(null);
  const [editingSegmentId, setEditingSegmentId] = useState(null);
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

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
    if (activeSegmentId !== null && segmentRefs.current[activeSegmentId]) {
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

  const handleSegmentClick = useCallback((e, segment) => {
    e.stopPropagation();
    onSegmentClick(segment.id);
    onSeek(segment.startTime);
    if (isTouchDevice) {
      setEditingSegmentId(segment.id);
    } else if (segmentRefs.current[segment.id]) {
      segmentRefs.current[segment.id].focus();
    }
  }, [onSegmentClick, onSeek, isTouchDevice]);

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
      // Focus the target segment
      if (segmentRefs.current[targetSegment.id]) {
        segmentRefs.current[targetSegment.id].focus();
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditingSegmentId(currentSegmentId);
    }
  }, [segments, onSegmentClick, onSeek]);

  const handleDoubleClick = useCallback((e, segment) => {
    e.stopPropagation();
    setEditingSegmentId(segment.id);
  }, []);

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
              className={`timeline-segment ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''} ${isCorrected ? 'corrected' : ''}`}
              tabIndex={0}
              onClick={(e) => handleSegmentClick(e, segment)}
              onDoubleClick={(e) => handleDoubleClick(e, segment)}
              onKeyDown={(e) => !isEditing && handleSegmentKeyDown(e, segment.id)}
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

Timeline.propTypes = {
  duration: PropTypes.number.isRequired,
  currentTime: PropTypes.number.isRequired,
  segments: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    startTime: PropTypes.number.isRequired,
    endTime: PropTypes.number.isRequired,
    text: PropTypes.string.isRequired,
  })).isRequired,
  selectedSegmentId: PropTypes.number,
  correctedSegmentIds: PropTypes.instanceOf(Set),
  onSeek: PropTypes.func.isRequired,
  onSegmentClick: PropTypes.func.isRequired,
  onTextChange: PropTypes.func,
};

export default Timeline;
