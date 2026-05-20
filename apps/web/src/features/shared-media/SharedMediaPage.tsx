import { Button } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { FaInstagram } from 'react-icons/fa';
import { useParams } from 'react-router-dom';

import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import Spinner from '../../components/common/Spinner';
import apiClient from '../../components/utils/apiClient';
import { buildUrl } from '../../config/domains';
import { useAuthStore } from '../../stores/authStore';
import { cn } from '../../utils/cn';
import { canShare, shareContent, copyToClipboard } from '../../utils/shareUtils';

const TransferDownloadPage = lazy(() => import('../transfer/components/TransferDownloadPage'));

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

interface TransferFields {
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  isPasswordProtected: boolean;
  expiresAt: string | null;
  transferMessage: string | null;
  transferFiles: Array<{ name: string; size: number; mimeType: string }> | null;
}

interface ShareData extends Partial<TransferFields> {
  title: string;
  mediaType: 'video' | 'image' | 'transfer';
  sharerName: string;
  status: 'processing' | 'ready' | 'failed';
  downloadCount?: number;
}

interface ShareApiResponse {
  success: boolean;
  share?: ShareData;
}

const SharedMediaPage = () => {
  const { shareToken } = useParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
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
    void checkShareCapability();
  }, []);

  const shareQuery = useQuery<ShareData | null, Error>({
    queryKey: ['share', shareToken],
    queryFn: async () => {
      const response = await apiClient.get<ShareApiResponse>(`/share/${shareToken}`, {
        skipAuthRedirect: true,
      });
      return response.data.success ? (response.data.share ?? null) : null;
    },
    enabled: Boolean(shareToken),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 5000 : false),
  });

  const shareData = shareQuery.data ?? null;
  const loading = shareQuery.isLoading;
  const isProcessing = shareData?.status === 'processing';

  const queryErrorMessage = (() => {
    if (!shareQuery.error) return null;
    const status = (shareQuery.error as { response?: { status?: number } })?.response?.status;
    if (status === 410) return 'Dieser Link ist nicht mehr gültig.';
    if (status === 404) return 'Dieses Medium existiert nicht oder wurde gelöscht.';
    return 'Fehler beim Laden des Mediums.';
  })();

  const failedErrorMessage =
    shareData?.status === 'failed'
      ? 'Das Medium konnte nicht verarbeitet werden. Bitte erstelle einen neuen Share-Link.'
      : null;

  const error = manualError ?? queryErrorMessage ?? failedErrorMessage;

  const handleDownload = async () => {
    if (!isAuthenticated) return;

    setDownloadError('');
    setIsDownloading(true);

    try {
      const response = await apiClient.get<Blob>(`/share/${shareToken}/download`, {
        responseType: 'blob',
      });

      const mimeType = shareData?.mediaType === 'video' ? 'video/mp4' : 'image/png';
      const extension = shareData?.mediaType === 'video' ? 'mp4' : 'png';

      const blob = new Blob([response.data as BlobPart], { type: mimeType });
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
        setManualError('Dieser Link ist nicht mehr gültig.');
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
      const response = await apiClient.get<Blob>(`/share/${shareToken}/preview`, {
        responseType: 'blob',
      });
      const blob = response.data as Blob;
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
      <div className="min-h-screen flex items-center justify-center p-lg bg-background-alt">
        <div className="bg-background rounded-xl shadow-lg max-w-[500px] w-full overflow-hidden border border-grey-200 dark:border-grey-700">
          <div className="p-2xl text-center">
            <div className="size-12 border-4 border-grey-200 border-t-secondary-600 rounded-full animate-spin mx-auto mb-md" />
            <p className="text-grey-400 m-0">Medium wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-lg bg-background-alt">
        <div className="bg-background rounded-xl shadow-lg max-w-[500px] w-full overflow-hidden border border-grey-200 dark:border-grey-700">
          <div className="p-2xl text-center">
            <svg
              className="text-grey-400 mb-md"
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
            <h2 className="m-0 mb-sm text-foreground-heading">Fehler</h2>
            <p className="text-grey-400 m-0">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-lg bg-background-alt">
        <div className="bg-background rounded-xl shadow-lg max-w-[500px] w-full overflow-hidden border border-grey-200 dark:border-grey-700">
          <div className="p-2xl text-center">
            <div className="size-12 border-4 border-grey-200 border-t-secondary-600 rounded-full animate-spin mx-auto mb-md" />
            <h2 className="m-0 mb-sm text-foreground-heading">
              {shareData?.mediaType === 'video'
                ? 'Video wird gerendert...'
                : 'Bild wird verarbeitet...'}
            </h2>
            <p className="text-grey-400 m-0">
              Das Medium wird gerade vorbereitet. Dies kann einige Minuten dauern.
            </p>
            <p className="text-sm mt-md text-grey-400 opacity-70">
              Diese Seite aktualisiert sich automatisch.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Transfer downloads get their own dedicated page
  if (shareData?.mediaType === 'transfer' && shareToken) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background-alt">
            <Spinner />
          </div>
        }
      >
        <TransferDownloadPage
          shareToken={shareToken}
          shareData={{
            fileName: shareData.fileName ?? null,
            fileSize: shareData.fileSize ?? null,
            mimeType: shareData.mimeType ?? null,
            sharerName: shareData.sharerName,
            downloadCount: shareData.downloadCount ?? 0,
            isPasswordProtected: shareData.isPasswordProtected ?? false,
            expiresAt: shareData.expiresAt ?? null,
            transferMessage: shareData.transferMessage ?? null,
            transferFiles: shareData.transferFiles ?? null,
          }}
        />
      </Suspense>
    );
  }

  const isVideo = shareData?.mediaType === 'video';

  return (
    <div className="min-h-screen flex items-center justify-center p-lg max-md:p-md max-md:items-start bg-background-alt">
      <div className="relative bg-background rounded-xl shadow-lg border border-grey-200 dark:border-grey-700 flex max-w-[1400px] max-md:flex-col max-md:w-full overflow-hidden">
        <button
          className="absolute top-md right-md z-10 bg-none border-none p-0 cursor-pointer transition-transform duration-200 hover:scale-105 max-md:hidden"
          onClick={handleShare}
          title={copied ? 'Link kopiert!' : 'Klicken zum Teilen'}
        >
          <QRCodeSVG value={window.location.href} size={64} level="M" />
          {copied && (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary-600 text-white px-sm py-xxs rounded-sm text-xs whitespace-nowrap">
              Kopiert!
            </span>
          )}
        </button>
        <div className="shrink-0 flex items-center justify-center bg-background-alt">
          {isVideo ? (
            <video
              className="block max-h-[80vh] max-md:max-h-[50vh] max-md:w-full"
              controls
              preload="metadata"
              playsInline
            >
              <source src={`${baseURL}/share/${shareToken}/preview`} type="video/mp4" />
              Dein Browser unterstützt keine Video-Wiedergabe.
            </video>
          ) : (
            <img
              src={`${baseURL}/share/${shareToken}/preview`}
              alt={shareData?.title || 'Geteiltes Bild'}
              className="block max-h-[80vh] max-w-full object-contain max-md:max-h-[50vh] max-md:w-full"
            />
          )}
        </div>

        <div className="flex flex-col p-lg min-w-[280px] max-md:text-center max-md:min-w-0">
          <div className="flex-1">
            <p className="m-0 mb-sm text-base text-foreground">
              <strong>{shareData?.sharerName || 'Jemand'}</strong> hat{' '}
              {isVideo ? 'ein Video' : 'ein Bild'} mit dir geteilt
            </p>
            <h1 className="m-0 mb-sm text-[1.75rem] text-foreground-heading">
              {shareData?.title || (isVideo ? 'Geteiltes Video' : 'Geteiltes Bild')}
            </h1>

            <div className="mt-xl">
              {!isAuthenticated ? (
                <LoginRequired
                  variant="inline"
                  title={isVideo ? 'Video herunterladen' : 'Bild herunterladen'}
                  message={`Melde dich an, um ${isVideo ? 'dieses Video' : 'dieses Bild'} herunterzuladen.`}
                />
              ) : downloadSuccess ? (
                <div className="flex items-center gap-sm p-md bg-background rounded-sm text-secondary-600 border border-grey-200 dark:border-grey-700">
                  <svg
                    className="shrink-0"
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
                  <div className={cn('flex gap-sm', 'max-md:flex-col [&_button]:max-md:w-full')}>
                    <Button
                      variant="brand"
                      size="brand"
                      onClick={handleDownload}
                      disabled={isDownloading}
                    >
                      {isDownloading
                        ? 'Wird geladen...'
                        : isVideo
                          ? 'Video herunterladen'
                          : 'Bild herunterladen'}
                    </Button>
                    <Button variant="brand" size="brand" onClick={handleShare}>
                      {copied ? 'Link kopiert!' : 'Link teilen'}
                    </Button>
                    {canNativeShare && (
                      <Button
                        variant="brand"
                        size="brand"
                        onClick={handleShareToInstagram}
                        disabled={isSharing}
                        title="Auf Instagram posten"
                      >
                        {isSharing ? <Spinner size="small" white /> : <FaInstagram />}
                        Posten
                      </Button>
                    )}
                  </div>

                  {downloadError && (
                    <div className="text-[var(--error-red)] text-sm mt-sm">{downloadError}</div>
                  )}
                </>
              )}
            </div>

            <div className="mt-lg pt-md border-t border-grey-200 dark:border-grey-700">
              <p className="m-0 text-sm text-grey-400">
                Willst du auch {isVideo ? 'solche Videos' : 'solche Bilder'} erstellen? Mit dem{' '}
                <a
                  href={buildUrl(isVideo ? '/subtitler' : '/studio')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-600 no-underline hover:underline"
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
