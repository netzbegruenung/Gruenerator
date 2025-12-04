import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import LoginRequired from '../../../components/common/LoginRequired/LoginRequired';
import apiClient from '../../../components/utils/apiClient';
import '../styles/SharedVideoPage.css';
import '../../../assets/styles/components/ui/button.css';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const SharedVideoPage = () => {
  const { shareToken } = useParams();
  const { user, isAuthenticated } = useOptimizedAuth();
  const [shareData, setShareData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    const fetchShareData = async () => {
      try {
        const response = await apiClient.get(`/subtitler/share/${shareToken}`, {
          skipAuthRedirect: true
        });
        if (response.data.success) {
          setShareData(response.data.share);
        }
      } catch (err) {
        if (err.response?.status === 410) {
          setExpired(true);
        } else if (err.response?.status === 404) {
          setError('Dieses Video existiert nicht oder wurde gelöscht.');
        } else {
          setError('Fehler beim Laden des Videos.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchShareData();
  }, [shareToken]);

  const handleDownload = async () => {
    if (!isAuthenticated) return;

    setDownloadError('');
    setIsDownloading(true);

    try {
      const response = await apiClient.get(
        `/subtitler/share/${shareToken}/download`,
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'video/mp4' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const filename = `${shareData?.title || 'video'}_gruenerator.mp4`.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      if (err.response?.status === 410) {
        setExpired(true);
      } else {
        setDownloadError('Download fehlgeschlagen. Bitte versuche es erneut.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatExpiration = (expiresAt) => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="shared-video-page">
        <div className="shared-video-container">
          <div className="shared-video-loading">
            <div className="spinner" />
            <p>Video wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="shared-video-page">
        <div className="shared-video-container">
          <div className="shared-video-expired">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            <h2>Link abgelaufen</h2>
            <p>Dieser Download-Link ist nicht mehr gültig. Bitte fordere einen neuen Link an.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-video-page">
        <div className="shared-video-container">
          <div className="shared-video-error">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <h2>Fehler</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-video-page">
      <div className="shared-video-card">
        <div className="shared-video-left">
          <video
            controls
            preload="metadata"
            playsInline
          >
            <source src={`${baseURL}/subtitler/share/${shareToken}/preview`} type="video/mp4" />
            Dein Browser unterstützt keine Video-Wiedergabe.
          </video>
        </div>

        <div className="shared-video-right">
          <div className="shared-video-content">
            <p className="shared-by-message">
              <strong>{shareData?.sharerName || 'Jemand'}</strong> hat ein Reel mit dir geteilt
            </p>
            <h1>{shareData?.title || 'Geteiltes Video'}</h1>
            {shareData?.duration && (
              <span className="video-duration">{formatDuration(shareData.duration)}</span>
            )}

            <div className="shared-video-download">
              {!isAuthenticated ? (
                <LoginRequired
                  variant="inline"
                  title="Video herunterladen"
                  message="Melde dich an, um dieses Video herunterzuladen."
                />
              ) : downloadSuccess ? (
                <div className="download-success-inline">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22,4 12,14.01 9,11.01" />
                  </svg>
                  <span>Download gestartet!</span>
                </div>
              ) : (
                <>
                  <button
                    className="btn-primary"
                    onClick={handleDownload}
                    disabled={isDownloading}
                  >
                    {isDownloading ? 'Wird geladen...' : 'Video herunterladen'}
                  </button>

                  {downloadError && (
                    <div className="download-error">{downloadError}</div>
                  )}
                </>
              )}

              {shareData?.expiresAt && (
                <p className="expiration-info">
                  Gültig bis {formatExpiration(shareData.expiresAt)}
                </p>
              )}
            </div>

            <div className="shared-video-footer">
              <p>
                Erstellt mit <a href="https://gruenerator.de" target="_blank" rel="noopener noreferrer">Grünerator</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedVideoPage;
