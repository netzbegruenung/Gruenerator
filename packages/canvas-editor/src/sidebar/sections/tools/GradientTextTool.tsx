import { useCallback, useState } from 'react';
import { PiTextT } from 'react-icons/pi';

import { BRAND_COLORS } from '../../../utils/shapes';
import { useUserUploads } from '../../UserUploadsProvider';

import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';

export interface GradientTextToolProps {
  onJumpToUploads?: () => void;
}

// High-res render so the placed image stays crisp when scaled on the canvas.
const RENDER_FONT_PX = 240;
const RENDER_PADDING = 24;
const FONT_FAMILY = '"GrueneTypeNeue", "ArvoGruen", sans-serif';

const DEFAULT_COLOR_1 = BRAND_COLORS[0]?.value ?? '#005538';
const DEFAULT_COLOR_2 = BRAND_COLORS[1]?.value ?? '#8ABD24';

function ColorRow({
  label,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  selected: string;
  onSelect: (color: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-foreground-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {BRAND_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(c.value)}
            title={c.name}
            className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110 disabled:opacity-50"
            style={{
              backgroundColor: c.value,
              outline: selected === c.value ? '2px solid var(--editor-accent, #005538)' : 'none',
              outlineOffset: '2px',
            }}
          />
        ))}
      </div>
    </div>
  );
}

async function renderGradientTextPng(
  text: string,
  color1: string,
  color2: string,
  angle: number
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const font = `700 ${RENDER_FONT_PX}px ${FONT_FAMILY}`;
  // Best-effort: make sure the brand font is ready before measuring/drawing.
  try {
    await document.fonts.load(font, text);
  } catch {
    // fall through to fallback font
  }

  ctx.font = font;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || RENDER_FONT_PX * 0.8;
  const descent = metrics.actualBoundingBoxDescent || RENDER_FONT_PX * 0.2;
  const width = Math.ceil(metrics.width) + RENDER_PADDING * 2;
  const height = Math.ceil(ascent + descent) + RENDER_PADDING * 2;

  canvas.width = width;
  canvas.height = height;
  // Resizing the canvas resets the 2D context — re-apply the font.
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';

  const rad = (angle * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const ex = (width / 2) * Math.cos(rad);
  const ey = (height / 2) * Math.sin(rad);
  const gradient = ctx.createLinearGradient(cx - ex, cy - ey, cx + ex, cy + ey);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  ctx.fillStyle = gradient;
  ctx.fillText(text, RENDER_PADDING, RENDER_PADDING + ascent);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function GradientTextTool({ onJumpToUploads }: GradientTextToolProps) {
  const { upload, isUploading } = useUserUploads();

  const [value, setValue] = useState('');
  const [color1, setColor1] = useState(DEFAULT_COLOR_1);
  const [color2, setColor2] = useState(DEFAULT_COLOR_2);
  const [angle, setAngle] = useState(90);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const trimmed = value.trim();

  const handleAction = useCallback(async () => {
    if (!trimmed) return;
    setError(null);
    setSuccess(null);
    setIsBusy(true);

    try {
      const blob = await renderGradientTextPng(trimmed, color1, color2, angle);
      if (!blob) throw new Error('PNG-Konvertierung fehlgeschlagen');

      const file = new File([blob], `verlaufstext_${Date.now()}.png`, { type: 'image/png' });
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
      const message =
        err instanceof Error ? err.message : 'Fehler beim Erstellen des Verlaufstextes';
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }, [trimmed, color1, color2, angle, upload, onJumpToUploads]);

  const disabled = isBusy || isUploading;
  const previewText = trimmed || 'Verlaufstext';

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

          <div className="flex items-center justify-center rounded-lg bg-grey-50 dark:bg-grey-900 p-4 overflow-hidden">
            <span
              className="text-3xl font-bold leading-tight text-center break-words"
              style={{
                fontFamily: FONT_FAMILY,
                backgroundImage: `linear-gradient(${angle}deg, ${color1}, ${color2})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {previewText}
            </span>
          </div>

          <ColorRow label="Farbe 1" selected={color1} onSelect={setColor1} disabled={disabled} />
          <ColorRow label="Farbe 2" selected={color2} onSelect={setColor2} disabled={disabled} />

          <label className="flex flex-col gap-1.5 text-xs">
            <span className="text-foreground-muted">Winkel: {angle}°</span>
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              disabled={disabled}
              className="w-full accent-primary-600 disabled:opacity-50"
            />
          </label>
        </div>
      }
      actionLabel="Verlaufstext zu Uploads hinzufügen"
      actionIcon={PiTextT}
      canSubmit={!!trimmed}
      isBusy={disabled}
      progressMessage={isBusy ? 'Verlaufstext wird gespeichert…' : null}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
