// SPDX-License-Identifier: MPL-2.0
import { CustomColorSwatch } from '@ggraphic/editor/components/CustomColorSwatch';
import { headlineFontStack } from '@ggraphic/editor/brand/brandRegistry';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { brandColors } from '@ggraphic/editor/utils/colorOptions';
import { useCallback, useState } from 'react';
import { PiTextT } from 'react-icons/pi';

import { MOBILE_INPUT_TEXT } from '@ggraphic/editor/sidebar/sidebarStyles';

import {
  ToolPanel,
  type ToolPanelSuccess,
} from '@ggraphic/editor/sidebar/sections/tools/ToolPanel';
import { useToolImagePlacement } from '@ggraphic/editor/sidebar/sections/tools/useToolImagePlacement';

export interface GradientTextToolProps {
  onJumpToUploads?: () => void;
  onPlaceImageUrl?: (url: string, fileName: string) => void;
}

// High-res render so the placed image stays crisp when scaled on the canvas.
const RENDER_FONT_PX = 240;
const RENDER_PADDING = 24;

/** The brand's nth colour, read when the tool opens. */
const paletteColor = (index: number) => () => brandColors()[index]?.value ?? '#000000';

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
        {brandColors().map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(c.value)}
            title={c.name}
            className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110 disabled:opacity-50"
            style={{
              backgroundColor: c.value,
              outline: selected === c.value ? '2px solid var(--editor-accent)' : 'none',
              outlineOffset: '2px',
            }}
          />
        ))}
        <CustomColorSwatch
          value={selected}
          presets={brandColors().map((c) => c.value)}
          onPick={onSelect}
          className="size-6"
          disabled={disabled}
        />
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

  const font = `700 ${RENDER_FONT_PX}px ${headlineFontStack()}`;
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

export function GradientTextTool({ onJumpToUploads, onPlaceImageUrl }: GradientTextToolProps) {
  const t = useMessages();
  const { finish, isUploading } = useToolImagePlacement({ onPlaceImageUrl, onJumpToUploads });

  const [value, setValue] = useState('');
  const [color1, setColor1] = useState(paletteColor(0));
  const [color2, setColor2] = useState(paletteColor(1));
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
      if (!blob) throw new Error(t.sidebar.tools.pngFailed);

      const file = new File([blob], `verlaufstext_${Date.now()}.png`, { type: 'image/png' });
      setSuccess(await finish(file));
      setValue('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t.sidebar.tools.gradientError;
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }, [t, trimmed, color1, color2, angle, finish]);

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
              placeholder={t.sidebar.tools.yourText}
              disabled={disabled}
              className={`rounded-md border border-editor-border-strong bg-background px-sm py-xs text-sm ${MOBILE_INPUT_TEXT} text-foreground outline-none focus:border-primary-500 disabled:opacity-50`}
            />
          </label>

          <div className="flex items-center justify-center rounded-lg bg-editor-inset p-4 overflow-hidden">
            <span
              className="text-3xl font-bold leading-tight text-center break-words"
              style={{
                fontFamily: headlineFontStack(),
                backgroundImage: `linear-gradient(${angle}deg, ${color1}, ${color2})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {previewText}
            </span>
          </div>

          <ColorRow
            label={t.sidebar.tools.color1}
            selected={color1}
            onSelect={setColor1}
            disabled={disabled}
          />
          <ColorRow
            label={t.sidebar.tools.color2}
            selected={color2}
            onSelect={setColor2}
            disabled={disabled}
          />

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
              className="w-full max-canvas-mobile:h-11 accent-primary-600 disabled:opacity-50"
            />
          </label>
        </div>
      }
      actionLabel={onPlaceImageUrl ? t.sidebar.tools.gradientPlace : t.sidebar.tools.gradientAdd}
      actionIcon={PiTextT}
      canSubmit={!!trimmed}
      isBusy={disabled}
      progressMessage={isBusy ? t.sidebar.tools.gradientSaving : null}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
