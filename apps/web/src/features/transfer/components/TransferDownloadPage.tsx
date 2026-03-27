import { Button, Input } from '@gruenerator/ui';
import { useState } from 'react';
import {
  PiDownloadSimple,
  PiFile,
  PiFilePdf,
  PiFileZip,
  PiFileDoc,
  PiImage,
  PiVideoCamera,
  PiMusicNote,
  PiLock,
  PiTimer,
} from 'react-icons/pi';

import Spinner from '../../../components/common/Spinner';
import { buildUrl } from '../../../config/domains';
import { formatFileSize } from '../../../utils/formatFileSize';

interface TransferShareData {
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  sharerName: string;
  downloadCount: number;
  isPasswordProtected: boolean;
  expiresAt: string | null;
  transferMessage: string | null;
  transferFiles: Array<{ name: string; size: number; mimeType: string }> | null;
}

interface TransferDownloadPageProps {
  shareToken: string;
  shareData: TransferShareData;
}

function formatExpiryDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return 'Abgelaufen';
  if (days === 1) return 'Läuft morgen ab';
  return `Läuft in ${days} Tagen ab`;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <PiFile className="size-8 text-grey-400" />;
  if (mimeType.includes('pdf')) return <PiFilePdf className="size-8 text-red-500" />;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z'))
    return <PiFileZip className="size-8 text-amber-500" />;
  if (mimeType.includes('word') || mimeType.includes('document') || mimeType.includes('odt'))
    return <PiFileDoc className="size-8 text-blue-500" />;
  if (mimeType.startsWith('image/')) return <PiImage className="size-8 text-teal-500" />;
  if (mimeType.startsWith('video/')) return <PiVideoCamera className="size-8 text-purple-500" />;
  if (mimeType.startsWith('audio/')) return <PiMusicNote className="size-8 text-pink-500" />;
  return <PiFile className="size-8 text-grey-400" />;
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export default function TransferDownloadPage({ shareToken, shareData }: TransferDownloadPageProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleDownload = async () => {
    setDownloadError('');
    setPasswordError('');

    if (shareData.isPasswordProtected && !password) {
      setPasswordError('Bitte gib das Passwort ein.');
      return;
    }

    setIsDownloading(true);

    try {
      const url = new URL(`${baseURL}/share/${shareToken}/download`, window.location.origin);
      const headers: Record<string, string> = {};
      if (shareData.isPasswordProtected && password) {
        headers['x-transfer-password'] = password;
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setPasswordError('Falsches Passwort.');
          setIsDownloading(false);
          return;
        }
        if (response.status === 410) {
          setDownloadError('Dieser Transfer-Link ist abgelaufen.');
          setIsDownloading(false);
          return;
        }
        throw new Error('Download fehlgeschlagen');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = shareData.fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      setDownloadError('Download fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-alt p-lg max-md:items-start max-md:p-md">
      <div className="w-full max-w-[480px] overflow-hidden rounded-xl border border-grey-200 bg-background shadow-lg dark:border-grey-700">
        <div className="flex flex-col items-center gap-sm border-b border-grey-200 px-lg py-xl text-center dark:border-grey-700">
          <p className="m-0 text-sm text-grey-400">
            <strong className="text-foreground">{shareData.sharerName || 'Jemand'}</strong> hat
            Dateien mit dir geteilt
          </p>

          {shareData.transferMessage && (
            <p className="m-0 mt-xs text-sm italic text-grey-400">
              &ldquo;{shareData.transferMessage}&rdquo;
            </p>
          )}
        </div>

        <div className="flex flex-col gap-sm px-lg py-md">
          {shareData.transferFiles && shareData.transferFiles.length > 1 ? (
            shareData.transferFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-md rounded-lg bg-grey-50 p-sm dark:bg-grey-800/50"
              >
                {getFileIcon(file.mimeType)}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{file.name}</span>
                  <span className="text-xs text-grey-400">{formatFileSize(file.size)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-md rounded-lg bg-grey-50 p-md dark:bg-grey-800/50">
              {getFileIcon(shareData.mimeType)}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {shareData.fileName || 'Datei'}
                </span>
                {shareData.fileSize && (
                  <span className="text-xs text-grey-400">
                    {formatFileSize(shareData.fileSize)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-lg px-lg pb-sm text-xs text-grey-400">
          {shareData.expiresAt && (
            <span className="flex items-center gap-1">
              <PiTimer className="size-3" />
              {formatExpiryDate(shareData.expiresAt)}
            </span>
          )}
          {shareData.downloadCount > 0 && (
            <span className="flex items-center gap-1">
              <PiDownloadSimple className="size-3" />
              {shareData.downloadCount}x heruntergeladen
            </span>
          )}
        </div>

        <div className="flex flex-col gap-sm px-lg pb-lg pt-sm">
          {shareData.isPasswordProtected && (
            <div className="flex flex-col gap-xs">
              <div className="flex items-center gap-xs text-sm text-grey-400">
                <PiLock className="size-4" />
                <span>Dieser Transfer ist passwortgeschützt</span>
              </div>
              <Input
                type="password"
                placeholder="Passwort eingeben"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDownload();
                }}
                className="text-sm"
              />
              {passwordError && (
                <p className="m-0 text-xs text-red-600 dark:text-red-400">{passwordError}</p>
              )}
            </div>
          )}

          <Button
            variant="brand"
            size="brand"
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full"
          >
            {isDownloading ? (
              <>
                <Spinner size="small" white />
                Wird heruntergeladen...
              </>
            ) : (
              <>
                <PiDownloadSimple className="size-5" />
                Herunterladen
              </>
            )}
          </Button>

          {downloadError && (
            <p className="m-0 text-center text-sm text-red-600 dark:text-red-400">
              {downloadError}
            </p>
          )}
        </div>

        <div className="border-t border-grey-200 px-lg py-md text-center dark:border-grey-700">
          <p className="m-0 text-xs text-grey-400">
            Powered by{' '}
            <a
              href={buildUrl('/')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 no-underline hover:underline dark:text-primary-400"
            >
              Grünerator
            </a>{' '}
            — Dateien werden direkt von der Wolke der absendenden Person übertragen.
          </p>
        </div>
      </div>
    </div>
  );
}
