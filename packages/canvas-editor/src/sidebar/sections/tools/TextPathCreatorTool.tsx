import Konva from 'konva';
import { useCallback, useEffect, useState } from 'react';
import { PiPath } from 'react-icons/pi';

import { BRAND_COLORS } from '../../../utils/shapes';
import { useUserUploads } from '../../UserUploadsProvider';

import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';

export interface TextPathCreatorToolProps {
  onJumpToUploads?: () => void;
}

const FONT_FAMILY = '"GrueneTypeNeue", "ArvoGruen", sans-serif';
const DEFAULT_COLOR = BRAND_COLORS[0]?.value ?? '#005538';

interface PathVariant {
  id: string;
  label: string;
  data: string;
}

// Path presets in a ~360-wide coordinate space. The exact coords don't affect
// framing — the export measures getClientRect() and crops to the drawn glyphs.
const VARIANTS: PathVariant[] = [
  { id: 'wave', label: 'Welle', data: 'M0,60 Q90,0 180,60 T360,60' },
  { id: 'smile', label: 'Bogen', data: 'M0,20 Q180,140 360,20' },
  { id: 'rainbow', label: 'Regenbogen', data: 'M20,160 A160,160 0 0,1 340,160' },
  {
    id: 'circle',
    label: 'Kreis',
    data: 'M180,180 m-130,0 a130,130 0 1,1 260,0 a130,130 0 1,1 -260,0',
  },
  { id: 'rising', label: 'Aufsteigend', data: 'M0,150 L360,30' },
];

/**
 * Renders text along an SVG path (Konva.TextPath) into a tightly-cropped PNG.
 * See https://konvajs.org/docs/shapes/TextPath.html
 */
async function renderTextPath(
  text: string,
  data: string,
  fontSize: number,
  color: string,
  pixelRatio: number
): Promise<string | null> {
  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width: 10, height: 10 });
  const layer = new Konva.Layer();
  stage.add(layer);

  const font = `bold ${fontSize}px ${FONT_FAMILY}`;
  try {
    await document.fonts.load(font, text);
  } catch {
    // fall through to fallback font
  }

  const textPath = new Konva.TextPath({
    text,
    data,
    fontSize,
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    fill: color,
  });
  layer.add(textPath);

  const rect = textPath.getClientRect();
  if (rect.width < 1 || rect.height < 1) {
    stage.destroy();
    return null;
  }
  const pad = fontSize * 0.4;
  stage.size({
    width: Math.ceil(rect.width) + pad * 2,
    height: Math.ceil(rect.height) + pad * 2,
  });
  textPath.position({ x: pad - rect.x, y: pad - rect.y });
  layer.draw();

  const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio });
  stage.destroy();
  return dataUrl;
}

export function TextPathCreatorTool({ onJumpToUploads }: TextPathCreatorToolProps) {
  const { upload, isUploading } = useUserUploads();

  const [value, setValue] = useState('');
  const [variant, setVariant] = useState<PathVariant>(VARIANTS[0]);
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const trimmed = value.trim();
  const previewText = trimmed || 'Beispieltext';

  // Preview mirrors the exact export pipeline (lower resolution).
  useEffect(() => {
    let cancelled = false;
    void renderTextPath(previewText, variant.data, fontSize, color, 1).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [previewText, variant.data, fontSize, color]);

  const disabled = isBusy || isUploading;

  const handleAction = useCallback(async () => {
    if (!trimmed) return;
    setError(null);
    setSuccess(null);
    setIsBusy(true);

    try {
      const dataUrl = await renderTextPath(trimmed, variant.data, fontSize, color, 3);
      if (!dataUrl) throw new Error('Vorschau konnte nicht erzeugt werden.');
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `pfadtext_${Date.now()}.png`, { type: 'image/png' });
      const item = await upload(file);
      if (!item) throw new Error('Upload fehlgeschlagen');

      const objectUrl = URL.createObjectURL(file);
      setSuccess({
        thumbnailUrl: objectUrl,
        itemName: item.originalFilename ?? item.title ?? file.name,
        onJumpToUploads,
      });
      setValue('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Erstellen des Pfadtextes';
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }, [trimmed, variant.data, fontSize, color, upload, onJumpToUploads]);

  return (
    <ToolPanel
      body={
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="text-foreground-muted">Text</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Dein Text…"
              disabled={disabled}
              className="rounded-md border border-grey-300 bg-background px-sm py-xs text-sm text-foreground outline-none focus:border-primary-500 disabled:opacity-50 dark:border-grey-600"
            />
          </label>

          <div className="flex items-center justify-center rounded-lg bg-grey-50 dark:bg-grey-900 p-3 min-h-[120px] overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt="Vorschau" className="max-h-[140px] max-w-full" />
            ) : (
              <span className="text-xs text-foreground-muted">Vorschau…</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-foreground-muted">Form</span>
            <div className="grid grid-cols-3 gap-1.5">
              {VARIANTS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setVariant(v)}
                  className={`rounded-md border px-2 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                    variant.id === v.id
                      ? 'border-primary-500 bg-primary-500/10 text-foreground'
                      : 'border-grey-300 text-foreground-muted hover:border-primary-500 dark:border-grey-600'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-foreground-muted">Farbe</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                  className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110 disabled:opacity-50"
                  style={{
                    backgroundColor: c.value,
                    outline: color === c.value ? '2px solid var(--editor-accent, #005538)' : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-xs">
            <span className="text-foreground-muted">Schriftgröße: {fontSize}px</span>
            <input
              type="range"
              min={24}
              max={80}
              step={2}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              disabled={disabled}
              className="w-full accent-primary-600 disabled:opacity-50"
            />
          </label>
        </div>
      }
      actionLabel="Pfadtext zu Uploads hinzufügen"
      actionIcon={PiPath}
      canSubmit={!!trimmed}
      isBusy={disabled}
      progressMessage={isBusy ? 'Pfadtext wird gespeichert…' : null}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
