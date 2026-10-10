import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { useEffect, useId, useRef, useState } from 'react';

import { downloadDataUrl } from '../../../utils/downloadFile';
import { type ProfilbildLayout } from '../profilbildCanvas';
import {
  composeProfilbild,
  DEFAULT_PERSON_SCALE,
  loadImage,
  personRect,
  PROFILBILD_SIZE,
  type ProfilbildBackground,
} from '../utils/composeProfilbild';

type PresetBackground = Exclude<ProfilbildBackground, { kind: 'image' }>;

interface Swatch {
  id: string;
  label: string;
  background: PresetBackground;
}

const COLOR_SWATCHES: Swatch[] = [
  { id: 'tanne', label: 'Tanne', background: { kind: 'color', color: CANVAS_COLORS.TANNE } },
  { id: 'klee', label: 'Klee', background: { kind: 'color', color: CANVAS_COLORS.KLEE } },
  { id: 'sonne', label: 'Sonne', background: { kind: 'color', color: CANVAS_COLORS.SONNE } },
  { id: 'himmel', label: 'Himmel', background: { kind: 'color', color: CANVAS_COLORS.HIMMEL } },
  { id: 'sand', label: 'Sand', background: { kind: 'color', color: CANVAS_COLORS.SAND } },
  { id: 'weiss', label: 'Weiß', background: { kind: 'color', color: CANVAS_COLORS.WHITE } },
  { id: 'schwarz', label: 'Schwarz', background: { kind: 'color', color: CANVAS_COLORS.BLACK } },
];

const GRADIENT_SWATCHES: Swatch[] = [
  {
    id: 'tanne-klee',
    label: 'Verlauf Tanne zu Klee',
    background: { kind: 'gradient', stops: [CANVAS_COLORS.TANNE, CANVAS_COLORS.KLEE], angle: 180 },
  },
  {
    id: 'klee-grashalm',
    label: 'Verlauf Klee zu Grashalm',
    background: {
      kind: 'gradient',
      stops: [CANVAS_COLORS.KLEE, BRAND_COLORS.GRASHALM],
      angle: 135,
    },
  },
  {
    id: 'himmel-tanne',
    label: 'Verlauf Himmel zu Tanne',
    background: {
      kind: 'gradient',
      stops: [CANVAS_COLORS.HIMMEL, CANVAS_COLORS.TANNE],
      angle: 180,
    },
  },
  {
    id: 'sonne-sand',
    label: 'Verlauf Sonne zu Sand',
    background: { kind: 'gradient', stops: [CANVAS_COLORS.SONNE, CANVAS_COLORS.SAND], angle: 180 },
  },
];

const CUSTOM_ID = 'eigenes-bild';

function swatchCss(bg: PresetBackground) {
  return bg.kind === 'color' ? bg.color : `linear-gradient(${bg.angle}deg, ${bg.stops.join(', ')})`;
}

const SWATCH_CLASS =
  'size-10 shrink-0 rounded-full border border-grey-300 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary-600 aria-pressed:ring-offset-2 dark:border-grey-600';

export interface ProfilbildEditorProps {
  cutoutUrl: string;
  onEditInCanvas: (backgroundColor: string | null, layout: ProfilbildLayout) => Promise<void>;
  onReset: () => void;
}

export function ProfilbildEditor({ cutoutUrl, onEditInCanvas, onReset }: ProfilbildEditorProps) {
  const sizeId = useId();
  const positionId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const customUrlRef = useRef<string | null>(null);
  const [cutout, setCutout] = useState<HTMLImageElement | null>(null);
  const [customImage, setCustomImage] = useState<HTMLImageElement | null>(null);
  const [selected, setSelected] = useState('tanne');
  const [scalePct, setScalePct] = useState(Math.round(DEFAULT_PERSON_SCALE * 100));
  const [position, setPosition] = useState(0);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadImage(cutoutUrl)
      .then((img) => {
        if (alive) setCutout(img);
      })
      .catch((cause: unknown) => {
        if (alive) setError(errorMessage(cause, 'Bild konnte nicht geladen werden.'));
      });
    return () => {
      alive = false;
    };
  }, [cutoutUrl]);

  useEffect(
    () => () => {
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
    },
    []
  );

  const preset = [...COLOR_SWATCHES, ...GRADIENT_SWATCHES].find((s) => s.id === selected);
  const background: ProfilbildBackground | null = preset
    ? preset.background
    : customImage
      ? { kind: 'image', image: customImage }
      : null;

  const offsetY = Math.round((-position / 100) * PROFILBILD_SIZE);
  const colorBackground = preset?.background.kind === 'color' ? preset.background.color : null;

  useEffect(() => {
    if (!cutout || !background || !canvasRef.current) return;
    composeProfilbild({
      cutout,
      background,
      scale: scalePct / 100,
      offsetY,
      canvas: canvasRef.current,
    });
  });

  const pickCustom = async (file: File) => {
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
      customUrlRef.current = url;
      setCustomImage(img);
      setSelected(CUSTOM_ID);
    } catch (cause) {
      URL.revokeObjectURL(url);
      setError(errorMessage(cause, 'Bild konnte nicht geladen werden.'));
    }
  };

  const onCustomClick = () => {
    if (customImage && selected !== CUSTOM_ID) setSelected(CUSTOM_ID);
    else fileRef.current?.click();
  };

  const download = async () => {
    if (!canvasRef.current) return;
    setError(null);
    try {
      await downloadDataUrl(canvasRef.current.toDataURL('image/png'), 'profilbild.png');
    } catch (cause) {
      setError(errorMessage(cause, 'Der Download ist fehlgeschlagen.'));
    }
  };

  const editInCanvas = async () => {
    if (canvasBusy || !cutout) return;
    setError(null);
    setCanvasBusy(true);
    try {
      const p = personRect(cutout, PROFILBILD_SIZE, scalePct / 100, offsetY);
      await onEditInCanvas(colorBackground, {
        imagePosition: { x: p.x, y: p.y },
        imageSize: { w: p.width, h: p.height },
      });
    } catch (cause) {
      setError(errorMessage(cause, 'Der Canvas konnte nicht geöffnet werden.'));
    } finally {
      setCanvasBusy(false);
    }
  };

  const renderSwatch = (s: Swatch) => (
    <button
      key={s.id}
      type="button"
      aria-label={s.label}
      aria-pressed={selected === s.id}
      title={s.label}
      onClick={() => setSelected(s.id)}
      className={SWATCH_CLASS}
      style={{ background: swatchCss(s.background) }}
    />
  );

  return (
    <div className="grid gap-lg md:grid-cols-[minmax(0,480px)_1fr] md:items-start">
      <canvas
        ref={canvasRef}
        width={PROFILBILD_SIZE}
        height={PROFILBILD_SIZE}
        role="img"
        aria-label="Vorschau des Profilbilds"
        className="aspect-square h-auto w-full max-w-[480px] rounded-[14px] border border-grey-200 bg-grey-100 dark:border-grey-700 dark:bg-grey-800"
      />

      <div className="flex flex-col gap-md">
        <fieldset className="flex flex-col gap-sm">
          <legend className="mb-sm font-semibold">Hintergrund</legend>
          <div className="flex flex-wrap gap-sm">{COLOR_SWATCHES.map(renderSwatch)}</div>
          <div className="flex flex-wrap items-center gap-sm">
            {GRADIENT_SWATCHES.map(renderSwatch)}
            <Button
              type="button"
              size="sm"
              variant={selected === CUSTOM_ID ? 'brand' : 'outline'}
              aria-pressed={selected === CUSTOM_ID}
              onClick={onCustomClick}
            >
              Eigenes Bild
            </Button>
            {customImage ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => fileRef.current?.click()}
              >
                Ändern
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              aria-label="Eigenes Hintergrundbild wählen"
              accept="image/*"
              className="hidden"
              data-testid="profilbild-background-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void pickCustom(file);
              }}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-xs">
          <label htmlFor={sizeId} className="flex justify-between font-semibold">
            Größe <span className="font-normal">{scalePct} %</span>
          </label>
          <input
            id={sizeId}
            type="range"
            min={70}
            max={100}
            value={scalePct}
            onChange={(e) => setScalePct(Number(e.target.value))}
            className="accent-primary-600"
          />
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor={positionId} className="font-semibold">
            Position
          </label>
          <input
            id={positionId}
            type="range"
            min={-20}
            max={20}
            value={position}
            aria-valuetext={positionText(position)}
            onChange={(e) => setPosition(Number(e.target.value))}
            className="accent-primary-600"
          />
          <div className="flex justify-between text-sm text-grey-600 dark:text-grey-400">
            <span>tiefer</span>
            <span>höher</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-sm">
          <Button type="button" variant="brand" disabled={!cutout} onClick={() => void download()}>
            Herunterladen
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={canvasBusy}
            onClick={() => void editInCanvas()}
          >
            {canvasBusy ? 'Canvas wird geöffnet …' : 'In Canvas bearbeiten'}
          </Button>
          <Button type="button" variant="ghost" onClick={onReset}>
            Anderes Foto
          </Button>
        </div>

        {!colorBackground ? (
          <p className="m-0 text-sm text-grey-600 dark:text-grey-400">
            Verläufe und eigene Hintergründe übernimmt der Canvas nicht – dort ist eine Farbe
            gesetzt.
          </p>
        ) : null}

        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function positionText(v: number) {
  if (v === 0) return 'unten bündig';
  return v > 0 ? `${v} % höher` : `${-v} % tiefer`;
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
