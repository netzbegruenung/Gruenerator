import { Button, FileCard } from '@gruenerator/ui';
import { useShareLinks } from '@gruenerator/wolke';
import { useCallback, useState } from 'react';
import { PiCheck, PiCopy, PiFile, PiShareNetwork, PiUploadSimple } from 'react-icons/pi';
import QRCode from 'react-qr-code';
import { Link } from 'react-router-dom';

import PageContainer from '../../components/common/PageContainer';
import Spinner from '../../components/common/Spinner';
import { buildUrl } from '../../config/domains';
import { canShare, shareContent, copyToClipboard } from '../../utils/shareUtils';

import TransferList from './components/TransferList';
import TransferUploadZone from './components/TransferUploadZone';
import { useUploadTransfer } from './hooks/useTransfer';

type TransferStatus = 'idle' | 'ready' | 'uploading' | 'done' | 'error';

const TransferPage = () => {
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: shareLinks = [], isLoading: isLoadingLinks } = useShareLinks();
  const uploadMutation = useUploadTransfer();

  const activeLinks = shareLinks.filter((l) => l.is_active);
  const hasWolke = activeLinks.length > 0;

  const handleFileSelected = useCallback((file: File) => {
    setSelectedFile(file);
    setStatus('ready');
    setError(null);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setStatus('idle');
    setError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !hasWolke) return;

    setStatus('uploading');
    setError(null);

    try {
      const result = await uploadMutation.mutateAsync({
        file: selectedFile,
        shareLinkId: activeLinks[0].id,
      });

      setResultToken(result.shareToken);
      setStatus('done');
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Upload fehlgeschlagen. Bitte versuche es erneut.';
      setError(message);
      setStatus('error');
    }
  }, [selectedFile, hasWolke, activeLinks, uploadMutation]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setStatus('idle');
    setError(null);
    setResultToken(null);
    setCopied(false);
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
          title: `Transfer: ${selectedFile?.name || 'Datei'}`,
          text: `Lade dir "${selectedFile?.name || 'eine Datei'}" herunter:`,
          url: shareUrl,
        });
      } catch {
        await handleCopyLink();
      }
    }
  };

  return (
    <PageContainer
      title="Transfer"
      subtitle="Dateien sicher hochladen und per Link teilen"
      maxWidth="md"
      gradient
    >
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
                className="flex-1 rounded-sm border border-grey-200 bg-grey-50 px-md py-sm text-sm font-mono text-foreground dark:border-grey-700 dark:bg-grey-800/50"
              />
              <button
                className="flex items-center justify-center rounded-sm border-none bg-primary-600 px-md py-sm text-white cursor-pointer transition-colors duration-200 hover:bg-primary-700"
                onClick={handleCopyLink}
              >
                {copied ? <PiCheck className="size-5" /> : <PiCopy className="size-5" />}
              </button>
              {canShare() && (
                <button
                  className="flex items-center justify-center rounded-sm border-none bg-primary-600 px-md py-sm text-white cursor-pointer transition-colors duration-200 hover:bg-primary-700"
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
              Weitere Datei hochladen
            </Button>
          </div>
        ) : (
          <>
            {status === 'idle' && (
              <TransferUploadZone onFileSelected={handleFileSelected} disabled={isLoadingLinks} />
            )}

            {(status === 'ready' || status === 'error') && selectedFile && (
              <div className="flex flex-col gap-md">
                <FileCard
                  name={selectedFile.name}
                  size={selectedFile.size}
                  icon={<PiFile size={20} />}
                  onRemove={handleRemoveFile}
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
                <p className="m-0 text-sm font-medium text-foreground">Datei wird hochgeladen...</p>
                <p className="m-0 text-xs text-grey-400">
                  Die Datei wird in deiner Wolke gespeichert.
                </p>
              </div>
            )}
          </>
        )}

        <TransferList />
      </div>
    </PageContainer>
  );
};

export default TransferPage;
