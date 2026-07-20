import { QRCodeCanvas } from 'qrcode.react';
import { useCallback, useRef, useState } from 'react';
import { HiQrCode } from 'react-icons/hi2';

import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';
import { useToolImagePlacement } from './useToolImagePlacement';

export interface QRCodeToolProps {
  onJumpToUploads?: () => void;
  onPlaceImageUrl?: (url: string, fileName: string) => void;
}

const PREVIEW_PLACEHOLDER = 'https://gruenerator.eu';
const QR_PIXEL_SIZE = 1024;

export function QRCodeTool({ onJumpToUploads, onPlaceImageUrl }: QRCodeToolProps) {
  const { finish, isUploading } = useToolImagePlacement({ onPlaceImageUrl, onJumpToUploads });
  const previewRef = useRef<HTMLDivElement>(null);

  const [value, setValue] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const trimmed = value.trim();
  const previewValue = trimmed || PREVIEW_PLACEHOLDER;

  const handleAction = useCallback(async () => {
    if (!trimmed) return;
    const canvas = previewRef.current?.querySelector('canvas');
    if (!canvas) {
      setError('QR-Vorschau konnte nicht erzeugt werden.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsBusy(true);

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG-Konvertierung fehlgeschlagen');

      const file = new File([blob], `qrcode_${Date.now()}.png`, { type: 'image/png' });
      setSuccess(await finish(file));
      setValue('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Erstellen des QR-Codes';
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }, [trimmed, finish]);

  return (
    <ToolPanel
      body={
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="text-foreground-muted">Link oder Text</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://..."
              disabled={isBusy || isUploading}
              className="rounded-md border border-grey-300 bg-background px-sm py-xs text-sm text-foreground outline-none focus:border-primary-500 disabled:opacity-50 dark:border-grey-600"
            />
          </label>
          <div
            ref={previewRef}
            className="self-center flex items-center justify-center rounded-lg bg-white p-3"
          >
            <QRCodeCanvas
              value={previewValue}
              size={QR_PIXEL_SIZE}
              level="M"
              marginSize={2}
              style={{ width: 160, height: 160 }}
            />
          </div>
        </div>
      }
      actionLabel={onPlaceImageUrl ? 'QR-Code einfügen' : 'QR-Code zu Uploads hinzufügen'}
      actionIcon={HiQrCode}
      canSubmit={!!trimmed}
      isBusy={isBusy || isUploading}
      progressMessage={isBusy ? 'QR-Code wird gespeichert…' : null}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
