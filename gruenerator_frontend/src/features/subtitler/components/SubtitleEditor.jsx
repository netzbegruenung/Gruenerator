import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
<<<<<<< HEAD
import { motion, AnimatePresence } from 'motion/react';
import apiClient from '../../../components/utils/apiClient';
import LiveSubtitlePreview from './LiveSubtitlePreview';
import ConfirmDeletePopup from '../../../components/common/ConfirmDeletePopup';
=======
import apiClient from '../../../components/utils/apiClient';
import LiveSubtitlePreview from './LiveSubtitlePreview';
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5

const SubtitleEditor = ({ videoFile, subtitles, uploadId, onExportSuccess, isExporting, onExportComplete }) => {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);
  const [error, setError] = useState(null);
  const [currentTimeInSeconds, setCurrentTimeInSeconds] = useState(0);
  const [videoMetadata, setVideoMetadata] = useState(null);
<<<<<<< HEAD
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isVisible: false, segmentId: null });
  const [overlappingSegments, setOverlappingSegments] = useState(new Set());
=======
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5

  // Emoji detection function
  const detectEmojis = (text) => {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]/gu;
    return emojiRegex.test(text);
  };

  // Function to wrap emojis in spans for styling
  const formatTextWithEmojis = (text) => {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]/gu;
    
    return text.replace(emojiRegex, (emoji) => `<span class="emoji-transparent">${emoji}</span>`);
  };

  // Validiere Props und erstelle Video-URL
  useEffect(() => {
    if (!videoFile) {
      console.log('[SubtitleEditor] No video file provided');
      return;
    }

    if (!(videoFile instanceof File || videoFile instanceof Blob)) {
      console.error('[SubtitleEditor] Invalid video file type:', typeof videoFile);
      setError('Ungültiges Video-Format');
      return;
    }

    try {
      console.log('[SubtitleEditor] Creating video URL for file:', {
        name: videoFile.name,
        type: videoFile.type,
        size: videoFile.size
      });
      
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      
      return () => {
        console.log('[SubtitleEditor] Cleaning up video URL');
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('[SubtitleEditor] Error creating video URL:', error);
      setError('Fehler beim Laden der Video-Vorschau');
    }
  }, [videoFile]);

  // Verarbeite Untertitel
  useEffect(() => {
    if (!subtitles) {
      console.log('[SubtitleEditor] No subtitles provided');
      return;
    }

    if (typeof subtitles !== 'string') {
      console.error('[SubtitleEditor] Invalid subtitles type:', typeof subtitles);
      setError('Ungültiges Untertitel-Format');
      return;
    }

    try {
      console.log('[SubtitleEditor] Processing subtitles:', subtitles);
      
      const segments = subtitles.split('\n\n')
        .map((block, index) => {
<<<<<<< HEAD
          const lines = block.split('\n');
          if (lines.length < 2) {
            console.warn('[SubtitleEditor] Invalid block (not enough lines):', block);
            return null;
          }
          const timeLine = lines[0];
          const textLines = lines.slice(1);

          // Robust parsing of the timeLine
          const timeParts = timeLine.split(' - ');
          if (timeParts.length !== 2) {
            console.warn('[SubtitleEditor] Invalid timeLine format (expected "startTimeStr - endTimeStr"):', timeLine, 'in block:', block);
            return null;
          }

          const [startTimeStr, endTimeStr] = timeParts;
          
          const startComps = startTimeStr.split(':');
          const endComps = endTimeStr.split(':');

          if (startComps.length !== 2 || endComps.length !== 2) {
            console.warn('[SubtitleEditor] Invalid time string format (expected "MM:SS" or "MM:SSS"):', timeLine, 'in block:', block);
            return null;
          }

          const startMin = parseInt(startComps[0], 10);
          const startSec = parseInt(startComps[1], 10);
          const endMin = parseInt(endComps[0], 10);
          const endSec = parseInt(endComps[1], 10);

          if (isNaN(startMin) || isNaN(startSec) || isNaN(endMin) || isNaN(endSec)) {
            console.warn('[SubtitleEditor] Failed to parse time components to numbers:', timeLine, 'in block:', block);
            return null;
          }
          
          const calculatedStartTime = startMin * 60 + startSec;
          const calculatedEndTime = endMin * 60 + endSec;

          // Optional: Add validation for calculated times if needed
          // if (calculatedStartTime < 0 || calculatedEndTime < 0 || calculatedEndTime < calculatedStartTime) {
          //   console.warn('[SubtitleEditor] Invalid calculated time values:', 
          //                { calculatedStartTime, calculatedEndTime }, 'for block:', block);
          //   return null; 
          // }
          
          return {
            id: index,
            startTime: calculatedStartTime,
            endTime: calculatedEndTime,
=======
          const [timeLine, ...textLines] = block.split('\n');
          const [timeRange] = timeLine.match(/(\d+:\d{2}) - (\d+:\d{2})/) || [];
          if (!timeRange) {
            console.warn('[SubtitleEditor] Invalid time range in block:', block);
            return null;
          }

          const [startTime, endTime] = timeLine.split(' - ');
          const [startMin, startSec] = startTime.split(':').map(Number);
          const [endMin, endSec] = endTime.split(':').map(Number);

          return {
            id: index,
            startTime: startMin * 60 + startSec,
            endTime: endMin * 60 + endSec,
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
            text: textLines.join('\n').trim()
          };
        })
        .filter(Boolean);

      console.log('[SubtitleEditor] Processed segments:', segments.length);
      setEditableSubtitles(segments);
    } catch (error) {
      console.error('[SubtitleEditor] Error processing subtitles:', error);
      setError('Fehler beim Verarbeiten der Untertitel');
    }
  }, [subtitles]);

<<<<<<< HEAD
  // Check for overlaps whenever subtitles change
  useEffect(() => {
    if (editableSubtitles.length > 0) {
      const overlaps = detectOverlaps(editableSubtitles);
      setOverlappingSegments(overlaps);
    }
  }, [editableSubtitles]);

=======
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
  // Handle video metadata loading
  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration
      };
      setVideoMetadata(metadata);
      console.log('[SubtitleEditor] Video metadata loaded:', metadata);
    }
  };

  // Handle video time updates
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setCurrentTimeInSeconds(currentTime);
      console.log('[SubtitleEditor] Time update:', currentTime.toFixed(2), 's');
    }
  };

  // Frühe Rückgabe bei fehlenden Props
  if (!videoFile || !subtitles) {
    console.log('[SubtitleEditor] Missing required props');
    return (
      <div className="subtitle-editor-container">
        <div className="loading-message">
          Lade Video und Untertitel...
        </div>
      </div>
    );
  }

  const adjustTextareaHeight = (element) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  useEffect(() => {
    if (window.innerWidth <= 768) {
      const textareas = document.querySelectorAll('.segment-text');
      textareas.forEach(adjustTextareaHeight);
    }
  }, [editableSubtitles]);

  const handleSubtitleEdit = (id, newText, event) => {
    setEditableSubtitles(prev => 
      prev.map(segment => 
        segment.id === id ? { ...segment, text: newText } : segment
      )
    );
    
    if (window.innerWidth <= 768) {
      adjustTextareaHeight(event.target);
    }
  };

<<<<<<< HEAD
  // Handler for editing timestamps
  const handleTimeEdit = (id, field, value) => {
    const [minutes, seconds] = value.split(':').map(Number);
    if (isNaN(minutes) || isNaN(seconds) || seconds >= 60 || seconds < 0) return;
    
    const timeInSeconds = minutes * 60 + seconds;
    
    setEditableSubtitles(prev => 
      prev.map(segment => {
        if (segment.id === id) {
          const newSegment = { ...segment };
          if (field === 'start') {
            newSegment.startTime = timeInSeconds;
            // Only adjust end time if the new start time would make it invalid
            if (newSegment.endTime <= timeInSeconds) {
              newSegment.endTime = timeInSeconds + 1;
            }
          } else if (field === 'end') {
            newSegment.endTime = timeInSeconds;
            // Only adjust start time if the new end time would make it invalid
            if (newSegment.startTime >= timeInSeconds) {
              newSegment.startTime = Math.max(0, timeInSeconds - 1);
            }
          }
          return newSegment;
        }
        return segment;
      })
    );
  };

  // Handler for deleting segments
  const handleDeleteSegment = (id) => {
    setDeleteConfirmation({ isVisible: true, segmentId: id });
  };

  // Handler for confirming deletion
  const confirmDeleteSegment = () => {
    if (deleteConfirmation.segmentId !== null) {
      setEditableSubtitles(prev => prev.filter(segment => segment.id !== deleteConfirmation.segmentId));
    }
    setDeleteConfirmation({ isVisible: false, segmentId: null });
  };

  // Handler for canceling deletion
  const cancelDeleteSegment = () => {
    setDeleteConfirmation({ isVisible: false, segmentId: null });
  };

  // Toggle time editing mode
  const toggleTimeEdit = (id) => {
    setEditingTimeId(editingTimeId === id ? null : id);
  };

=======
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExport = async () => {
    if (!uploadId || !editableSubtitles.length) {
       setError('Fehlende Upload-ID oder keine Untertitel zum Exportieren.');
       return;
    }

    try {
      setError(null);
      const subtitlesText = editableSubtitles
        .map(segment => {
          const startMin = Math.floor(segment.startTime / 60);
          const startSec = Math.floor(segment.startTime % 60);
          const endMin = Math.floor(segment.endTime / 60);
          const endSec = Math.floor(segment.endTime % 60);
          return `${startMin.toString().padStart(2, '0')}:${startSec.toString().padStart(2, '0')}` +
                 ` - ${endMin.toString().padStart(2, '0')}:${endSec.toString().padStart(2, '0')}` +
                 `\n${segment.text}`;
        })
        .join('\n\n');

      onExportSuccess(); 

      console.log('[SubtitleEditor] Exporting with:', { uploadId, subtitlesLength: subtitlesText.length });

      const response = await apiClient.post('/subtitler/export', 
        { uploadId: uploadId, subtitles: subtitlesText }, 
        {
          responseType: 'arraybuffer',
          timeout: 300000,
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.total && progressEvent.loaded === progressEvent.total) {
              console.log('[SubtitleEditor] Video download complete.');
              onExportComplete && onExportComplete();
            }
          }
        }
      );

      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        const errorData = JSON.parse(new TextDecoder().decode(response.data));
        throw new Error(errorData.error || 'Fehler beim Exportieren (Server JSON Antwort)');
      }

      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 'video/mp4' 
      });

      const baseFilename = videoFile?.name || `video_${uploadId}`;
      const extension = baseFilename.includes('.') ? baseFilename.split('.').pop() : 'mp4';
      const filename = `subtitled_${baseFilename.replace(`.${extension}`, '')}_mit_untertiteln.${extension}`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      let errorMessage = 'Ein Fehler ist beim Export aufgetreten';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Die Verarbeitung hat zu lange gedauert. Bitte versuchen Sie es mit einem kürzeren Video oder überprüfen Sie die Serverlast.';
      } else if (error.response) {
        if (error.response.data instanceof ArrayBuffer) {
          try {
            const text = new TextDecoder().decode(error.response.data);
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || `Serverfehler (${error.response.status})`;
          } catch (parseError) {
            errorMessage = `Fehler beim Exportieren des Videos (Serverfehler ${error.response.status})`;
          }
        } else {
          errorMessage = error.response.data?.error || error.message || `Serverfehler (${error.response.status})`;
        }
      } else {
         errorMessage = error.message || errorMessage;
      }
      
      console.error('[SubtitleEditor] Export error details:', error);
      setError(errorMessage);
      onExportComplete && onExportComplete(); 
    }
  };

<<<<<<< HEAD
  // Function to detect overlapping segments
  const detectOverlaps = (segments) => {
    const overlaps = new Set();
    
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const segmentA = segments[i];
        const segmentB = segments[j];
        
        // Check if segments overlap
        if (segmentA.startTime < segmentB.endTime && segmentB.startTime < segmentA.endTime) {
          overlaps.add(segmentA.id);
          overlaps.add(segmentB.id);
        }
      }
    }
    
    return overlaps;
  };

=======
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
  return (
    <div className="subtitle-editor-container">
      {error && (
        <div className="error-message">
          {error}
          <button className="btn-secondary" onClick={() => setError(null)}>
            Schließen
          </button>
        </div>
      )}

      <div className="editor-header">
        <h3>Untertitel bearbeiten</h3>
      </div>

      <div className="editor-layout">
        <div className="video-section">
          <div className="video-preview">
            {videoUrl ? (
              <div style={{ position: 'relative' }}>
                <video 
                  ref={videoRef}
                  className="preview-video"
                  controls
                  src={videoUrl}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onTimeUpdate={handleVideoTimeUpdate}
                >
                  Dein Browser unterstützt keine Video-Wiedergabe.
                </video>
                
                <LiveSubtitlePreview
                  editableSubtitles={editableSubtitles}
                  currentTimeInSeconds={currentTimeInSeconds}
                  videoMetadata={videoMetadata}
                />
              </div>
            ) : (
              <div className="video-loading">
                {error ? 'Fehler beim Laden des Videos' : 'Video wird geladen...'}
              </div>
            )}
          </div>
          <div className="subtitle-preview-notice">
            Nur eine Vorschau. Das finale Styling sieht besser aus!
          </div>
          <div className="video-controls desktop-only">
            <button 
              className="btn-primary"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <div className="button-loading-content">
                  <div className="button-spinner" />
                  <span>Video wird verarbeitet...</span>
                </div>
              ) : (
                'Video herunterladen'
              )}
            </button>
          </div>
        </div>

        <div className="subtitles-editor">
          <div className="subtitles-list">
<<<<<<< HEAD
            <AnimatePresence>
              {editableSubtitles.map(segment => (
                <motion.div 
                  key={segment.id} 
                  className={`subtitle-segment ${overlappingSegments.has(segment.id) ? 'segment-overlap' : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -300, transition: { duration: 0.3 } }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  layout
                >
                  <div className="segment-header">
                    {editingTimeId === segment.id ? (
                      <div className="segment-time-inputs">
                        <input
                          type="text"
                          className="segment-time-input"
                          value={formatTime(segment.startTime)}
                          onChange={(e) => handleTimeEdit(segment.id, 'start', e.target.value)}
                          onBlur={() => setEditingTimeId(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingTimeId(null)}
                          autoFocus
                        />
                        <span>-</span>
                        <input
                          type="text"
                          className="segment-time-input"
                          value={formatTime(segment.endTime)}
                          onChange={(e) => handleTimeEdit(segment.id, 'end', e.target.value)}
                          onBlur={() => setEditingTimeId(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingTimeId(null)}
                        />
                      </div>
                    ) : (
                      <motion.div 
                        className={`segment-time ${overlappingSegments.has(segment.id) ? 'segment-time-overlap' : ''}`}
                        onClick={() => toggleTimeEdit(segment.id)}
                        whileTap={{ scale: 0.98 }}
                      >
                        {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                        {overlappingSegments.has(segment.id) && (
                          <span className="overlap-icon">⚠️</span>
                        )}
                      </motion.div>
                    )}
                    <motion.button
                      className="delete-segment-button"
                      onClick={() => handleDeleteSegment(segment.id)}
                      whileTap={{ scale: 0.9 }}
                      title="Segment löschen"
                    >
                      ✕
                    </motion.button>
                  </div>
                  <div className="segment-text-container">
                    <textarea
                      value={segment.text}
                      onChange={(e) => handleSubtitleEdit(segment.id, e.target.value, e)}
                      className={`segment-text ${detectEmojis(segment.text) ? 'has-emojis' : ''}`}
                      rows={window.innerWidth <= 768 ? undefined : 2}
                    />
                    {detectEmojis(segment.text) && (
                      <div className="emoji-warning">
                        ⚠️ Emojis werden im Video nicht angezeigt
                      </div>
                    )}
                    <div 
                      className="segment-text-preview"
                      dangerouslySetInnerHTML={{ __html: formatTextWithEmojis(segment.text) }}
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
=======
            {editableSubtitles.map(segment => (
              <div key={segment.id} className="subtitle-segment">
                <div className="segment-time">
                  {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                </div>
                <div className="segment-text-container">
                  <textarea
                    value={segment.text}
                    onChange={(e) => handleSubtitleEdit(segment.id, e.target.value, e)}
                    className={`segment-text ${detectEmojis(segment.text) ? 'has-emojis' : ''}`}
                    rows={window.innerWidth <= 768 ? undefined : 2}
                  />
                  {detectEmojis(segment.text) && (
                    <div className="emoji-warning">
                      ⚠️ Emojis werden im Video nicht angezeigt
                    </div>
                  )}
                  <div 
                    className="segment-text-preview"
                    dangerouslySetInnerHTML={{ __html: formatTextWithEmojis(segment.text) }}
                  />
                </div>
              </div>
            ))}
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
          </div>
        </div>
      </div>

      <div className="editor-controls mobile-only">
        <button 
          className="btn-primary"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <div className="button-loading-content">
              <div className="button-spinner" />
              <span>Video wird verarbeitet...</span>
            </div>
          ) : (
            'Video mit Untertiteln herunterladen'
          )}
        </button>
      </div>
<<<<<<< HEAD

      {deleteConfirmation.isVisible && (
        <ConfirmDeletePopup
          isVisible={deleteConfirmation.isVisible}
          onConfirm={confirmDeleteSegment}
          onCancel={cancelDeleteSegment}
          title="Untertitel-Segment löschen?"
          message="Dieses Untertitel-Segment wird permanent entfernt. Diese Aktion kann nicht rückgängig gemacht werden."
        />
      )}
=======
>>>>>>> f2cbc8c2fcc3868bd014a17f22a2c2b04103dcf5
    </div>
  );
};

SubtitleEditor.propTypes = {
  videoFile: PropTypes.instanceOf(File),
  subtitles: PropTypes.string.isRequired,
  uploadId: PropTypes.string.isRequired,
  onExportSuccess: PropTypes.func.isRequired,
  isExporting: PropTypes.bool,
  onExportComplete: PropTypes.func
};

export default SubtitleEditor; 