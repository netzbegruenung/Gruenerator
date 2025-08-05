import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import LiveSubtitlePreview from './LiveSubtitlePreview';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import '../../../assets/styles/components/subtitler/download-fallback.css';

const SubtitleEditor = ({ 
  videoFile, 
  subtitles, 
  uploadId, 
  subtitlePreference, 
  stylePreference = 'standard',
  heightPreference = 'standard',
  onExportSuccess, 
  isExporting, 
  onExportComplete,
  onBackToStyling
}) => {
  // Use the centralized export store
  const exportStore = useSubtitlerExportStore();
  const {
    status: exportStatus,
    progress: exportProgress,
    error: exportError,
    exportToken,
    startExport,
    resetExport,
    subscribe
  } = exportStore;
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);
  const [error, setError] = useState(null);
  const [currentTimeInSeconds, setCurrentTimeInSeconds] = useState(0);
  const [videoMetadata, setVideoMetadata] = useState(null);
  const [showFallbackButton, setShowFallbackButton] = useState(null); // For fallback download button
  
  // Subscribe to export store for cleanup
  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);
  
  // Watch for export start and completion
  useEffect(() => {
    if (exportStatus === 'starting' || exportStatus === 'exporting') {
      // Move to success screen immediately when export starts
      console.log('[SubtitleEditor] Export started, calling success callback with token:', exportToken);
      onExportSuccess && onExportSuccess(exportToken);
    } else if (exportStatus === 'complete') {
      console.log('[SubtitleEditor] Export completed');
      onExportComplete && onExportComplete();
    } else if (exportStatus === 'error' && exportError) {
      console.error('[SubtitleEditor] Export failed:', exportError);
      setError(exportError);
      onExportComplete && onExportComplete();
    }
  }, [exportStatus, exportToken, exportError, onExportSuccess, onExportComplete]);

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
          const [timeLine, ...textLines] = block.split('\n');
          const timeMatch = timeLine.match(/(\d+):(\d{2})\.(\d) - (\d+):(\d{2})\.(\d)/);
          if (!timeMatch) {
            console.warn('[SubtitleEditor] Invalid time range in block:', block);
            return null;
          }

          const startMin = parseInt(timeMatch[1], 10);
          const startSec = parseInt(timeMatch[2], 10);
          const startFrac = parseInt(timeMatch[3], 10);
          const endMin = parseInt(timeMatch[4], 10);
          const endSec = parseInt(timeMatch[5], 10);
          const endFrac = parseInt(timeMatch[6], 10);

          const startTime = startMin * 60 + startSec + (startFrac / 10);
          const endTime = endMin * 60 + endSec + (endFrac / 10);

          return {
            id: index,
            startTime,
            endTime,
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    const fractionalSecond = Math.floor((seconds % 1) * 10); // Single decimal place
    return `${mins}:${wholeSeconds.toString().padStart(2, '0')}.${fractionalSecond}`;
  };

  const handleExport = async () => {
    if (!uploadId || !editableSubtitles.length) {
       setError('Fehlende Upload-ID oder keine Untertitel zum Exportieren.');
       return;
    }

    try {
      setError(null);
      
      // Format subtitles text
      const subtitlesText = editableSubtitles
        .map(segment => {
          const startMin = Math.floor(segment.startTime / 60);
          const startWholeSeconds = Math.floor(segment.startTime % 60);
          const startFractional = Math.floor((segment.startTime % 1) * 10);
          const endMin = Math.floor(segment.endTime / 60);
          const endWholeSeconds = Math.floor(segment.endTime % 60);
          const endFractional = Math.floor((segment.endTime % 1) * 10);
          return `${startMin.toString().padStart(2, '0')}:${startWholeSeconds.toString().padStart(2, '0')}.${startFractional}` +
                 ` - ${endMin.toString().padStart(2, '0')}:${endWholeSeconds.toString().padStart(2, '0')}.${endFractional}` +
                 `\n${segment.text}`;
        })
        .join('\n\n');

      console.log('[SubtitleEditor] Starting export via store:', { 
        uploadId, 
        subtitlesLength: subtitlesText.length,
        stylePreference,
        heightPreference 
      });

      // Use the centralized store for export
      await startExport(subtitlesText, {
        uploadId,
        subtitlePreference,
        stylePreference,
        heightPreference
      });

    } catch (error) {
      console.error('[SubtitleEditor] Export initiation error:', error);
      setError(error.message || 'Fehler beim Starten des Exports');
    }
  };







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

      {/* **Workaround #2: Fallback Download Button** */}
      {showFallbackButton && (
        <div className="download-fallback">
          <div className="fallback-message">
            <p>⚠️ Automatischer Download fehlgeschlagen?</p>
            <div className="fallback-buttons">
              <a 
                href={showFallbackButton.url || showFallbackButton}
                download={showFallbackButton.filename}
                className="btn-primary"
                onClick={() => setShowFallbackButton(null)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Video manuell herunterladen
              </a>
              <button 
                className="btn-secondary"
                onClick={() => setShowFallbackButton(null)}
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="editor-header">
        <h3>Untertitel bearbeiten</h3>
        {onBackToStyling && (
          <button 
            className="btn-secondary editor-back-button"
            onClick={onBackToStyling}
            title="Zurück zur Style-Auswahl"
          >
            Style ändern
          </button>
        )}
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
                  stylePreference={stylePreference}
                  heightPreference={heightPreference}
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
              disabled={isExporting || exportStatus === 'starting' || exportStatus === 'exporting'}
            >
              {(isExporting || exportStatus === 'starting' || exportStatus === 'exporting') ? (
                <div className="button-loading-content">
                  <div className="button-spinner" />
                  <span>Video wird verarbeitet...</span>
                  {exportProgress > 0 && <span> ({exportProgress}%)</span>}
                </div>
              ) : (
                'Video herunterladen'
              )}
            </button>
          </div>
        </div>

        <div className="subtitles-editor">
          <div className="subtitles-list">
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
          </div>
        </div>
      </div>

      <div className="editor-controls mobile-only">
        <button 
          className="btn-primary"
          onClick={handleExport}
          disabled={isExporting || exportStatus === 'starting' || exportStatus === 'exporting'}
        >
          {(isExporting || exportStatus === 'starting' || exportStatus === 'exporting') ? (
            <div className="button-loading-content">
              <div className="button-spinner" />
              <span>Video wird verarbeitet...</span>
              {exportProgress > 0 && <span> ({exportProgress}%)</span>}
            </div>
          ) : (
            'Video mit Untertiteln herunterladen'
          )}
        </button>
      </div>
    </div>
  );
};

SubtitleEditor.propTypes = {
  videoFile: PropTypes.instanceOf(File),
  subtitles: PropTypes.string.isRequired,
  uploadId: PropTypes.string.isRequired,
  subtitlePreference: PropTypes.string.isRequired,
  stylePreference: PropTypes.oneOf(['standard', 'clean', 'shadow', 'tanne']),
  heightPreference: PropTypes.oneOf(['standard', 'tief']),
  onExportSuccess: PropTypes.func.isRequired,
  isExporting: PropTypes.bool,
  onExportComplete: PropTypes.func,
  onBackToStyling: PropTypes.func
};

export default SubtitleEditor; 