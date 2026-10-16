import {
  STICKER_OUTLINE,
  STICKER_SHADOW,
  stickerSwatches,
  swatchColor,
  type StickerEffects,
} from '@gruenerator/shared/stickers';
import { Alert, AlertDescription, Button, UploadZone } from '@gruenerator/ui';
import { useEffect, useId, useState, type JSX } from 'react';
import { PiImageSquare, PiScissors } from 'react-icons/pi';

import {
  TOOL_HINT,
  TOOL_LABEL,
  ToolProcessing,
  ToolSpinner,
} from '../../studio-tools/components/ToolUi';
import {
  BACKGROUND_REMOVAL_ERROR,
  useBackgroundRemoval,
} from '../../studio-tools/hooks/useBackgroundRemoval';

import {
  DesignLayout,
  PreviewFrame,
  SwatchPicker,
  SwitchRow,
  useObjectUrl,
  type StickerDraft,
} from './creatorParts';
import {
  canvasHasTransparency,
  canvasToPngBlob,
  imageToCanvas,
  loadImage,
  renderSticker,
  StickerImageError,
  trimTransparent,
} from './stickerEffects';

import { cn } from '@/utils/cn';

export type ImageStickerMode = 'upload' | 'cutout';

const ACCEPT = {
  upload: { 'image/png': [], 'image/webp': [] },
  cutout: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
} as const;

const RENDER_DELAY_MS = 120;
const PROCESS_ERROR = 'Das Bild konnte nicht verarbeitet werden.';

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '');

/** Loads a picture into a canvas cropped to its visible motif. */
async function motifFrom(src: string) {
  const canvas = imageToCanvas(await loadImage(src));
  return { motif: trimTransparent(canvas), transparent: canvasHasTransparency(canvas) };
}

export function ImageStickerDesigner({
  mode,
  locale,
  onDraft,
}: {
  mode: ImageStickerMode;
  locale: 'de-DE' | 'de-AT';
  onDraft: (draft: StickerDraft | null) => void;
}): JSX.Element {
  const widthId = useId();
  const outlineSwatches = stickerSwatches(locale);
  const removal = useBackgroundRemoval({ downscale: true });
  const [title, setTitle] = useState('');
  const [motif, setMotif] = useState<HTMLCanvasElement | null>(null);
  const [opaque, setOpaque] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outlineOn, setOutlineOn] = useState(mode === 'cutout');
  const [outlineWidth, setOutlineWidth] = useState<number>(STICKER_OUTLINE.initial);
  const [outlineColor, setOutlineColor] = useState(() => swatchColor(outlineSwatches, 'weiss'));
  const [shadowOn, setShadowOn] = useState(false);
  const [preview, setPreview] = useState<Blob | null>(null);
  const previewUrl = useObjectUrl(preview);

  const pickFile = async (file: File) => {
    setError(null);
    setTitle(titleFromFile(file.name));
    if (mode === 'cutout') {
      removal.start(file);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const loaded = await motifFrom(url);
      setOpaque(!loaded.transparent);
      setMotif(loaded.motif);
    } catch (err) {
      setError(err instanceof StickerImageError ? err.message : PROCESS_ERROR);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const cutout = removal.cutoutDataUrl;
  useEffect(() => {
    if (!cutout) return;
    let cancelled = false;
    motifFrom(cutout)
      .then((loaded) => !cancelled && setMotif(loaded.motif))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof StickerImageError ? err.message : PROCESS_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [cutout]);

  useEffect(() => {
    if (!motif) return;
    const effects: StickerEffects = {
      outline: outlineOn ? { width: outlineWidth, color: outlineColor } : null,
      shadow: shadowOn ? STICKER_SHADOW : null,
    };
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const canvas = renderSticker(motif, effects);
          const blob = await canvasToPngBlob(canvas);
          if (cancelled) return;
          setError(null);
          setPreview(blob);
          onDraft({ blob, suggestedTitle: title });
        } catch (err) {
          if (!cancelled) setError(err instanceof StickerImageError ? err.message : PROCESS_ERROR);
        }
      })();
    }, RENDER_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [motif, outlineOn, outlineWidth, outlineColor, shadowOn, title, onDraft]);

  const startOver = () => {
    removal.reset();
    setMotif(null);
    setPreview(null);
    setOpaque(false);
    setError(null);
    onDraft(null);
  };

  if (!motif) {
    if (removal.status === 'processing')
      return <ToolProcessing imageUrl={removal.originalUrl} label="Hintergrund wird entfernt …" />;
    if (removal.status === 'error')
      return (
        <div className="flex flex-col gap-md">
          <Alert variant="destructive" role="alert">
            <AlertDescription>{BACKGROUND_REMOVAL_ERROR}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-sm">
            <Button type="button" variant="brand" onClick={removal.retry}>
              Erneut versuchen
            </Button>
            <Button type="button" variant="ghost" onClick={startOver}>
              Anderes Bild
            </Button>
          </div>
        </div>
      );
    return (
      <div className="flex flex-col gap-md">
        <UploadZone
          accept={ACCEPT[mode]}
          maxSizeMB={10}
          icon={
            mode === 'cutout' ? (
              <PiScissors aria-hidden="true" className="size-7" />
            ) : (
              <PiImageSquare aria-hidden="true" className="size-7" />
            )
          }
          title={
            mode === 'cutout'
              ? 'Foto hierher ziehen oder auswählen'
              : 'PNG hierher ziehen oder auswählen'
          }
          subtitle={
            mode === 'cutout'
              ? 'JPG, PNG oder WebP bis 10 MB – wir stellen dein Motiv frei'
              : 'PNG oder WebP mit transparentem Hintergrund, bis 10 MB'
          }
          className="min-h-[300px] max-md:min-h-[220px]"
          onFileSelected={(file) => void pickFile(file)}
          onError={setError}
        />
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <DesignLayout
      preview={
        <PreviewFrame>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vorschau deines Stickers"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ToolSpinner label="Sticker wird vorbereitet …" />
          )}
        </PreviewFrame>
      }
    >
      {opaque && (
        <p className={cn(TOOL_HINT, 'rounded-lg bg-background-alt p-sm')}>
          Dein Bild hat keinen transparenten Hintergrund. Für ein freigestelltes Motiv nimm „Foto
          freistellen“.
        </p>
      )}
      <SwitchRow label="Kontur" checked={outlineOn} onChange={setOutlineOn}>
        <div className="flex flex-col gap-xs">
          <label htmlFor={widthId} className={cn(TOOL_LABEL, 'flex justify-between font-normal')}>
            Stärke
            <span className="tabular-nums text-grey-600 dark:text-grey-400">{outlineWidth}</span>
          </label>
          <input
            id={widthId}
            type="range"
            min={STICKER_OUTLINE.min}
            max={STICKER_OUTLINE.max}
            step={STICKER_OUTLINE.step}
            value={outlineWidth}
            onChange={(e) => setOutlineWidth(Number(e.target.value))}
            className="h-11 w-full cursor-pointer accent-primary-600 md:h-6"
          />
        </div>
        <SwatchPicker
          label="Farbe der Kontur"
          swatches={outlineSwatches}
          value={outlineColor}
          onChange={setOutlineColor}
        />
      </SwitchRow>
      <SwitchRow label="Schatten" checked={shadowOn} onChange={setShadowOn} />
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" variant="ghost" className="self-start" onClick={startOver}>
        Anderes Bild
      </Button>
    </DesignLayout>
  );
}
