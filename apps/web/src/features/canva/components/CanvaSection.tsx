import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FiCheck, FiLoader } from 'react-icons/fi';

import { useCanvaStatus, useDisconnectCanva, useInvalidateCanvaStatus } from '../hooks/useCanva';
import { CANVA_AUTH_START_URL } from '../lib/canvaApi';

import CanvaDesignsGrid from './CanvaDesignsGrid';
import { CanvaLogo, PoweredByCanva } from './CanvaLogo';

import { cn } from '@/utils/cn';

interface CanvaSectionProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const CanvaSection = memo(({ onSuccess, onError }: CanvaSectionProps) => {
  const { data: status, isLoading } = useCanvaStatus();
  const disconnect = useDisconnectCanva();
  const invalidateStatus = useInvalidateCanvaStatus();
  const [isConnecting, setIsConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Refetch status when the OAuth popup posts back (success/failure) or is closed.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; ok?: boolean } | null;
      if (data?.type !== 'canva-oauth') return;
      void invalidateStatus();
      setIsConnecting(false);
      if (data.ok) {
        onSuccess?.('Canva verbunden');
      } else {
        onError?.('Canva-Verbindung fehlgeschlagen');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [invalidateStatus, onSuccess, onError]);

  const handleConnect = useCallback(() => {
    setIsConnecting(true);
    const popup = window.open(CANVA_AUTH_START_URL, '_blank', 'width=600,height=700');
    popupRef.current = popup;

    if (!popup) {
      setIsConnecting(false);
      onError?.('Popup wurde blockiert. Bitte Popups für diese Seite erlauben.');
      return;
    }

    // Fallback: if the popup is closed without postMessage, refetch on close.
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        setIsConnecting(false);
        void invalidateStatus();
      }
    }, 1000);
  }, [invalidateStatus, onError]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect.mutateAsync();
      onSuccess?.('Canva-Verbindung getrennt');
    } catch {
      onError?.('Verbindung konnte nicht getrennt werden');
    }
  }, [disconnect, onSuccess, onError]);

  const connected = status?.connected ?? false;
  const isBusy = isConnecting || disconnect.isPending;

  return (
    <div className="mt-xl">
      <div className="flex items-center gap-sm mb-md">
        <CanvaLogo size={24} />
        <h2 className="text-xl font-semibold text-foreground-heading m-0">Canva</h2>
        <span className="text-xs bg-secondary-100 text-secondary-700 px-sm py-0.5 rounded-full font-medium">
          Experimentell
        </span>
      </div>

      {isLoading && <p className="text-sm text-grey-400 text-center py-sm">Lade Verbindung...</p>}

      {!isLoading && (
        <>
        <div
          className={cn(
            'flex items-center justify-between p-md rounded-lg border bg-background-pure transition-colors',
            connected
              ? 'border-primary-300 dark:border-primary-700'
              : 'border-grey-200 dark:border-grey-700'
          )}
        >
          <div className="flex items-center gap-md">
            <CanvaLogo size={20} />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground-heading">Canva</span>
              <span className="text-xs text-grey-400">
                {connected && status?.displayName
                  ? status.displayName
                  : 'Designs, Brand-Vorlagen, Assets'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            {connected && (
              <span className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400">
                <FiCheck size={12} />
                Verbunden
              </span>
            )}

            {connected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isBusy}
                className={cn(
                  'text-xs px-sm py-1 rounded-md cursor-pointer transition-colors',
                  'bg-transparent border border-grey-300 dark:border-grey-600',
                  'text-grey-500 hover:text-[var(--error-red)] hover:border-[var(--error-red)]',
                  isBusy && 'opacity-50 cursor-not-allowed'
                )}
              >
                {disconnect.isPending ? <FiLoader className="animate-spin" size={12} /> : 'Trennen'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isBusy}
                className={cn(
                  'text-xs px-md py-1 rounded-md cursor-pointer transition-colors font-medium',
                  'bg-primary-500 text-white hover:bg-primary-600 border-none',
                  isBusy && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isConnecting ? <FiLoader className="animate-spin" size={12} /> : 'Verbinden'}
              </button>
            )}
          </div>
        </div>
        {connected && <CanvaDesignsGrid connected={connected} />}
        <PoweredByCanva className="mt-sm" />
        </>
      )}
    </div>
  );
});
CanvaSection.displayName = 'CanvaSection';

export default CanvaSection;
