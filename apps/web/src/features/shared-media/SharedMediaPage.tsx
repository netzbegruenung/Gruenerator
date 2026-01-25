import { useState, useEffect, useCallback } from 'react';
import { FaInstagram } from 'react-icons/fa';
import QRCode from 'react-qr-code';
import { useParams } from 'react-router-dom';


import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import Spinner from '../../components/common/Spinner';
import apiClient from '../../components/utils/apiClient';
import { buildUrl } from '../../config/domains';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { canShare, shareContent, copyToClipboard } from '../../utils/shareUtils';

import type { AxiosRequestConfig } from 'axios';
import './SharedMediaPage.css';
import '../../assets/styles/components/ui/button.css';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

// Extend axios config to allow skipAuthRedirect
interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  skipAuthRedirect?: boolean;
}

interface ShareData {
  title: string;
  mediaType: 'video' | 'image';
  sharerName: string;
  status: 'processing' | 'ready' | 'failed';
}

const SharedMediaPage = () => {
  const { shareToken } = useParams();
  const { isAuthenticated } = useOptimizedAuth();
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [canNativeShare, setCanNativeShare] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);

  useEffect(() => {
    const checkShareCapability = async () => {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        ) ||
        (navigator.maxTouchPoints > 0 && window.innerWidth <= 768);

      if (!isMobile || !navigator.share || !navigator.canShare) {
        setCanNativeShare(false);
        return;
      }
      try {
        const testFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
        setCanNativeShare(navigator.canShare({ files: [testFile] }));
      } catch {
        setCanNativeShare(false);
      }
    };
    checkShareCapability();
  }, []);

  useEffect(() => {
    const fetchShareData = async () => {
      try {
        const response = await apiClient.get(`/share/${shareToken}`, {
          skipAuthRedirect: true,
        } as ExtendedAxiosRequestConfig);
        if (response.data.success) {
          setShareData(response.data.share);
          if (response.data.share.status === 'processing') {
            setIsProcessing(true);
          } else if (response.data.share.status === 'failed') {
            setError(
              'Das Medium konnte nicht verarbeitet werden. Bitte erstelle einen neuen Share-Link.'
            );
          }
        }
      } catch (err) {
        const error = err as unknown;
        if ((error as { response?: { status?: number } })?.response?.status === 410) {
          setError('Dieser Link ist nicht mehr gültig.');
        } else if ((error as { response?: { status?: number } })?.response?.status === 404) {
          setError('Dieses Medium existiert nicht oder wurde gelöscht.');
        } else {
          setError('Fehler beim Laden des Mediums.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchShareData();
  }, [shareToken]);

  useEffect(() => {
    if (!isProcessing) return;

    const pollStatus = async () => {
      try {
        const response = await apiClient.get(`/share/${shareToken}`, {
          skipAuthRedirect: true,
        } as ExtendedAxiosRequestConfig);
        if (response.data.success) {
          const newStatus = response.data.share.status;
          if (newStatus === 'ready') {
            setIsProcessing(false);
            setShareData(response.data.share);
          } else if (newStatus === 'failed') {
            setIsProcessing(false);
            setError(
              'Das Medium konnte nicht verarbeitet werden. Bitte erstelle einen neuen Share-Link.'
            );
          }
        }
      } catch (err) {
        // Silent fail for polling
      }
    };

    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [isProcessing, shareToken]);

  const handleDownload = async () => {
    if (!isAuthenticated) return;

    setDownloadError('');
    setIsDownloading(true);

    try {
      const response = await apiClient.get(`/share/${shareToken}/download`, {
        responseType: 'blob',
      });

      const mimeType = shareData?.mediaType === 'video' ? 'video/mp4' : 'image/png';
      const extension = shareData?.mediaType === 'video' ? 'mp4' : 'png';

      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const filename = `${shareData?.title || 'media'}_gruenerator.${extension}`.replace(
        /[^a-zA-Z0-9_.-]/g,
        '_'
      );
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      const error = err as unknown;
      if ((error as { response?: { status?: number } })?.response?.status === 410) {
        setError('Dieser Link ist nicht mehr gültig.');
      } else {
        setDownloadError('Download fehlgeschlagen. Bitte versuche es erneut.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = shareData?.title || 'Geteiltes Medium';

    if (canShare()) {
      try {
        await shareContent({
          title: shareTitle,
          text: `Schau dir ${shareData?.mediaType === 'video' ? 'dieses Video' : 'dieses Bild'} an: ${shareTitle}`,
          url: shareUrl,
        });
      } catch {
        await copyToClipboard(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } else {
      await copyToClipboard(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareToInstagram = useCallback(async () => {
    setIsSharing(true);
    try {
      const response = await apiClient.get(`/share/${shareToken}/preview`, {
        responseType: 'blob',
      });
      const blob = response.data;
      const mimeType = shareData?.mediaType === 'video' ? 'video/mp4' : 'image/png';
      const extension = shareData?.mediaType === 'video' ? 'mp4' : 'png';
      const file = new File([blob], `gruenerator_media.${extension}`, { type: mimeType });

      await navigator.share({
        files: [file],
        title: shareData?.title || 'Grünerator Media',
        text: '',
      });
    } catch (err) {
      const error = err as unknown;
      if ((error as { name?: string })?.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    } finally {
      setIsSharing(false);
    }
  }, [shareToken, shareData?.title, shareData?.mediaType]);

  if (loading) {
    return (
      <div className="shared-media-page">
        <div className="shared-media-container">
          <div className="shared-media-loading">
            <div className="spinner" />
            <p>Medium wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-media-page">
        <div className="shared-media-container">
          <div className="shared-media-error">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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

  if (isProcessing) {
    return (
      <div className="shared-media-page">
        <div className="shared-media-container">
          <div className="shared-media-processing">
            <div className="spinner" />
            <h2>
              {shareData?.mediaType === 'video'
                ? 'Video wird gerendert...'
                : 'Bild wird verarbeitet...'}
            </h2>
            <p>Das Medium wird gerade vorbereitet. Dies kann einige Minuten dauern.</p>
            <p className="processing-hint">Diese Seite aktualisiert sich automatisch.</p>
          </div>
        </div>
      </div>
    );
  }

  const isVideo = shareData?.mediaType === 'video';

  return (
    <div className="shared-media-page">
      <div className="shared-media-card">
        <button
          className="shared-media-qr"
          onClick={handleShare}
          title={copied ? 'Link kopiert!' : 'Klicken zum Teilen'}
        >
          <QRCode value={window.location.href} size={64} level="M" />
          {copied && <span className="shared-media-qr-copied">Kopiert!</span>}
        </button>
        <div className="shared-media-left">
          {isVideo ? (
            <video controls preload="metadata" playsInline>
              <source src={`${baseURL}/share/${shareToken}/preview`} type="video/mp4" />
              Dein Browser unterstützt keine Video-Wiedergabe.
            </video>
          ) : (
            <img
              src={`${baseURL}/share/${shareToken}/preview`}
              alt={shareData?.title || 'Geteiltes Bild'}
              className="shared-media-image"
            />
          )}
        </div>

        <div className="shared-media-right">
          <div className="shared-media-content">
            <p className="shared-by-message">
              <strong>{shareData?.sharerName || 'Jemand'}</strong> hat{' '}
              {isVideo ? 'ein Video' : 'ein Bild'} mit dir geteilt
            </p>
            <h1>{shareData?.title || (isVideo ? 'Geteiltes Video' : 'Geteiltes Bild')}</h1>

            <div className="shared-media-download">
              {!isAuthenticated ? (
                <LoginRequired
                  variant="inline"
                  title={isVideo ? 'Video herunterladen' : 'Bild herunterladen'}
                  message={`Melde dich an, um ${isVideo ? 'dieses Video' : 'dieses Bild'} herunterzuladen.`}
                />
              ) : downloadSuccess ? (
                <div className="download-success-inline">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22,4 12,14.01 9,11.01" />
                  </svg>
                  <span>Download gestartet!</span>
                </div>
              ) : (
                <>
                  <div className="shared-media-buttons">
                    <button
                      className="btn-primary"
                      onClick={handleDownload}
                      disabled={isDownloading}
                    >
                      {isDownloading
                        ? 'Wird geladen...'
                        : isVideo
                          ? 'Video herunterladen'
                          : 'Bild herunterladen'}
                    </button>
                    <button className="btn-primary" onClick={handleShare}>
                      {copied ? 'Link kopiert!' : 'Link teilen'}
                    </button>
                    {canNativeShare && (
                      <button
                        className="btn-primary"
                        onClick={handleShareToInstagram}
                        disabled={isSharing}
                        title="Auf Instagram posten"
                      >
                        {isSharing ? <Spinner size="small" white /> : <FaInstagram />}
                        Posten
                      </button>
                    )}
                  </div>

                  {downloadError && <div className="download-error">{downloadError}</div>}
                </>
              )}
            </div>

            <div className="shared-media-footer">
              <p>
                Willst du auch {isVideo ? 'solche Videos' : 'solche Bilder'} erstellen? Mit dem{' '}
                <a
                  href={buildUrl(isVideo ? '/subtitler' : '/image-studio')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Grünerator
                </a>{' '}
                kannst du{' '}
                {isVideo
                  ? 'Reels mit automatischen Untertiteln und grünem Design'
                  : 'Sharepics und Bilder mit grünem Design'}{' '}
                erstellen!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedMediaPage;
