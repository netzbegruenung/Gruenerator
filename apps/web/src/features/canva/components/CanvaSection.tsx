import { Button } from '@gruenerator/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FiAlertCircle, FiCheck, FiLoader } from 'react-icons/fi';

import { useCanvaStatus, useDisconnectCanva, useInvalidateCanvaStatus } from '../hooks/useCanva';
import { CANVA_AUTH_START_URL } from '../lib/canvaApi';

import CanvaDesignsGrid from './CanvaDesignsGrid';
import { CANVA_BUTTON_BORDER, CanvaLogo, PoweredByCanva } from './CanvaLogo';

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
  const needsReconnect = connected && (status?.needsReconnect ?? false);
  const isBusy = isConnecting || disconnect.isPending;

  // Colours: neutral text tokens on the neutral card only — no green text on a
  // green surface, and the Canva mark keeps its own colours (brand guidelines).
  const connectButton = (label: string) => (
    <Button
      variant="outline"
      size="sm"
      className={CANVA_BUTTON_BORDER}
      onClick={handleConnect}
      disabled={isBusy}
    >
      {isConnecting ? (
        <FiLoader className="animate-spin" aria-hidden />
      ) : (
        <CanvaLogo size={16} variant="icon" decorative />
      )}
      {label}
    </Button>
  );

  return (
    <section aria-labelledby="canva-heading" className="mt-xl">
      <div className="flex items-center gap-sm mb-md">
        <CanvaLogo size={24} variant="icon" />
        <h2 id="canva-heading" className="text-xl font-semibold text-foreground-heading m-0">
          Canva
        </h2>
        <span className="text-xs border border-grey-300 dark:border-grey-600 text-foreground px-sm py-0.5 rounded-full font-medium">
          Nur Admins
        </span>
      </div>

      {isLoading && (
        <p className="text-sm text-foreground-muted text-center py-sm">Lade Verbindung …</p>
      )}

      {!isLoading && (
        <>
          <div className="flex flex-col gap-md p-md rounded-lg border border-grey-200 dark:border-grey-700 bg-background-pure sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-md min-w-0">
              <CanvaLogo size={20} variant="icon" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-foreground-heading">
                  {connected && status?.displayName ? status.displayName : 'Canva'}
                </span>
                <span className="text-xs text-foreground-muted">
                  Sticker und Hintergründe aus dem Marktplatz in deine Canva-Uploads
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-sm">
              {connected && !needsReconnect && (
                <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                  <FiCheck size={12} aria-hidden />
                  Verbunden
                </span>
              )}
              {needsReconnect && (
                <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                  <FiAlertCircle size={12} aria-hidden />
                  Neue Berechtigung nötig
                </span>
              )}
              {needsReconnect && connectButton('Neu verbinden')}
              {connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className={CANVA_BUTTON_BORDER}
                  onClick={handleDisconnect}
                  disabled={isBusy}
                  aria-label="Canva-Verbindung trennen"
                >
                  {disconnect.isPending ? (
                    <FiLoader className="animate-spin" aria-hidden />
                  ) : (
                    'Trennen'
                  )}
                </Button>
              ) : (
                connectButton('Mit Canva verbinden')
              )}
            </div>
          </div>
          {connected && <CanvaDesignsGrid connected={connected} />}
          <PoweredByCanva className="mt-sm" />
        </>
      )}
    </section>
  );
});
CanvaSection.displayName = 'CanvaSection';

export default CanvaSection;
