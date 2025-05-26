import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import apiClient from '../../../components/utils/apiClient';

const SubtitleEditor = ({ videoFile, subtitles, uploadId, onExportSuccess, isExporting, onExportComplete }) => {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);
  const [error, setError] = useState(null);

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
            {editableSubtitles.map(segment => (
              <div key={segment.id} className="subtitle-segment">
                <div className="segment-time">
                  {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                </div>
                <textarea
                  value={segment.text}
                  onChange={(e) => handleSubtitleEdit(segment.id, e.target.value, e)}
                  className="segment-text"
                  rows={window.innerWidth <= 768 ? undefined : 2}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="editor-controls">
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