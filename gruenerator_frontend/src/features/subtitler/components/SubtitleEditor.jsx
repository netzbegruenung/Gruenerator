import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import apiClient from '../../../components/utils/apiClient';
import '../styles/SubtitleEditor.css'; // Import CSS
import { FaTrash } from 'react-icons/fa'; // Beispiel für Löschen-Icon

// Hilfsfunktion zum Formatieren von Sekunden in HH:MM:SS,ms
const formatTime = (totalSeconds) => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00,000';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};

// Hilfsfunktion zum Parsen von HH:MM:SS,ms in Sekunden
const parseTime = (timeString) => {
  if (!timeString || typeof timeString !== 'string') return 0;
  const parts = timeString.split(/[:,]/);
  if (parts.length !== 4) return 0; // Invalid format
  const [hours, minutes, seconds, milliseconds] = parts.map(Number);
  if ([hours, minutes, seconds, milliseconds].some(isNaN)) return 0; // Contains non-numeric parts
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
};

const SubtitleEditor = ({
  videoFile,
  initialSubtitles, // Umbenannt von subtitles zu initialSubtitles
  uploadId,
  onExportSuccess,
  onExportComplete,
  isExporting,
  isProModeActive,    // Neuer Prop
  onSubtitlesChange   // Neuer Prop
}) => {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);
  const [error, setError] = useState(null);

  // Lokalen State initialisieren/synchronisieren, wenn initialSubtitles sich ändern
  useEffect(() => {
    if (initialSubtitles) {
      // Erstelle eine tiefe Kopie, um das Original nicht zu mutieren
      try {
          // Sicherstellen, dass initialSubtitles ein Array ist, bevor wir es parsen/stringifizieren
          if (Array.isArray(initialSubtitles)) {
            setEditableSubtitles(JSON.parse(JSON.stringify(initialSubtitles)));
          } else {
            console.warn("initialSubtitles is not an array:", initialSubtitles);
            setEditableSubtitles([]);
          }
      } catch (error) {
          console.error("Error deep copying initial subtitles:", error);
          setEditableSubtitles([]); // Fallback auf leeres Array bei Fehler
      }
    } else {
      setEditableSubtitles([]);
    }
  }, [initialSubtitles]);

  // Handler für Textänderungen
  const handleTextChange = useCallback((index, newText) => {
    // Direkte Mutation vermeiden: Kopie erstellen
    const updatedSubtitles = editableSubtitles.map((item, i) => {
        if (i === index) {
            return { ...item, text: newText };
        }
        return item;
    });
    setEditableSubtitles(updatedSubtitles);
    onSubtitlesChange(updatedSubtitles); // Parent informieren
  }, [editableSubtitles, onSubtitlesChange]);

  // Handler für Zeitänderungen (nur im Profi-Modus)
  const handleTimeChange = useCallback((index, type, newTimeString) => {
     if (!isProModeActive) return; // Nur im Profi-Modus erlaubt

     // Grundlegende Validierung des Formats
     if (!/^\d{2}:\d{2}:\d{2},\d{3}$/.test(newTimeString)) {
         console.warn("Ungültiges Zeitformat:", newTimeString);
         // Optional: Visuelles Feedback an den User geben (z.B. Input rot färben)
         return; 
     }

    const newTimeSeconds = parseTime(newTimeString);

    // Direkte Mutation vermeiden
    const updatedSubtitles = editableSubtitles.map((item, i) => {
        if (i === index) {
            const currentSegment = { ...item }; // Kopie des zu ändernden Segments
            if (type === 'start') {
                // Validierung: Startzeit < Endzeit
                if (newTimeSeconds >= currentSegment.end) {
                    console.warn("Startzeit kann nicht nach oder gleich der Endzeit sein.");
                    // Optional: Feedback
                    return item; // Keine Änderung vornehmen
                }
                currentSegment.start = newTimeSeconds;
            } else if (type === 'end') {
                 // Validierung: Endzeit > Startzeit
                 if (newTimeSeconds <= currentSegment.start) {
                    console.warn("Endzeit kann nicht vor oder gleich der Startzeit sein.");
                    // Optional: Feedback
                    return item; // Keine Änderung vornehmen
                }
                currentSegment.end = newTimeSeconds;
            }
            return currentSegment; // Geändertes Segment zurückgeben
        }
        return item; // Unverändertes Segment zurückgeben
    });

    // Nur updaten, wenn sich wirklich etwas geändert hat (Validierung war erfolgreich)
    if (JSON.stringify(updatedSubtitles) !== JSON.stringify(editableSubtitles)) {
        setEditableSubtitles(updatedSubtitles);
        onSubtitlesChange(updatedSubtitles); // Parent informieren
    }
  }, [editableSubtitles, onSubtitlesChange, isProModeActive]);

  // Handler zum Löschen eines Segments (nur im Profi-Modus)
  const handleDeleteSegment = useCallback((index) => {
     if (!isProModeActive) return; // Nur im Profi-Modus erlaubt

    // Einfaches Löschen: Filtert das Segment am gegebenen Index heraus
    const updatedSubtitles = editableSubtitles.filter((_, i) => i !== index);

    setEditableSubtitles(updatedSubtitles);
    onSubtitlesChange(updatedSubtitles); // Parent informieren
  }, [editableSubtitles, onSubtitlesChange, isProModeActive]);

  // Handler für den Export-Button (verwendet jetzt editableSubtitles)
  const handleFinalExport = useCallback(() => {
    // Rufe die Export-Funktion im Parent mit den bearbeiteten Untertiteln auf
    onExportSuccess(editableSubtitles); 
  }, [editableSubtitles, onExportSuccess]);
  
  // Funktion, um das Video zur Startzeit eines Segments zu springen
  const handleTimeClick = (timeInSeconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeInSeconds;
      // Optional: Video auch abspielen lassen
      // videoRef.current.play(); 
    }
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

  // Frühe Rückgabe bei fehlenden Props
  if (!videoFile || !initialSubtitles) {
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

  const handleDownloadSRT = async () => {
    try {
      console.log('[SubtitleEditor] Downloading SRT for original subtitles:', initialSubtitles);
      
      if (typeof initialSubtitles !== 'string') {
        throw new Error('Ungültiges Format für SRT-Download.');
      }

      const response = await apiClient.post('/subtitler/download-srt', 
        { subtitles: initialSubtitles },
        { responseType: 'blob' }
      );
      
      const filename = videoFile ? 
        `${videoFile.name.split('.')[0]}_untertitel.srt` : 
        'untertitel.srt';
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[SubtitleEditor] SRT download error:', error);
      setError('Fehler beim Herunterladen der SRT-Datei: ' + (error.response?.data?.error || error.message));
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

      <div className="editor-layout">
        <div className="video-preview">
          {videoUrl ? (
            <video 
              ref={videoRef}
              className="preview-video"
              controls
              src={videoUrl}
            >
              Dein Browser unterstützt keine Video-Wiedergabe.
            </video>
          ) : (
            <div className="video-loading">
              {error ? 'Fehler beim Laden des Videos' : 'Video wird geladen...'}
            </div>
          )}
        </div>

        <div className="subtitles-editor">
          <h3>Untertitel bearbeiten</h3>
          <div className="subtitles-list">
            {editableSubtitles && editableSubtitles.length > 0 ? (
              editableSubtitles.map((segment, index) => (
                <div key={segment.id || index} className="subtitle-segment"> {/* Use segment.id if available */} 
                  <div className="segment-header">
                     {isProModeActive ? (
                        <div className="segment-time-inputs">
                            <input
                                type="text"
                                className="segment-time-input"
                                defaultValue={formatTime(segment.start)} // Use defaultValue for uncontrolled or manage state
                                onBlur={(e) => handleTimeChange(index, 'start', e.target.value)} // Update on Blur
                                onKeyDown={(e) => {if(e.key === 'Enter') e.target.blur()}} // Apply on Enter
                                title="Startzeit (HH:MM:SS,ms)"
                                pattern="\d{2}:\d{2}:\d{2},\d{3}" // Basic pattern validation
                            />
                            <span> - </span>
                             <input
                                type="text"
                                className="segment-time-input"
                                defaultValue={formatTime(segment.end)} // Use defaultValue for uncontrolled or manage state
                                onBlur={(e) => handleTimeChange(index, 'end', e.target.value)} // Update on Blur
                                onKeyDown={(e) => {if(e.key === 'Enter') e.target.blur()}} // Apply on Enter
                                title="Endzeit (HH:MM:SS,ms)"
                                pattern="\d{2}:\d{2}:\d{2},\d{3}" // Basic pattern validation
                            />
                        </div>
                    ) : (
                        // Bestehende Anzeige, jetzt klickbar
                        <div 
                          className="segment-time" 
                          onClick={() => handleTimeClick(segment.start)} 
                          title="Zum Video springen"
                          role="button" // Accessibility
                          tabIndex={0} // Accessibility
                          onKeyDown={(e) => {if(e.key === 'Enter' || e.key === ' ') handleTimeClick(segment.start)}} // Accessibility
                        >
                           {formatTime(segment.start)} --> {formatTime(segment.end)}
                        </div>
                    )}
                    {isProModeActive && (
                       <button 
                          className="delete-segment-button" 
                          onClick={() => handleDeleteSegment(index)}
                          title="Segment löschen"
                          aria-label={`Segment ${index + 1} löschen`}
                       >
                          <FaTrash />
                       </button>
                    )}
                  </div>
                  <textarea
                    className="segment-text"
                    value={segment.text} // Controlled component
                    onChange={(e) => handleTextChange(index, e.target.value)}
                    rows={3} // Beispiel: Feste Zeilenanzahl, oder dynamisch
                    aria-label={`Text für Segment ${index + 1}`}
                  />
                </div>
              ))
            ) : (
              <p>Keine Untertitel zum Bearbeiten vorhanden oder sie werden noch geladen.</p> // Angepasster Text
            )}
          </div>
        </div>
      </div>

      <div className="editor-controls">
        <button
          className="btn-primary"
          onClick={handleFinalExport} // Geänderten Handler verwenden
          disabled={isExporting || !editableSubtitles || editableSubtitles.length === 0} // Disable if no subtitles
        >
          {isExporting ? (
            <div className="button-loading-content">
              <div className="button-spinner" />
              <span>Exportiere...</span>
            </div>
           ) : 'Untertitel exportieren & Beitrag erstellen'}
        </button>
        <button 
          className="btn-secondary"
          onClick={handleDownloadSRT}
          disabled={isExporting}
        >
          Untertitel als SRT herunterladen
        </button>
        {/* Optional: Knopf zum Zurücksetzen der Änderungen im Editor */} 
        {/* 
        {isProModeActive && (
          <button 
            className="btn-secondary"
            onClick={() => {
              if (initialSubtitles && Array.isArray(initialSubtitles)) {
                  setEditableSubtitles(JSON.parse(JSON.stringify(initialSubtitles)));
                  onSubtitlesChange(JSON.parse(JSON.stringify(initialSubtitles))); // Parent auch informieren
              }
            }}
            title="Alle Änderungen in diesem Editor verwerfen"
          >
            Änderungen verwerfen
          </button>
        )}
        */}
      </div>
    </div>
  );
};

SubtitleEditor.propTypes = {
  videoFile: PropTypes.instanceOf(File),
  initialSubtitles: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    start: PropTypes.number.isRequired,
    end: PropTypes.number.isRequired,
    text: PropTypes.string.isRequired
  })).isRequired,
  uploadId: PropTypes.string.isRequired,
  onExportSuccess: PropTypes.func.isRequired,
  isExporting: PropTypes.bool,
  onExportComplete: PropTypes.func,
  isProModeActive: PropTypes.bool,
  onSubtitlesChange: PropTypes.func
};

export default SubtitleEditor; 