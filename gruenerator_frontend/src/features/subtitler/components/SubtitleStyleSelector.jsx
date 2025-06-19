import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import LiveSubtitlePreview from './LiveSubtitlePreview';
import { FaPalette, FaCog, FaCheckCircle, FaPlay } from 'react-icons/fa';

const SubtitleStyleSelector = ({ 
  videoFile, 
  subtitles, 
  uploadId, 
  subtitlePreference, 
  selectedStyle,
  selectedMode,
  onStyleSelect,
  onModeSelect,
  onContinue,
  isProcessing 
}) => {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);
  const [currentTimeInSeconds, setCurrentTimeInSeconds] = useState(0);
  const [videoMetadata, setVideoMetadata] = useState(null);
  const [error, setError] = useState(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  // Enhanced style options with better descriptions and previews
  const styleOptions = [
    {
      id: 'standard',
      name: 'Klassischer Stil',
      description: 'Schwarzer Hintergrund für beste Lesbarkeit',
      preview: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: '#ffffff',
        textShadow: 'none',
        padding: '0.25em 0.5em',
        borderRadius: '0.2em'
      }
    },
    {
      id: 'clean',
      name: 'Minimalistisch',
      description: 'Reiner weißer Text ohne jegliche Effekte',
      preview: {
        backgroundColor: 'transparent',
        color: '#ffffff',
        textShadow: 'none',
        padding: '0',
        borderRadius: '0'
      }
    },
    {
      id: 'shadow',
      name: 'Schatten-Effekt',
      description: 'Eleganter Schlagschatten für moderne Optik',
      preview: {
        backgroundColor: 'transparent',
        color: 'var(--font-color)',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        padding: '0',
        borderRadius: '0'
      }
    },
    {
      id: 'tanne',
      name: 'Grüner Stil',
      description: 'Markenfarbe für besondere Betonung',
      preview: {
        backgroundColor: 'var(--secondary-600)',
        color: '#ffffff',
        textShadow: 'none',
        padding: '0.3em 0.6em',
        borderRadius: '0.2em'
      }
    }
  ];

  // Mode options for subtitle generation - COMMENTED OUT: Only manual mode supported
  /*
  const modeOptions = [
    {
      id: 'manual',
      name: 'Traditionell',
      description: 'Klassische Untertitel mit ganzen Sätzen'
    },
    {
      id: 'word',
      name: 'Wort-Highlight',
      description: 'TikTok-Style mit einzelnen hervorgehobenen Wörtern'
    }
  ];
  */

  // Create video URL
  useEffect(() => {
    if (!videoFile) return;

    if (!(videoFile instanceof File || videoFile instanceof Blob)) {
      setError('Das Video-Format wird nicht unterstützt');
      return;
    }

    try {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('[SubtitleStyleSelector] Error creating video URL:', error);
      setError('Fehler beim Laden der Video-Vorschau');
    }
  }, [videoFile]);

  // Process subtitles
  useEffect(() => {
    if (!subtitles) return;

    if (typeof subtitles !== 'string') {
      setError('Die Untertitel konnten nicht verarbeitet werden');
      return;
    }

    try {
      const segments = subtitles.split('\n\n')
        .map((block, index) => {
          const [timeLine, ...textLines] = block.split('\n');
          const timeMatch = timeLine.match(/(\d+):(\d{2})\.(\d) - (\d+):(\d{2})\.(\d)/);
          if (!timeMatch) return null;

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

      setEditableSubtitles(segments);
    } catch (error) {
      console.error('[SubtitleStyleSelector] Error processing subtitles:', error);
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
      setIsVideoLoaded(true);
      console.log('[SubtitleStyleSelector] Video metadata loaded:', metadata);
    }
  };

  // Handle video time updates
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setCurrentTimeInSeconds(currentTime);
    }
  };

  const handleStyleSelection = (styleId) => {
    onStyleSelect(styleId);
  };

  const handleModeSelection = (modeId) => {
    onModeSelect(modeId);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!videoFile || !subtitles) {
    return (
      <div className="subtitle-style-selector">
        <div className="style-selector-container">
          <div className="style-selector-header">
            <h1 className="style-selector-title">
              <FaPalette />
              Untertitel-Style wählen
            </h1>
          </div>
          <div className="video-loading">
            <div className="video-loading-spinner" />
            <span>Lade Video und Untertitel...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="subtitle-style-selector">
      <div className="style-selector-container">
        {error && (
          <div className="error-message">
            <span>{error}</span>
            <button className="error-dismiss" onClick={() => setError(null)}>
              Schließen
            </button>
          </div>
        )}

        <div className="style-selector-header">
          <h1 className="style-selector-title">
            <FaPalette />
            Untertitel-Style wählen
          </h1>
          <p className="style-selector-subtitle">
            Wähle den perfekten Stil für deine Untertitel und sieh dir die Vorschau live an
          </p>
        </div>

        <div className="style-selector-main">
          {/* Video Hero Section */}
          <div className="video-hero-section">
            <div className="video-container">
              {videoUrl ? (
                <>
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
                  
                  {isVideoLoaded && (
                    <LiveSubtitlePreview
                      editableSubtitles={editableSubtitles}
                      currentTimeInSeconds={currentTimeInSeconds}
                      videoMetadata={videoMetadata}
                      stylePreference={selectedStyle}
                    />
                  )}
                </>
              ) : (
                <div className="video-loading">
                  <div className="video-loading-spinner" />
                  <span>Video wird geladen...</span>
                </div>
              )}
            </div>

            {videoMetadata && (
              <div className="video-info">
                <FaPlay style={{ marginRight: '0.5rem' }} />
                {Math.round(videoMetadata.width)}×{Math.round(videoMetadata.height)} • 
                {formatDuration(videoMetadata.duration)} • {editableSubtitles.length} Untertitel
              </div>
            )}
          </div>

          {/* Options Panel */}
          <div className="options-panel">
            {/* Style Options */}
            <div className="options-section">
              <h3 className="section-title">
                <FaPalette />
                Untertitel-Stil
              </h3>
              
              <div className="style-options-grid">
                {styleOptions.map((option) => (
                  <label 
                    key={option.id} 
                    className={`style-option-card ${selectedStyle === option.id ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="styleOption"
                      value={option.id}
                      checked={selectedStyle === option.id}
                      onChange={() => handleStyleSelection(option.id)}
                      className="style-option-radio"
                    />
                    
                    <div className="style-option-content">
                      <div className="style-option-header">
                        <h4 className="style-option-name">{option.name}</h4>
                        <div className="style-option-check">
                          {selectedStyle === option.id && <FaCheckCircle />}
                        </div>
                      </div>
                      
                      <div className="style-option-preview">
                        <span 
                          className="preview-text"
                          style={option.preview}
                        >
                          Beispiel Untertitel
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

                      {/* Mode Options - HIDDEN: Only manual mode supported */}
          {/* 
          <div className="options-section">
            <h3 className="section-title">
              <FaCog />
              Untertitel-Modus
            </h3>
            
            <div className="mode-options-container">
              {modeOptions.map((option) => (
                <button
                  key={option.id}
                  className={`mode-option-button ${selectedMode === option.id ? 'selected' : ''}`}
                  onClick={() => handleModeSelection(option.id)}
                >
                  <div className="mode-option-title">{option.name}</div>
                  <div className="mode-option-description">{option.description}</div>
                </button>
              ))}
            </div>
          </div>
          */}
          </div>
        </div>

        {/* Action Section */}
        <div className="action-section">
          <button 
            className="continue-button"
            onClick={onContinue}
            disabled={isProcessing || !selectedStyle}
          >
            {isProcessing ? (
              <div className="button-loading-content">
                <div className="button-spinner" />
                <span>Verarbeite Stil...</span>
              </div>
            ) : (
              <>
                <span>Weiter zur Bearbeitung</span>
                <FaCheckCircle />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

SubtitleStyleSelector.propTypes = {
  videoFile: PropTypes.instanceOf(File),
  subtitles: PropTypes.string.isRequired,
  uploadId: PropTypes.string.isRequired,
  subtitlePreference: PropTypes.string.isRequired,
  selectedStyle: PropTypes.string.isRequired,
  selectedMode: PropTypes.string.isRequired,
  onStyleSelect: PropTypes.func.isRequired,
  onModeSelect: PropTypes.func.isRequired,
  onContinue: PropTypes.func.isRequired,
  isProcessing: PropTypes.bool
};

export default SubtitleStyleSelector;