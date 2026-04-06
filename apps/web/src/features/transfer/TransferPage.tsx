import { Button, FileCard, RetroGrid } from '@gruenerator/ui';
import { useShareLinks, useWolkePreferencesStore } from '@gruenerator/wolke';
import { useCallback, useState } from 'react';
import { PiCheck, PiCopy, PiFile, PiPlus, PiShareNetwork, PiUploadSimple } from 'react-icons/pi';
import { QRCode } from 'react-qr-code';
import { Link } from 'react-router-dom';

import Spinner from '../../components/common/Spinner';
import { buildUrl } from '../../config/domains';
import { formatFileSize } from '../../utils/formatFileSize';
import { canShare, shareContent, copyToClipboard } from '../../utils/shareUtils';

import TransferList from './components/TransferList';
import TransferOptionsPanel, { type ExpiryOption } from './components/TransferOptionsPanel';
import TransferUploadZone from './components/TransferUploadZone';
import { useUploadTransfer } from './hooks/useTransfer';

type TransferStatus = 'idle' | 'ready' | 'uploading' | 'done' | 'error';

const FILE_TYPE_BADGES = ['PDF', 'Office', 'Bilder', 'Videos', 'Audio', 'ZIP'] as const;

const TransferPageHeader = () => (
  <div className="flex w-full flex-col items-center gap-xs pb-lg text-center">
    <h1 className="m-0 text-[2.2rem] font-semibold text-foreground max-md:text-[1.8rem] max-[480px]:text-[1.5rem]">
      Transfer
    </h1>
    <p className="m-0 text-base font-normal leading-relaxed text-foreground max-md:text-[0.9375rem]">
      Dateien sicher hochladen und per Link teilen
    </p>
    <div className="mt-sm flex flex-wrap justify-center gap-sm">
      {FILE_TYPE_BADGES.map((type) => (
        <span
          key={type}
          className="inline-block whitespace-nowrap rounded-2xl border border-grey-300 bg-transparent px-3 py-1 text-xs font-medium tracking-[0.02em] text-foreground dark:border-grey-600"
        >
          {type}
        </span>
      ))}
      <span className="inline-block whitespace-nowrap rounded-2xl border border-grey-300 bg-transparent px-3 py-1 text-xs font-medium tracking-[0.02em] text-foreground dark:border-grey-600">
        bis 2 GB
      </span>
    </div>
  </div>
);

const TransferPage = () => {
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Options
  const [expiryDays, setExpiryDays] = useState<ExpiryOption>('7');
  const [password, setPassword] = useState('');
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [message, setMessage] = useState('');

  const { data: shareLinks = [], isLoading: isLoadingLinks } = useShareLinks();
  const uploadMutation = useUploadTransfer();
  const transferFolder = useWolkePreferencesStore((s) => s.transferFolder);

  const activeLinks = shareLinks.filter((l) => l.is_active);
  const hasWolke = activeLinks.length > 0;

  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
    setStatus('ready');
    setError(null);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setStatus('idle');
      }
      return next;
    });
    setError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0 || !hasWolke) return;

    setStatus('uploading');
    setError(null);

    try {
      const shareLinkId = transferFolder.shareLinkId || activeLinks[0].id;
      const expiresInDays = expiryDays === 'none' ? undefined : parseInt(expiryDays, 10);
      const result = await uploadMutation.mutateAsync({
        file: selectedFiles[0],
        shareLinkId,
        folderPath: transferFolder.folderPath,
        password: passwordEnabled && password ? password : undefined,
        expiresInDays,
        message: message || undefined,
      });

      setResultToken(result.shareToken);
      setStatus('done');
    } catch (err) {
      const errMessage =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Upload fehlgeschlagen. Bitte versuche es erneut.';
      setError(errMessage);
      setStatus('error');
    }
  }, [
    selectedFiles,
    hasWolke,
    activeLinks,
    uploadMutation,
    transferFolder,
    expiryDays,
    passwordEnabled,
    password,
    message,
  ]);

  const handleReset = useCallback(() => {
    setSelectedFiles([]);
    setStatus('idle');
    setError(null);
    setResultToken(null);
    setCopied(false);
    setPassword('');
    setPasswordEnabled(false);
    setMessage('');
    setExpiryDays('7');
  }, []);

  const shareUrl = resultToken ? buildUrl(`/share/${resultToken}`) : '';

  const handleCopyLink = async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (canShare()) {
      try {
        await shareContent({
          title: `Transfer: ${selectedFiles[0]?.name || 'Datei'}`,
          text: `Lade dir "${selectedFiles[0]?.name || 'eine Datei'}" herunter:`,
          url: shareUrl,
        });
      } catch {
        await handleCopyLink();
      }
    }
  };

  return (
    <div className="transfer-page relative h-full w-full overflow-clip">
      <RetroGrid
        className="absolute inset-0 h-full w-full"
        angle={65}
        cellSize={60}
        opacity={0.3}
        lightLineColor="#5F8575"
        darkLineColor="#5F8575"
      />
      <div className="relative z-[1] flex h-full min-h-0 flex-col items-center justify-start overflow-y-auto overflow-x-clip px-md py-lg">
        <TransferPageHeader />

        <div className="mx-auto flex w-full max-w-[600px] flex-col gap-lg">
          {status === 'done' && resultToken ? (
            <div className="flex flex-col items-center gap-lg rounded-2xl border border-grey-200 bg-background p-lg dark:border-grey-700">
              <div className="flex flex-col items-center gap-xs text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  <PiCheck className="size-6" />
                </div>
                <h3 className="m-0 text-lg font-semibold text-foreground">Link erstellt</h3>
                <p className="m-0 text-sm text-grey-400">
                  Teile diesen Link, um die Datei herunterladen zu lassen.
                </p>
              </div>

              <div className="flex w-full gap-sm">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-sm border border-grey-200 bg-grey-50 px-md py-sm font-mono text-sm text-foreground dark:border-grey-700 dark:bg-grey-800/50"
                />
                <button
                  className="flex cursor-pointer items-center justify-center rounded-sm border-none bg-primary-600 px-md py-sm text-white transition-colors duration-200 hover:bg-primary-700"
                  onClick={handleCopyLink}
                >
                  {copied ? <PiCheck className="size-5" /> : <PiCopy className="size-5" />}
                </button>
                {canShare() && (
                  <button
                    className="flex cursor-pointer items-center justify-center rounded-sm border-none bg-primary-600 px-md py-sm text-white transition-colors duration-200 hover:bg-primary-700"
                    onClick={handleNativeShare}
                  >
                    <PiShareNetwork className="size-5" />
                  </button>
                )}
              </div>

              <div className="rounded-lg bg-white p-md">
                <QRCode value={shareUrl} size={140} level="M" />
              </div>

              <Button variant="outline" onClick={handleReset} className="w-full">
                Weitere Dateien hochladen
              </Button>
            </div>
          ) : (
            <>
              {status === 'idle' && (
                <TransferUploadZone
                  onFilesSelected={handleFilesSelected}
                  disabled={isLoadingLinks}
                />
              )}

              {(status === 'ready' || status === 'error') && selectedFiles.length > 0 && (
                <div className="flex flex-col gap-md">
                  <div className="flex flex-col gap-sm">
                    {selectedFiles.map((file, idx) => (
                      <FileCard
                        key={`${file.name}-${idx}`}
                        name={file.name}
                        size={file.size}
                        icon={<PiFile size={20} />}
                        onRemove={() => handleRemoveFile(idx)}
                      />
                    ))}
                  </div>

                  <button
                    className="flex w-full cursor-pointer items-center justify-center gap-xs rounded-xl border-2 border-dashed border-grey-300 bg-transparent py-sm text-sm font-medium text-grey-400 transition-colors hover:border-primary-500 hover:text-primary-600 dark:border-grey-600"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) handleFilesSelected(Array.from(files));
                      };
                      input.click();
                    }}
                  >
                    <PiPlus className="size-4" />
                    Weitere Dateien hinzufügen
                  </button>

                  <p className="m-0 text-right text-xs text-grey-400">
                    {selectedFiles.length} {selectedFiles.length === 1 ? 'Datei' : 'Dateien'} ·{' '}
                    {formatFileSize(totalSize)}
                  </p>

                  <TransferOptionsPanel
                    expiryDays={expiryDays}
                    onExpiryChange={setExpiryDays}
                    password={password}
                    onPasswordChange={setPassword}
                    passwordEnabled={passwordEnabled}
                    onPasswordToggle={setPasswordEnabled}
                    message={message}
                    onMessageChange={setMessage}
                  />

                  {!hasWolke && !isLoadingLinks && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-md text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
                      <p className="m-0 mb-sm font-semibold">Wolke-Verbindung benötigt</p>
                      <p className="m-0 mb-sm">
                        Um Dateien zu teilen, verbinde zuerst deine Wolke (Nextcloud).
                      </p>
                      <Link
                        to="/profile/wolke"
                        className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                      >
                        Wolke verbinden →
                      </Link>
                    </div>
                  )}

                  {hasWolke && (
                    <Button
                      onClick={handleUpload}
                      disabled={uploadMutation.isPending}
                      className="w-full"
                    >
                      <PiUploadSimple className="size-4" />
                      Hochladen & Link erstellen
                    </Button>
                  )}

                  {error && (
                    <div className="rounded-lg bg-red-50 p-md text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                      {error}
                    </div>
                  )}
                </div>
              )}

              {status === 'uploading' && (
                <div className="flex flex-col items-center gap-md py-xl">
                  <Spinner />
                  <p className="m-0 text-sm font-medium text-foreground">
                    {selectedFiles.length > 1
                      ? `${selectedFiles.length} Dateien werden hochgeladen...`
                      : 'Datei wird hochgeladen...'}
                  </p>
                  <p className="m-0 text-xs text-grey-400">
                    Die Dateien werden in deiner Wolke gespeichert.
                  </p>
                </div>
              )}
            </>
          )}

          <TransferList />
        </div>
      </div>
    </div>
  );
};

export default TransferPage;
