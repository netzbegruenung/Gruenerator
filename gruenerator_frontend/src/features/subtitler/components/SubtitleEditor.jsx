import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import apiClient from '../../../components/utils/apiClient';
const SubtitleEditor = ({ videoFile, subtitles, onExportSuccess, isExporting, onExportComplete }) => {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [editableSubtitles, setEditableSubtitles] = useState([]);
  const [error, setError] = useState(null);

  const adjustTextareaHeight = (element) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

  useEffect(() => {
    if (subtitles) {
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
    if (!videoFile || !editableSubtitles.length) return;

    try {
      setError(null);
      const subtitlesText = editableSubtitles
        .map(segment => {
          const startMin = Math.floor(segment.startTime / 60);
          const startSec = Math.floor(segment.startTime % 60);
          const endMin = Math.floor(segment.endTime / 60);
          const endSec = Math.floor(segment.endTime % 60);
          return `${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')}\n${segment.text}`;
        })
        .join('\n\n');

      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('subtitles', subtitlesText);

      onExportSuccess();

      const response = await apiClient.post('/subtitler/export', formData, {
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 300000,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.loaded === progressEvent.total) {
            // Video wurde vollständig heruntergeladen
            onExportComplete && onExportComplete();
          }
        }
      });

      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        const errorData = JSON.parse(new TextDecoder().decode(response.data));
        throw new Error(errorData.error || 'Fehler beim Exportieren');
      }

      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 'video/mp4' 
      });

      const extension = videoFile.name.split('.').pop();
      const filename = `subtitled_${videoFile.name.replace(`.${extension}`, '')}_mit_untertiteln.${extension}`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      let errorMessage = 'Ein Fehler ist aufgetreten';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Die Verarbeitung hat zu lange gedauert. Bitte versuchen Sie es mit einem kürzeren Video.';
      } else if (error.response) {
        if (error.response.data instanceof ArrayBuffer) {
          try {
            const text = new TextDecoder().decode(error.response.data);
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = 'Fehler beim Exportieren des Videos';
          }
        } else {
          errorMessage = error.response.data?.error || error.message || errorMessage;
        }
      }
      
      setError(errorMessage);
    }
  };

  const handleDownloadSRT = async () => {
    try {
      const response = await apiClient.post('/subtitler/download-srt', 
        { subtitles },
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
      setError('Fehler beim Herunterladen der SRT-Datei');
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
          <video 
            ref={videoRef}
            className="preview-video"
            controls
            src={videoUrl}
          >
            Dein Browser unterstützt keine Video-Wiedergabe.
          </video>
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
        <button 
          className="btn-secondary"
          onClick={handleDownloadSRT}
          disabled={isExporting}
        >
          Untertitel als SRT herunterladen
        </button>
      </div>
    </div>
  );
};

SubtitleEditor.propTypes = {
  videoFile: PropTypes.object.isRequired,
  subtitles: PropTypes.string.isRequired,
  onExportSuccess: PropTypes.func.isRequired,
  isExporting: PropTypes.bool,
  onExportComplete: PropTypes.func
};

export default SubtitleEditor; 