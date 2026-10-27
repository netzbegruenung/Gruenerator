import { QRCodeCanvas } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { HiQrCode } from 'react-icons/hi2';

import { MOBILE_INPUT_TEXT } from '../../sidebarStyles';

import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';
import { useToolImagePlacement } from './useToolImagePlacement';
import { useMessages } from '@ggraphic/editor/i18n/messages';

export interface QRCodeToolProps {
  onJumpToUploads?: () => void;
  onPlaceImageUrl?: (url: string, fileName: string) => void;
}

const PREVIEW_PLACEHOLDER = 'https://gruenerator.eu';
const QR_PIXEL_SIZE = 1024;
const PREVIEW_DEBOUNCE_MS = 400;

export function QRCodeTool({ onJumpToUploads, onPlaceImageUrl }: QRCodeToolProps) {
  const t = useMessages();
  const { finish, isUploading } = useToolImagePlacement({ onPlaceImageUrl, onJumpToUploads });
  const previewRef = useRef<HTMLDivElement>(null);

  const [value, setValue] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const trimmed = value.trim();
  const [previewText, setPreviewText] = useState('');
  const isPreviewStale = previewText !== trimmed;
  const previewValue = previewText || PREVIEW_PLACEHOLDER;

  useEffect(() => {
    const timer = setTimeout(() => setPreviewText(trimmed), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const handleAction = useCallback(async () => {
    if (!trimmed) return;
    // The PNG is read from the preview canvas, so it must show the current input.
    if (previewText !== trimmed) flushSync(() => setPreviewText(trimmed));
    const canvas = previewRef.current?.querySelector('canvas');
    if (!canvas) {
      setError(t.sidebar.tools.qrPreviewFailed);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsBusy(true);

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(t.sidebar.tools.pngFailed);

      const file = new File([blob], `qrcode_${Date.now()}.png`, { type: 'image/png' });
      setSuccess(await finish(file));
      setValue('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t.sidebar.tools.qrError;
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }, [trimmed, previewText, finish]);

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
              className={`rounded-md border border-editor-border-strong bg-background px-sm py-xs text-sm ${MOBILE_INPUT_TEXT} text-foreground outline-none focus:border-primary-500 disabled:opacity-50`}
            />
          </label>
          <div
            ref={previewRef}
            className={`self-center flex items-center justify-center rounded-lg bg-white p-3 transition-opacity duration-200 ${isPreviewStale ? 'opacity-50' : 'opacity-100'}`}
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
      actionLabel={onPlaceImageUrl ? t.sidebar.tools.qrPlace : t.sidebar.tools.qrAdd}
      actionIcon={HiQrCode}
      canSubmit={!!trimmed}
      isBusy={isBusy || isUploading}
      progressMessage={isBusy ? t.sidebar.tools.qrSaving : null}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
