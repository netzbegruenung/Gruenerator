import React, { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import apiClient from '../../../components/utils/apiClient';

const SubtitlePreview = ({ 
  videoFile = null,
  subtitles = null, 
  isProcessing = false,
  isExporting = false,
  onExport = () => {} 
}) => {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

  useEffect(() => {
    if (subtitles) {
      // Parse die Untertitel mit Zeitstempeln
      const segments = subtitles.split('\n\n')
        .map((block, index) => {
          const [timeLine, ...textLines] = block.split('\n');
          const [timeRange] = timeLine.match(/(\d+:\d{2}) - (\d+:\d{2})/) || [];
          if (!timeRange) return null;

          const [startTime, endTime] = timeLine.split(' - ');
          const [startMin, startSec] = startTime.split(':').map(Number);
          const [endMin, endSec] = endTime.split(':').map(Number);

          return {
            id: index,
            startTime: startMin * 60 + startSec,
            endTime: endMin * 60 + endSec,
            text: textLines.join('\n').trim()
          };
        })
        .filter(Boolean);

      setEditableSubtitles(segments);
    }
  }, [subtitles]);

  const handleExport = async () => {
    try {
      // Konvertiere editierte Untertitel zurück in Text
      const exportText = editableSubtitles
        .map(segment => {
          const startMin = Math.floor(segment.startTime / 60);
          const startSec = Math.floor(segment.startTime % 60);
          const endMin = Math.floor(segment.endTime / 60);
          const endSec = Math.floor(segment.endTime % 60);
          return `${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')}\n${segment.text}`;
        })
        .join('\n\n');
      await onExport(exportText);
    } catch (error) {
      console.error('Fehler beim Exportieren der Untertitel:', error);
    }
  };

  const handleSubtitleEdit = (id, newText) => {
    setEditableSubtitles(prev => 
      prev.map(segment => 
        segment.id === id ? { ...segment, text: newText } : segment
      )
    );
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };



  return (
    <div className="subtitle-preview">
      {isExporting && (
        <div className="processing-indicator">
          <div className="spinner" />
          <p>Video wird exportiert...</p>
        </div>
      )}
      
      {!isProcessing && !isExporting && videoFile && (
        <div className="video-container">
          <video 
            ref={videoRef}
            className="preview-video"
            controls
            src={videoUrl}
          >
            Ihr Browser unterstützt keine Video-Wiedergabe.
          </video>
        </div>
      )}

      {!isProcessing && !isExporting && editableSubtitles.length > 0 && (
        <div className="subtitles-editor">
          <h3>Untertitel bearbeiten:</h3>
          <div className="subtitles-list">
            {editableSubtitles.map(segment => (
              <div key={segment.id} className="subtitle-segment">
                <div className="segment-time">
                  {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                </div>
                <textarea
                  value={segment.text}
                  onChange={(e) => handleSubtitleEdit(segment.id, e.target.value)}
                  className="segment-text"
                  rows={2}
                />
              </div>
            ))}
          </div>
          <div className="subtitle-controls">
            <button 
              className="btn-primary"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? 'Exportiere...' : 'Video mit Untertiteln herunterladen'}
            </button>
          </div>
        </div>
      )}
      
      {!isProcessing && !isExporting && !subtitles && !videoFile && (
        <div className="no-subtitles">
          Keine Untertitel verfügbar
        </div>
      )}
    </div>
  );
};

SubtitlePreview.propTypes = {
  videoFile: PropTypes.object,
  subtitles: PropTypes.string,
  isProcessing: PropTypes.bool,
  isExporting: PropTypes.bool,
  onExport: PropTypes.func
};

export default SubtitlePreview; 