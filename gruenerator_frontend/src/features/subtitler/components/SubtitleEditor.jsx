import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FaSave, FaCheck, FaDownload, FaMagic, FaPlay, FaPause } from 'react-icons/fa';
import { HiCog } from 'react-icons/hi';
import LiveSubtitlePreview from './LiveSubtitlePreview';
import Timeline from './Timeline';
import FloatingActionButton from '../../../components/common/UI/FloatingActionButton';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { useSubtitlerProjectStore } from '../../../stores/subtitlerProjectStore';
import { useAuthStore } from '../../../stores/authStore';
import useSubtitleCorrection from '../hooks/useSubtitleCorrection';
import '../../../assets/styles/components/subtitler/download-fallback.css';
import '../../../assets/styles/components/ui/button.css';
import '../../../assets/styles/components/ui/spinner.css';
import '../../../assets/styles/components/actions/action-buttons.css';
import '../styles/SubtitleEditor.css';

const SubtitleEditor = ({
  videoFile,
  videoUrl: videoUrlProp,
  subtitles,
  uploadId,
  subtitlePreference,
  stylePreference = 'shadow',
  heightPreference = 'tief',
  onStyleChange,
  onHeightChange,
  onExportSuccess,
  isExporting,
  onExportComplete,
  loadedProject = null,
  videoMetadataFromUpload = null,
  videoFilename = null,
  videoSize = null
}) => {
  // Style options configuration with preview styling
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

  // Local state for style preferences (synced with parent)
  const [localStyle, setLocalStyle] = useState(stylePreference);
  const [localHeight, setLocalHeight] = useState(heightPreference);
  const [localQuality, setLocalQuality] = useState('normal');

  // Sync local state when props change (e.g., when loading a project)
  useEffect(() => {
    setLocalStyle(stylePreference);
  }, [stylePreference]);

  useEffect(() => {
    setLocalHeight(heightPreference);
  }, [heightPreference]);

  const handleLocalStyleChange = (styleId) => {
    setLocalStyle(styleId);
    onStyleChange?.(styleId);
  };

  const handleLocalHeightChange = (heightId) => {
    setLocalHeight(heightId);
    onHeightChange?.(heightId);
  };

  const handleLocalQualityChange = (qualityId) => {
    setLocalQuality(qualityId);
  };
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

  // Use project store for saving
  const { saveProject, updateProject, isSaving, saveSuccess } = useSubtitlerProjectStore();

  // Get user locale and user ID for Austria-specific styling and project exports
  const locale = useAuthStore((state) => state.locale);
  const user = useAuthStore((state) => state.user);
  const videoRef = useRef(null);
  const segmentRefs = useRef({});
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);
  const [error, setError] = useState(null);
  const [currentTimeInSeconds, setCurrentTimeInSeconds] = useState(0);
  const [videoMetadata, setVideoMetadata] = useState(null);
  const [showFallbackButton, setShowFallbackButton] = useState(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showStyling, setShowStyling] = useState(false);
  const [correctedSegmentIds, setCorrectedSegmentIds] = useState(new Set());
  const [correctionMessage, setCorrectionMessage] = useState(null);
  const [isVideoVisible, setIsVideoVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Use subtitle correction hook
  const {
    loading: isCorrecting,
    error: correctionError,
    correctSubtitles
  } = useSubtitleCorrection();

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
    // Use streaming URL directly if provided (for saved projects)
    if (videoUrlProp) {
      console.log('[SubtitleEditor] Using streaming video URL');
      setVideoUrl(videoUrlProp);
      return;
    }

    // Create blob URL from file (for new uploads)
    if (!videoFile) {
      console.log('[SubtitleEditor] No video file or URL provided');
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
  }, [videoFile, videoUrlProp]);

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

  // Track video visibility for floating play button (mobile only)
  useEffect(() => {
    if (!videoRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVideoVisible(entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [videoUrl]);

  // Track video play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoUrl]);

  // Toggle video play/pause
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, []);

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
      setVideoDuration(video.duration);
    }
  };

  // Handle video time updates
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setCurrentTimeInSeconds(currentTime);
    }
  };

  // Timeline handlers
  const handleTimelineSeek = useCallback((timeInSeconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeInSeconds;
    }
  }, []);

  const scrollToSegment = useCallback((segmentId) => {
    const element = segmentRefs.current[segmentId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleSegmentClick = useCallback((segmentId) => {
    setSelectedSegmentId(segmentId);
    const segment = editableSubtitles.find(s => s.id === segmentId);
    if (segment && videoRef.current) {
      videoRef.current.currentTime = segment.startTime;
    }
  }, [editableSubtitles]);

  const handleTextChange = useCallback((segmentId, newText) => {
    setEditableSubtitles(prev =>
      prev.map(segment =>
        segment.id === segmentId ? { ...segment, text: newText } : segment
      )
    );
  }, []);

  // Adjust textarea heights on mobile (must be before early return)
  useEffect(() => {
    if (window.innerWidth <= 768 && (videoFile || videoUrlProp) && subtitles) {
      const textareas = document.querySelectorAll('.segment-text');
      textareas.forEach((element) => {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
      });
    }
  }, [editableSubtitles, videoFile, videoUrlProp, subtitles]);

  // Frühe Rückgabe bei fehlenden Props
  if ((!videoFile && !videoUrlProp) || !subtitles) {
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

  const handleExport = async (maxResolution = null) => {
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
        stylePreference: localStyle,
        heightPreference: localHeight,
        locale,
        maxResolution,
        projectId: loadedProject?.id,
        userId: user?.id
      });

      // Use the centralized store for export
      await startExport(subtitlesText, {
        uploadId,
        subtitlePreference,
        stylePreference: localStyle,
        heightPreference: localHeight,
        locale,
        maxResolution,
        projectId: loadedProject?.id || null,
        userId: user?.id || null
      });

    } catch (error) {
      console.error('[SubtitleEditor] Export initiation error:', error);
      setError(error.message || 'Fehler beim Starten des Exports');
    }
  };

  // Handle saving project
  const handleSaveProject = async () => {
    if (!uploadId || !editableSubtitles.length) {
      setError('Keine Daten zum Speichern vorhanden.');
      return;
    }

    try {
      setError(null);

      // Format subtitles text for storage
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

      if (loadedProject) {
        await updateProject(loadedProject.id, {
          subtitles: subtitlesText,
          stylePreference: localStyle,
          heightPreference: localHeight
        });
      } else {
        // Create new project
        console.log('[SubtitleEditor] Creating new project with uploadId:', uploadId);
        const projectData = {
          uploadId,
          subtitles: subtitlesText,
          title: videoFilename ? videoFilename.replace(/\.[^.]+$/, '') : `Projekt ${new Date().toLocaleDateString('de-DE')}`,
          stylePreference: localStyle,
          heightPreference: localHeight,
          modePreference: subtitlePreference,
          videoMetadata: videoMetadataFromUpload || {},
          videoFilename: videoFilename || 'video.mp4',
          videoSize: videoSize || 0
        };
        await saveProject(projectData);
      }
    } catch (error) {
      console.error('[SubtitleEditor] Save project error:', error);
      setError(error.message || 'Fehler beim Speichern des Projekts');
    }
  };

  // Handle AI correction of subtitles
  const handleCorrection = async () => {
    if (!editableSubtitles.length) return;

    try {
      setError(null);
      setCorrectionMessage(null);

      const response = await correctSubtitles(editableSubtitles);

      if (!response.hasCorrections) {
        setCorrectionMessage('Keine Korrekturen notwendig');
        setTimeout(() => setCorrectionMessage(null), 3000);
        return;
      }

      // Apply corrections to subtitles
      const correctedIds = new Set(response.corrections.map(c => c.id));
      setEditableSubtitles(prev => prev.map(segment => {
        const correction = response.corrections.find(c => c.id === segment.id);
        if (correction) {
          return { ...segment, text: correction.corrected };
        }
        return segment;
      }));

      // Highlight corrected segments
      setCorrectedSegmentIds(correctedIds);
      setCorrectionMessage(`${response.corrections.length} Segment${response.corrections.length > 1 ? 'e' : ''} korrigiert`);

      // Clear highlights after 2 seconds
      setTimeout(() => {
        setCorrectedSegmentIds(new Set());
        setCorrectionMessage(null);
      }, 2000);

    } catch (error) {
      console.error('[SubtitleEditor] Correction error:', error);
      setError(error.message || 'Fehler bei der KI-Korrektur');
    }
  };

  // Check if mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div className="subtitle-editor-container">
      {/* Floating play/pause button for mobile when video is out of view */}
      {isMobile && (
        <FloatingActionButton
          icon={isPlaying ? <FaPause /> : <FaPlay />}
          onClick={togglePlayPause}
          visible={!isVideoVisible}
          position="bottom-left"
        />
      )}

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

      <div className="editor-layout">
        <div className="preview-and-styling">
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
                    stylePreference={localStyle}
                    heightPreference={localHeight}
                    subtitlePreference={subtitlePreference}
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
            <div className="video-controls">
              <button
                className="btn-icon btn-primary"
                onClick={() => handleExport(localQuality === 'normal' ? 1080 : null)}
                disabled={isExporting || exportStatus === 'starting' || exportStatus === 'exporting'}
                title={localQuality === 'normal' ? 'Download (1080p)' : 'Download (HD)'}
              >
                {(isExporting || exportStatus === 'starting' || exportStatus === 'exporting') ? (
                  <div className="button-spinner" />
                ) : (
                  <FaDownload />
                )}
              </button>
              <button
                className={`btn-icon btn-secondary ${saveSuccess ? 'submit-button--success' : ''}`}
                onClick={handleSaveProject}
                disabled={!editableSubtitles.length}
                title="Projekt speichern"
              >
                {saveSuccess ? <FaCheck /> : <FaSave />}
              </button>
              <button
                className={`btn-icon ${showStyling ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowStyling(!showStyling)}
                title="Einstellungen"
              >
                <HiCog />
              </button>
              <button
                className="btn-icon btn-secondary"
                onClick={handleCorrection}
                disabled={isCorrecting || !editableSubtitles.length}
                title="AI-Korrektur"
              >
                {isCorrecting ? (
                  <span className="spinner spinner-small" />
                ) : (
                  <FaMagic />
                )}
              </button>
            </div>
            {correctionMessage && (
              <div className="correction-message">
                {correctionMessage}
              </div>
            )}
          </div>

          {showStyling ? (
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
          ) : (
          <div className="timeline-inline">
            <Timeline
              duration={videoDuration}
              currentTime={currentTimeInSeconds}
              segments={editableSubtitles}
              selectedSegmentId={selectedSegmentId}
              correctedSegmentIds={correctedSegmentIds}
              onSeek={handleTimelineSeek}
              onSegmentClick={handleSegmentClick}
              onTextChange={handleTextChange}
            />
          </div>
          )}
        </div>
      </div>

    </div>
  );
};

SubtitleEditor.propTypes = {
  videoFile: PropTypes.instanceOf(File),
  videoUrl: PropTypes.string,
  subtitles: PropTypes.string.isRequired,
  uploadId: PropTypes.string.isRequired,
  subtitlePreference: PropTypes.string.isRequired,
  stylePreference: PropTypes.oneOf(['standard', 'clean', 'shadow', 'tanne']),
  heightPreference: PropTypes.oneOf(['standard', 'tief']),
  onStyleChange: PropTypes.func,
  onHeightChange: PropTypes.func,
  onExportSuccess: PropTypes.func.isRequired,
  isExporting: PropTypes.bool,
  onExportComplete: PropTypes.func,
  loadedProject: PropTypes.object,
  videoMetadataFromUpload: PropTypes.object,
  videoFilename: PropTypes.string,
  videoSize: PropTypes.number
};

export default SubtitleEditor; 