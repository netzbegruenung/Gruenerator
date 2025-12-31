import { useCallback, useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { FiPlay, FiPause, FiScissors, FiRotateCcw, FiRotateCw, FiType, FiRefreshCw, FiAlertTriangle, FiPlus, FiFilm, FiDownload, FiX, FiCheck } from 'react-icons/fi';
import { HiCog } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import VideoEditorPlayer from './VideoEditorPlayer';
import Timeline from './Timeline';
import ClipPanel from './ClipPanel';
import TextOverlayPanel from './TextOverlayPanel';
import useVideoEditorStore from '../../../../stores/videoEditorStore';
import useSubtitlerExportStore from '../../../../stores/subtitlerExportStore';
import '../../../../assets/styles/components/ui/button.css';
import '../../styles/SubtitleEditor.css';
import './VideoEditor.css';

/**
 * Video Editor Component
 * Main container for the timeline-based video editor
 * Includes player, controls, and timeline visualization
 */
const getVideoMetadataFromFile = (file) => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        fps: 30
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      resolve({ duration: 0, width: 1920, height: 1080, fps: 30 });
    };
    video.src = URL.createObjectURL(file);
  });
};

const generateThumbnail = (videoUrl, time = 1) => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(time, video.duration / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxWidth = 128;
        const scale = maxWidth / video.videoWidth;
        canvas.width = maxWidth;
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        resolve(null);
      }
    };

    video.onerror = () => resolve(null);
    video.src = videoUrl;
  });
};

const VideoEditor = ({
  videoUrl,
  videoFile,
  videoMetadata,
  uploadId,
  onSegmentsChange,
  onGenerateSubtitles,
  subtitles,
  isGeneratingSubtitles,
  stylePreference,
  heightPreference,
  onSubtitleClick,
  onSubtitleUpdate
}) => {
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showClipPanel, setShowClipPanel] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showStyling, setShowStyling] = useState(false);
  const [localStyle, setLocalStyle] = useState(stylePreference || 'shadow');
  const [localHeight, setLocalHeight] = useState(heightPreference || 'tief');
  const [localQuality, setLocalQuality] = useState('normal');
  const [editingOverlayId, setEditingOverlayId] = useState(null);
  const clipFileInputRef = useRef(null);

  const styleOptions = [
    {
      id: 'shadow',
      name: 'Empfohlen',
      isRecommended: true,
      preview: {
        backgroundColor: 'transparent',
        color: 'var(--font-color)',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        padding: '0',
        borderRadius: '0'
      }
    },
    {
      id: 'standard',
      name: 'Klassisch',
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
      name: 'Minimal',
      preview: {
        backgroundColor: 'transparent',
        color: 'var(--font-color)',
        textShadow: 'none',
        padding: '0',
        borderRadius: '0'
      }
    },
    {
      id: 'tanne',
      name: 'Grün',
      preview: {
        backgroundColor: 'var(--secondary-600)',
        color: '#ffffff',
        textShadow: 'none',
        padding: '0.3em 0.6em',
        borderRadius: '0.2em'
      }
    }
  ];

  const heightOptions = [
    { id: 'tief', name: 'Tiefer', subtitle: 'Standard' },
    { id: 'standard', name: 'Mittig', subtitle: 'Etwa auf 40% Höhe' }
  ];

  const qualityOptions = [
    { id: 'normal', name: 'Standard', subtitle: 'Perfekt für Reels' },
    { id: 'hd', name: 'Volle Qualität', subtitle: 'Dauert länger' }
  ];

  const {
    status: exportStatus,
    progress: exportProgress,
    downloadUrl,
    error: exportError,
    startRemotionExport,
    resetExport
  } = useSubtitlerExportStore();

  const {
    initializeVideo,
    resetEditor,
    segments,
    currentTime,
    isPlaying,
    setIsPlaying,
    splitAtPlayhead,
    getComposedDuration,
    isEditorActive,
    undo,
    redo,
    canUndo,
    canRedo,
    addClip,
    getClipCount,
    hasMultipleClips,
    setClipThumbnail,
    addTextOverlay
  } = useVideoEditorStore();

  useEffect(() => {
    if (videoUrl && videoMetadata) {
      initializeVideo(videoUrl, videoFile, {
        duration: videoMetadata.duration,
        fps: 30,
        width: videoMetadata.width,
        height: videoMetadata.height
      }, uploadId);

      generateThumbnail(videoUrl, 1).then(thumbnail => {
        if (thumbnail) {
          const clips = useVideoEditorStore.getState().clips;
          const firstClipId = Object.keys(clips)[0];
          if (firstClipId) {
            setClipThumbnail(firstClipId, thumbnail);
          }
        }
      });
    }

    return () => {
      resetEditor();
    };
  }, [videoUrl, videoFile, videoMetadata, uploadId, initializeVideo, resetEditor, setClipThumbnail]);

  useEffect(() => {
    if (onSegmentsChange && segments.length > 0) {
      onSegmentsChange(segments);
    }
  }, [segments, onSegmentsChange]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const handleSplit = useCallback(() => {
    splitAtPlayhead();
  }, [splitAtPlayhead]);

  const handleExport = useCallback(() => {
    setShowExportModal(true);
    const storeState = useVideoEditorStore.getState();
    startRemotionExport({
      uploadId,
      clips: storeState.clips,
      segments,
      subtitles,
      stylePreference: localStyle,
      heightPreference: localHeight,
      textOverlays: storeState.textOverlays,
      maxResolution: localQuality === 'normal' ? 1080 : null
    });
  }, [subtitles, uploadId, localStyle, localHeight, localQuality, segments, startRemotionExport]);

  const handleCloseExportModal = useCallback(() => {
    setShowExportModal(false);
    if (exportStatus === 'complete' || exportStatus === 'error') {
      resetExport();
    }
  }, [exportStatus, resetExport]);

  const handleDownload = useCallback(() => {
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `video-export-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [downloadUrl]);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  const handleAddClip = useCallback(async (file) => {
    if (!file || !file.type.startsWith('video/')) return;

    try {
      const metadata = await getVideoMetadataFromFile(file);
      const url = URL.createObjectURL(file);

      const clipId = addClip(url, file, metadata, null);

      // Generate thumbnail asynchronously
      const thumbnail = await generateThumbnail(url, 1);
      if (thumbnail && clipId) {
        setClipThumbnail(clipId, thumbnail);
      }
    } catch (err) {
      console.error('Failed to add clip:', err);
    }
  }, [addClip, setClipThumbnail]);

  const handleClipFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAddClip(file);
    }
    e.target.value = '';
  }, [handleAddClip]);

  const handleAddTextOverlay = useCallback((type) => {
    addTextOverlay(type);
  }, [addTextOverlay]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      const state = useVideoEditorStore.getState();

      // Delete key - remove selected segment or overlay
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedOverlayId !== null) {
          e.preventDefault();
          state.removeTextOverlay(state.selectedOverlayId);
        } else if (state.selectedSegmentId !== null && state.segments.length > 1) {
          e.preventDefault();
          state.deleteSegment(state.selectedSegmentId);
        }
        return;
      }

      // Space - Play/Pause
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
        return;
      }

      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y - Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, undo, redo]);

  const handleLocalStyleChange = (styleId) => {
    setLocalStyle(styleId);
  };

  const handleLocalHeightChange = (heightId) => {
    setLocalHeight(heightId);
  };

  const handleLocalQualityChange = (qualityId) => {
    setLocalQuality(qualityId);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const composedDuration = getComposedDuration();

  if (!isEditorActive) {
    return (
      <div className="video-editor video-editor--loading">
        <div className="video-editor__loading-text">Editor wird initialisiert...</div>
      </div>
    );
  }

  const clipCount = getClipCount();
  const isVertical = videoMetadata && videoMetadata.width < videoMetadata.height;

  const showClipPanelEffective = showClipPanel && clipCount > 1;

  return (
    <div className={`video-editor ${showClipPanelEffective ? 'video-editor--with-panel' : ''} ${isVertical ? 'video-editor--vertical-video' : ''}`}>
      <div className="video-editor__main-row">
        <div className="video-editor__left-column">
          <div className="video-editor__player-section">
            {showClipPanelEffective && (
              <ClipPanel />
            )}
            <div className="video-editor__player-wrapper">
              <VideoEditorPlayer subtitles={subtitles} stylePreference={localStyle} />
              <button
                className="video-editor__play-overlay"
                onClick={handlePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Abspielen'}
              >
                {isPlaying ? <FiPause /> : <FiPlay />}
              </button>
            </div>
          </div>

          <div className="video-editor__player-controls">
            <div className="video-editor__time-display">
              <span>{formatTime(currentTime)}</span>
              <span className="video-editor__time-separator">/</span>
              <span className="video-editor__total-time">{formatTime(composedDuration)}</span>
            </div>

            <div className="video-editor__player-buttons">
              <button
                className="btn-icon btn-secondary"
                onClick={handleUndo}
                disabled={!canUndo()}
                aria-label="Rückgängig"
                title="Rückgängig"
              >
                <FiRotateCcw />
              </button>

              <button
                className="btn-icon btn-secondary"
                onClick={handleRedo}
                disabled={!canRedo()}
                aria-label="Wiederholen"
                title="Wiederholen"
              >
                <FiRotateCw />
              </button>

              <button
                className="btn-icon btn-secondary"
                onClick={handleExport}
                disabled={exportStatus === 'starting' || exportStatus === 'exporting'}
                aria-label="Video exportieren"
                title="Video exportieren"
              >
                {(exportStatus === 'starting' || exportStatus === 'exporting') ? (
                  <Spinner size="small" white />
                ) : (
                  <FiDownload />
                )}
              </button>

              <button
                className={`btn-icon btn-secondary ${showStyling ? 'btn-active' : ''}`}
                onClick={() => setShowStyling(!showStyling)}
                aria-label="Einstellungen"
                title="Einstellungen"
              >
                <HiCog />
              </button>
            </div>
          </div>
        </div>

        <div className="video-editor__right-column">
          <div className="video-editor__edit-panel">
            <div className="video-editor__controls">
              <div className="video-editor__controls-row">
                <div className="video-editor__controls-group">
                  <button
                    className="btn-primary size-s"
                    onClick={() => clipFileInputRef.current?.click()}
                    aria-label="Clip hinzufügen"
                    title="Clip hinzufügen"
                  >
                    <FiPlus />
                    <span>Clip</span>
                  </button>

                  <button
                    className="btn-primary size-s"
                    onClick={() => handleAddTextOverlay('header')}
                    aria-label="Text hinzufügen"
                    title="Text hinzufügen"
                  >
                    <FiType />
                    <span>Text</span>
                  </button>

                  {clipCount > 1 && (
                    <button
                      className={`btn-icon btn-secondary size-s ${showClipPanelEffective ? 'btn-active' : ''}`}
                      onClick={() => setShowClipPanel(!showClipPanel)}
                      aria-label={showClipPanelEffective ? 'Clips ausblenden' : 'Clips anzeigen'}
                      title={showClipPanelEffective ? 'Clips ausblenden' : 'Clips anzeigen'}
                    >
                      <FiFilm />
                    </button>
                  )}
                </div>

                {onGenerateSubtitles && (
                  <button
                    className={`btn-primary size-s video-editor__subtitle-btn ${subtitles ? 'btn-success' : ''}`}
                    onClick={() => {
                      if (subtitles) {
                        setShowRegenerateConfirm(true);
                      } else {
                        onGenerateSubtitles();
                      }
                    }}
                    disabled={isGeneratingSubtitles}
                    aria-label={subtitles ? 'Untertitel neu generieren' : 'Untertitel generieren'}
                    title={subtitles ? 'Untertitel neu generieren' : 'Untertitel generieren'}
                  >
                    {isGeneratingSubtitles ? (
                      <Spinner size="small" white />
                    ) : subtitles ? (
                      <FiRefreshCw />
                    ) : (
                      <FiType />
                    )}
                    <span>{isGeneratingSubtitles ? 'Generiere...' : subtitles ? 'Neu generieren' : 'Untertitel'}</span>
                  </button>
                )}
              </div>
            </div>

            {showStyling && (
              <div className="styling-section">
                <div className="style-options-compact">
                  <h4>Stil</h4>
                  <div className="style-options-grid style-grid-2x2">
                    {styleOptions.map(option => (
                      <label
                        key={option.id}
                        className={`style-option-card ${localStyle === option.id ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="styleOption"
                          value={option.id}
                          checked={localStyle === option.id}
                          onChange={() => handleLocalStyleChange(option.id)}
                          className="style-option-radio"
                        />
                        <div className="style-option-content">
                          <div className="style-option-header">
                            <h4 className="style-option-name">
                              {option.isRecommended && <span className="recommended-badge">★</span>}
                              {option.name}
                            </h4>
                          </div>
                          <div className="style-option-preview">
                            <span className="preview-text" style={option.preview}>
                              Beispiel
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <div className="setting-group">
                    <h4>Position</h4>
                    <div className="setting-buttons">
                      {heightOptions.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          className={`setting-button ${localHeight === option.id ? 'active' : ''}`}
                          onClick={() => handleLocalHeightChange(option.id)}
                        >
                          <span className="setting-button-title">{option.name}</span>
                          {option.subtitle && <span className="setting-button-subtitle">{option.subtitle}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="setting-group">
                    <h4>Qualität</h4>
                    <div className="setting-buttons">
                      {qualityOptions.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          className={`setting-button ${localQuality === option.id ? 'active' : ''}`}
                          onClick={() => handleLocalQualityChange(option.id)}
                        >
                          <span className="setting-button-title">{option.name}</span>
                          {option.subtitle && <span className="setting-button-subtitle">{option.subtitle}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Timeline
              subtitles={subtitles}
              onSubtitleClick={onSubtitleClick}
              onSubtitleUpdate={onSubtitleUpdate}
              onOverlayDoubleClick={(overlay) => setEditingOverlayId(overlay.id)}
            />

            <div className="video-editor__timeline-controls">
              <button
                className="btn-primary size-s"
                onClick={handleSplit}
                aria-label="An Abspielposition schneiden"
                title="Schneiden"
              >
                <FiScissors />
                <span>Schneiden</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {editingOverlayId && (
        <TextOverlayPanel
          overlayId={editingOverlayId}
          onClose={() => setEditingOverlayId(null)}
        />
      )}

      <input
        ref={clipFileInputRef}
        type="file"
        accept="video/*"
        onChange={handleClipFileSelect}
        hidden
      />

      {showRegenerateConfirm && (
        <div className="video-editor__confirm-overlay" onClick={() => setShowRegenerateConfirm(false)}>
          <div className="video-editor__confirm-popup" onClick={(e) => e.stopPropagation()}>
            <div className="video-editor__confirm-icon">
              <FiAlertTriangle />
            </div>
            <h3 className="video-editor__confirm-title">Untertitel neu generieren?</h3>
            <p className="video-editor__confirm-text">
              Die Generierung verbraucht Energie und Rechenleistung.
            </p>
            <p className="video-editor__confirm-text">
              Bitte nur neu generieren, wenn das Video fertig geschnitten ist.
            </p>
            <div className="video-editor__confirm-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowRegenerateConfirm(false)}
              >
                Abbrechen
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setShowRegenerateConfirm(false);
                  onGenerateSubtitles();
                }}
              >
                <FiRefreshCw />
                <span>Neu generieren</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="video-editor__export-modal-overlay" onClick={handleCloseExportModal}>
          <div className="video-editor__export-modal" onClick={(e) => e.stopPropagation()}>
            <button className="video-editor__export-modal-close" onClick={handleCloseExportModal}>
              <FiX />
            </button>

            {(exportStatus === 'starting' || exportStatus === 'exporting') && (
              <>
                <div className="video-editor__export-icon video-editor__export-icon--processing">
                  <div className="video-editor__export-spinner" />
                </div>
                <h3 className="video-editor__export-title">Video wird exportiert...</h3>
                <div className="video-editor__export-progress">
                  <div
                    className="video-editor__export-progress-bar"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="video-editor__export-status">{exportProgress}% abgeschlossen</p>
              </>
            )}

            {exportStatus === 'complete' && (
              <>
                <div className="video-editor__export-icon video-editor__export-icon--success">
                  <FiCheck />
                </div>
                <h3 className="video-editor__export-title">Export abgeschlossen!</h3>
                <p className="video-editor__export-status">Dein Video ist bereit zum Download.</p>
                <button className="video-editor__export-download-btn" onClick={handleDownload}>
                  <FiDownload />
                  <span>Video herunterladen</span>
                </button>
              </>
            )}

            {exportStatus === 'error' && (
              <>
                <div className="video-editor__export-icon video-editor__export-icon--error">
                  <FiAlertTriangle />
                </div>
                <h3 className="video-editor__export-title">Export fehlgeschlagen</h3>
                <p className="video-editor__export-status video-editor__export-status--error">
                  {exportError || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.'}
                </p>
                <button className="video-editor__export-retry-btn" onClick={handleExport}>
                  <FiRefreshCw />
                  <span>Erneut versuchen</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

VideoEditor.propTypes = {
  videoUrl: PropTypes.string.isRequired,
  videoFile: PropTypes.object,
  videoMetadata: PropTypes.shape({
    duration: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired
  }).isRequired,
  uploadId: PropTypes.string,
  onSegmentsChange: PropTypes.func,
  onGenerateSubtitles: PropTypes.func,
  subtitles: PropTypes.string,
  isGeneratingSubtitles: PropTypes.bool,
  stylePreference: PropTypes.string,
  heightPreference: PropTypes.string,
  onSubtitleClick: PropTypes.func,
  onSubtitleUpdate: PropTypes.func
};

export default VideoEditor;
