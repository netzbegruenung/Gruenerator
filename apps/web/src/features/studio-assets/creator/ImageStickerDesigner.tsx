import {
  STICKER_OUTLINE,
  STICKER_SHADOW,
  stickerSwatches,
  swatchColor,
  type StickerEffects,
} from '@gruenerator/shared/stickers';
import { Alert, AlertDescription, Button, UploadZone } from '@gruenerator/ui';
import { useEffect, useId, useState, type JSX, type ReactNode } from 'react';
import { PiImageSquare } from 'react-icons/pi';

import {
  IMAGE_ACCEPT,
  TOOL_HINT,
  TOOL_LABEL,
  ToolSpinner,
} from '../../studio-tools/components/ToolUi';
import {
  BACKGROUND_REMOVAL_ERROR,
  useBackgroundRemoval,
} from '../../studio-tools/hooks/useBackgroundRemoval';

import {
  StageFrame,
  SwatchPicker,
  SwitchRow,
  useObjectUrl,
  type DesignerParts,
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

const RENDER_DELAY_MS = 120;
const PROCESS_ERROR = 'Das Bild konnte nicht verarbeitet werden.';

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '');

/** Loads a picture into a canvas cropped to its visible motif. */
async function motifFrom(src: string) {
  const canvas = imageToCanvas(await loadImage(src));
  return { motif: trimTransparent(canvas), transparent: canvasHasTransparency(canvas) };
}

/**
 * One upload for both image ways: a picture that is already transparent is
 * used as it is, a photo is cut out first — and can be kept whole instead.
 */
export function ImageStickerDesigner({
  locale,
  onDraft,
  children,
}: {
  locale: 'de-DE' | 'de-AT';
  onDraft: (draft: StickerDraft | null) => void;
  children: (parts: DesignerParts) => ReactNode;
}): JSX.Element {
  const widthId = useId();
  const outlineSwatches = stickerSwatches(locale);
  const removal = useBackgroundRemoval({ downscale: true });
  const [title, setTitle] = useState('');
  const [original, setOriginal] = useState<{
    motif: HTMLCanvasElement;
    transparent: boolean;
  } | null>(null);
  const [cutoutMotif, setCutoutMotif] = useState<HTMLCanvasElement | null>(null);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outlineOn, setOutlineOn] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState<number>(STICKER_OUTLINE.initial);
  const [outlineColor, setOutlineColor] = useState(() => swatchColor(outlineSwatches, 'weiss'));
  const [shadowOn, setShadowOn] = useState(false);
  const [preview, setPreview] = useState<Blob | null>(null);
  const previewUrl = useObjectUrl(preview);

  const motif = removeBackground ? cutoutMotif : (original?.motif ?? null);

  const pickFile = async (file: File) => {
    setError(null);
    setTitle(titleFromFile(file.name));
    const url = URL.createObjectURL(file);
    try {
      const loaded = await motifFrom(url);
      setOriginal(loaded);
      setCutoutMotif(null);
      setPreview(null);
      // A die-cut outline is what makes a cut-out read as a sticker.
      setOutlineOn(!loaded.transparent);
      setRemoveBackground(!loaded.transparent);
      if (loaded.transparent) removal.reset();
      else removal.start(file);
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
      .then((loaded) => !cancelled && setCutoutMotif(loaded.motif))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof StickerImageError ? err.message : PROCESS_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [cutout]);

  useEffect(() => {
    if (!motif) {
      onDraft(null);
      return;
    }
    // Until the new render is in, the old one is not what the person sees configured.
    onDraft(null);
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
          onDraft({
            blob,
            suggestedTitle: title,
            source: removeBackground ? 'cutout' : 'upload',
          });
        } catch (err) {
          if (!cancelled) setError(err instanceof StickerImageError ? err.message : PROCESS_ERROR);
        }
      })();
    }, RENDER_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [motif, removeBackground, outlineOn, outlineWidth, outlineColor, shadowOn, title, onDraft]);

  const startOver = () => {
    removal.reset();
    setOriginal(null);
    setCutoutMotif(null);
    setRemoveBackground(false);
    setPreview(null);
    setError(null);
  };

  const overlay =
    'absolute inset-0 flex flex-col items-center justify-center gap-sm p-md text-center';
  const errorAlert = error ? (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  let stageContent: ReactNode;
  if (!original) {
    stageContent = (
      <div className="absolute inset-0 flex flex-col bg-[color-mix(in_srgb,#46962b_12%,white)] p-sm dark:bg-grey-800">
        <UploadZone
          accept={IMAGE_ACCEPT}
          maxSizeMB={10}
          icon={<PiImageSquare aria-hidden="true" className="size-8" />}
          title="Bild hochladen"
          subtitle="Ein Foto stellen wir frei – ein PNG mit transparentem Hintergrund bleibt, wie es ist."
          className="min-h-0 flex-1 border-grey-300/80 bg-transparent px-md py-md"
          onFileSelected={(file) => void pickFile(file)}
          onError={setError}
        />
      </div>
    );
  } else if (removeBackground && removal.status === 'processing') {
    stageContent = (
      <div className={overlay}>
        {removal.originalUrl ? (
          <img
            src={removal.originalUrl}
            alt=""
            className="absolute inset-0 size-full animate-pulse object-contain opacity-60"
          />
        ) : null}
        <ToolSpinner
          label="Hintergrund wird entfernt …"
          className="relative rounded-full bg-background/90 px-md py-xs text-sm"
        />
      </div>
    );
  } else if (removeBackground && removal.status === 'error') {
    stageContent = (
      <div className={cn(overlay, 'bg-background/85 backdrop-blur-sm')}>
        <p role="alert" className="m-0 text-sm text-error">
          {BACKGROUND_REMOVAL_ERROR}
        </p>
        <div className="flex flex-wrap justify-center gap-sm">
          <Button type="button" size="sm" variant="brand" onClick={removal.retry}>
            Erneut versuchen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRemoveBackground(false)}
          >
            Ohne Freistellen
          </Button>
        </div>
      </div>
    );
  } else if (previewUrl) {
    stageContent = (
      <img
        src={previewUrl}
        alt="Vorschau deines Stickers"
        className="max-h-[88%] max-w-[88%] object-contain"
      />
    );
  } else {
    stageContent = <ToolSpinner label="Sticker wird vorbereitet …" />;
  }

  const controls = !original ? (
    <>
      <p className={TOOL_HINT}>
        Lade ein Foto oder ein PNG hoch. Danach stellst du hier Kontur und Schatten ein.
      </p>
      {errorAlert}
    </>
  ) : (
    <>
      {!original.transparent ? (
        <SwitchRow
          label="Hintergrund entfernen"
          checked={removeBackground}
          onChange={setRemoveBackground}
        />
      ) : null}
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
      {errorAlert}
      <Button type="button" variant="outline" className="self-start" onClick={startOver}>
        Anderes Bild
      </Button>
    </>
  );

  return <>{children({ stage: <StageFrame>{stageContent}</StageFrame>, controls })}</>;
}
