import { Button } from '@gruenerator/ui';
import React, { useState, useEffect, useCallback } from 'react';
import { FaInstagram } from 'react-icons/fa';
import QRCode from 'react-qr-code';
import { useParams } from 'react-router-dom';

import LoginRequired from '../../../components/common/LoginRequired/LoginRequired';
import Spinner from '../../../components/common/Spinner';
import apiClient from '../../../components/utils/apiClient';
import { buildUrl } from '../../../config/domains';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { canShare, shareContent, copyToClipboard } from '../../../utils/shareUtils';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

interface ShareData {
  title: string;
  sharerName: string;
  status: string;
  expiresAt: string;
}

interface ApiError {
  response?: {
    status: number;
  };
}

const SharedVideoPage = () => {
  const { shareToken } = useParams();
  const { user, isAuthenticated } = useOptimizedAuth();
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

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
        const response = await apiClient.get(`/subtitler/share/${shareToken}`, {
          skipAuthRedirect: true,
        } as Record<string, unknown>);
        if (response.data.success) {
          setShareData(response.data.share);
          if (response.data.share.status === 'rendering') {
            setIsRendering(true);
          } else if (response.data.share.status === 'failed') {
            setError(
              'Das Video konnte nicht gerendert werden. Bitte erstelle einen neuen Share-Link.'
            );
          }
        }
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.response?.status === 410) {
          setExpired(true);
        } else if (apiErr.response?.status === 404) {
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

  useEffect(() => {
    if (!isRendering) return;

    const pollStatus = async () => {
      try {
        const response = await apiClient.get(`/subtitler/share/${shareToken}`, {
          skipAuthRedirect: true,
        } as Record<string, unknown>);
        if (response.data.success) {
          const newStatus = response.data.share.status;
          if (newStatus === 'ready') {
            setIsRendering(false);
            setShareData(response.data.share);
          } else if (newStatus === 'failed') {
            setIsRendering(false);
            setError(
              'Das Video konnte nicht gerendert werden. Bitte erstelle einen neuen Share-Link.'
            );
          }
        }
      } catch (_err) {
        // Silently ignore polling errors
      }
    };

    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [isRendering, shareToken]);

  const handleDownload = async () => {
    if (!isAuthenticated) return;

    setDownloadError('');
    setIsDownloading(true);

    try {
      const response = await apiClient.get(`/subtitler/share/${shareToken}/download`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'video/mp4' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const filename = `${shareData?.title || 'video'}_gruenerator.mp4`.replace(
        /[^a-zA-Z0-9_-]/g,
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
      const apiErr = err as ApiError;
      if (apiErr.response?.status === 410) {
        setExpired(true);
      } else {
        setDownloadError('Download fehlgeschlagen. Bitte versuche es erneut.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = shareData?.title || 'Geteiltes Video';

    if (canShare()) {
      try {
        await shareContent({
          title: shareTitle,
          text: `Schau dir dieses Video an: ${shareTitle}`,
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
      const response = await apiClient.get(`/subtitler/share/${shareToken}/preview`, {
        responseType: 'blob',
      });
      const blob = response.data;
      const file = new File([blob], 'gruenerator_video.mp4', { type: 'video/mp4' });

      await navigator.share({
        files: [file],
        title: shareData?.title || 'Grünerator Video',
        text: '',
      });
    } catch (error: unknown) {
      const shareError = error as { name: string };
      if (shareError.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    } finally {
      setIsSharing(false);
    }
  }, [shareToken, shareData?.title]);

  const formatExpiration = (expiresAt: string) => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const CenteredState = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-lg">
      <div className="flex max-w-[500px] flex-col items-center gap-md text-center">{children}</div>
    </div>
  );

  if (loading) {
    return (
      <CenteredState>
        <Spinner size="large" />
        <p className="text-foreground">Video wird geladen...</p>
      </CenteredState>
    );
  }

  if (expired) {
    return (
      <CenteredState>
        <svg
          className="text-grey-400"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
        <h2 className="text-xl font-semibold text-foreground-heading">Link abgelaufen</h2>
        <p className="text-foreground">
          Dieser Download-Link ist nicht mehr gültig. Bitte fordere einen neuen Link an.
        </p>
      </CenteredState>
    );
  }

  if (error) {
    return (
      <CenteredState>
        <svg
          className="text-red-500"
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
        <h2 className="text-xl font-semibold text-foreground-heading">Fehler</h2>
        <p className="text-foreground">{error}</p>
      </CenteredState>
    );
  }

  if (isRendering) {
    return (
      <CenteredState>
        <Spinner size="large" />
        <h2 className="text-xl font-semibold text-foreground-heading">Video wird gerendert...</h2>
        <p className="text-foreground">
          Das Video wird gerade vorbereitet. Dies kann einige Minuten dauern.
        </p>
        <p className="text-sm text-grey-400">Diese Seite aktualisiert sich automatisch.</p>
      </CenteredState>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-lg">
      <div className="relative w-full max-w-[900px] overflow-hidden rounded-xl border border-grey-200 bg-background shadow-lg dark:border-grey-700 dark:bg-background-alt">
        <button
          className="absolute right-md top-md z-10 rounded-lg bg-white/90 p-xs shadow-sm backdrop-blur-sm transition-transform hover:scale-105"
          onClick={handleShare}
          title={copied ? 'Link kopiert!' : 'Klicken zum Teilen'}
        >
          <QRCode value={window.location.href} size={64} level="M" />
          {copied && (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary-500/90 text-xs font-medium text-white">
              Kopiert!
            </span>
          )}
        </button>

        <div className="flex flex-col md:flex-row">
          <div className="flex-1 bg-black">
            <video
              className="block aspect-[9/16] w-full object-contain md:max-h-[70vh]"
              controls
              preload="metadata"
              playsInline
            >
              <source src={`${baseURL}/subtitler/share/${shareToken}/preview`} type="video/mp4" />
              Dein Browser unterstützt keine Video-Wiedergabe.
            </video>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-md p-lg">
            <p className="text-sm text-grey-500">
              <strong className="text-foreground">{shareData?.sharerName || 'Jemand'}</strong> hat
              ein Reel mit dir geteilt
            </p>
            <h1 className="text-2xl font-bold text-foreground-heading">
              {shareData?.title || 'Geteiltes Video'}
            </h1>

            <div className="flex flex-col gap-sm">
              {!isAuthenticated ? (
                <LoginRequired
                  variant="inline"
                  title="Video herunterladen"
                  message="Melde dich an, um dieses Video herunterzuladen."
                />
              ) : downloadSuccess ? (
                <div className="flex items-center gap-sm text-primary-600">
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
                  <span className="font-medium">Download gestartet!</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-sm max-md:flex-col">
                    <Button onClick={handleDownload} disabled={isDownloading}>
                      {isDownloading ? 'Wird geladen...' : 'Video herunterladen'}
                    </Button>
                    <Button variant="outline" onClick={handleShare}>
                      {copied ? 'Link kopiert!' : 'Link teilen'}
                    </Button>
                    {canNativeShare && (
                      <Button
                        onClick={handleShareToInstagram}
                        disabled={isSharing}
                        title="Auf Instagram posten"
                      >
                        {isSharing ? <Spinner size="small" white /> : <FaInstagram />}
                        Posten
                      </Button>
                    )}
                  </div>

                  {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
                </>
              )}

              {shareData?.expiresAt && (
                <p className="text-xs text-grey-400">
                  Gültig bis {formatExpiration(shareData.expiresAt)}
                </p>
              )}
            </div>

            <div className="border-t border-grey-200 pt-md dark:border-grey-700">
              <p className="text-sm text-grey-500">
                Willst du auch solche Videos erstellen? Mit dem{' '}
                <a
                  href={buildUrl('/subtitler')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary-600 hover:underline"
                >
                  Grünerator
                </a>{' '}
                kannst du Reels mit automatischen Untertiteln und grünem Design erstellen!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedVideoPage;
