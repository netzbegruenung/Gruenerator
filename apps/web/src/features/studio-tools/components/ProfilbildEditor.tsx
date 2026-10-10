import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';
import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';

import { downloadDataUrl } from '../../../utils/downloadFile';
import { type ProfilbildLayout } from '../profilbildCanvas';
import {
  composeProfilbild,
  defaultPlacement,
  loadImage,
  placementRect,
  PROFILBILD_SIZE,
  renderProfilbildBackground,
  rescalePlacement,
  trimCutout,
  type PersonPlacement,
  type ProfilbildBackground,
  type TrimmedCutout,
} from '../utils/composeProfilbild';
import { clampPerson } from '../utils/profilbildSnap';

const ProfilbildStage = lazy(() => import('./ProfilbildStage'));

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

type Variant = 'rund' | 'quadrat' | 'instagram';

const VARIANTS: { value: Variant; label: string }[] = [
  { value: 'rund', label: 'Rund' },
  { value: 'quadrat', label: 'Quadrat' },
  { value: 'instagram', label: 'Instagram' },
];

const VARIANT_HINTS: Record<Variant, string> = {
  rund: 'Vorschau rund wie in sozialen Netzwerken – der Download bleibt quadratisch.',
  quadrat: 'Der Download bleibt quadratisch – Netzwerke schneiden selbst rund zu.',
  instagram: 'So erscheint das Bild auf Instagram – der Download bleibt quadratisch.',
};

const NUDGE = 10;
const NUDGE_FAST = 50;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const SWATCH_CLASS =
  'size-10 shrink-0 rounded-full border border-grey-300 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary-600 aria-pressed:ring-offset-2 dark:border-grey-600';

export interface ProfilbildEditorProps {
  cutoutUrl: string;
  onEditInCanvas: (
    backgroundColor: string | null,
    layout: ProfilbildLayout,
    cutoutDataUrl: string
  ) => Promise<void>;
  onReset: () => void;
}

export function ProfilbildEditor({ cutoutUrl, onEditInCanvas, onReset }: ProfilbildEditorProps) {
  const sizeId = useId();
  const moveHintId = useId();
  const igProfileRef = useRef<HTMLCanvasElement>(null);
  const igFeedRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const customUrlRef = useRef<string | null>(null);
  const [cutout, setCutout] = useState<TrimmedCutout | null>(null);
  const [customImage, setCustomImage] = useState<HTMLImageElement | null>(null);
  const [selected, setSelected] = useState('tanne');
  const [placement, setPlacement] = useState<PersonPlacement | null>(null);
  const [variant, setVariant] = useState<Variant>('rund');
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadImage(cutoutUrl)
      .then((img) => {
        if (!alive) return;
        const trimmed = trimCutout(img);
        setCutout(trimmed);
        setPlacement(defaultPlacement(trimmed.image));
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
  const background = useMemo<ProfilbildBackground | null>(
    () => (preset ? preset.background : customImage ? { kind: 'image', image: customImage } : null),
    [preset, customImage]
  );
  const backgroundCanvas = useMemo(
    () => (background ? renderProfilbildBackground(background) : null),
    [background]
  );

  const colorBackground = preset?.background.kind === 'color' ? preset.background.color : null;
  const rect = cutout && placement ? placementRect(cutout.image, placement) : null;

  const compose = (canvas?: HTMLCanvasElement) =>
    cutout && background && placement
      ? composeProfilbild({
          cutout: cutout.image,
          background,
          scale: placement.scale,
          position: { x: placement.x, y: placement.y },
          canvas,
        })
      : null;

  const composedRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (variant !== 'instagram') return;
    const frame = requestAnimationFrame(() => {
      composedRef.current ??= document.createElement('canvas');
      const composed = compose(composedRef.current);
      if (!composed) return;
      for (const target of [igProfileRef.current, igFeedRef.current]) {
        const ctx = target?.getContext('2d');
        if (target && ctx) ctx.drawImage(composed, 0, 0, target.width, target.height);
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  const moveTo = (pos: { x: number; y: number }) => setPlacement((p) => (p ? { ...p, ...pos } : p));

  const onMoveKey = (e: React.KeyboardEvent) => {
    const dir = ARROWS[e.key];
    if (!dir || !rect) return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_FAST : NUDGE;
    moveTo(
      clampPerson(
        { ...rect, x: rect.x + dir[0] * step, y: rect.y + dir[1] * step },
        PROFILBILD_SIZE
      )
    );
  };

  const center = () => {
    if (cutout)
      setPlacement((p) => (p ? defaultPlacement(cutout.image, PROFILBILD_SIZE, p.scale) : p));
  };

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
    setError(null);
    try {
      const composed = compose();
      if (!composed) return;
      await downloadDataUrl(composed.toDataURL('image/png'), 'profilbild.png');
    } catch (cause) {
      setError(errorMessage(cause, 'Der Download ist fehlgeschlagen.'));
    }
  };

  const editInCanvas = async () => {
    if (canvasBusy || !cutout || !rect) return;
    setError(null);
    setCanvasBusy(true);
    try {
      await onEditInCanvas(
        colorBackground,
        {
          imagePosition: { x: Math.round(rect.x), y: Math.round(rect.y) },
          imageSize: { w: rect.width, h: rect.height },
        },
        cutout.dataUrl ?? cutoutUrl
      );
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

  const scalePct = placement ? Math.round(placement.scale * 100) : 0;

  return (
    <div className="grid gap-lg md:grid-cols-[300px_1fr] md:items-start">
      <div className="mx-auto flex w-full max-w-[300px] flex-col gap-xs md:mx-0">
        <div role="group" aria-label="Vorschau" className="flex gap-sm">
          {VARIANTS.map((o) => (
            <Button
              key={o.value}
              type="button"
              size="sm"
              variant={variant === o.value ? 'brand' : 'outline'}
              aria-pressed={variant === o.value}
              onClick={() => setVariant(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>

        {variant === 'instagram' ? (
          cutout ? (
            <InstagramPreview profileRef={igProfileRef} feedRef={igFeedRef} />
          ) : null
        ) : (
          <>
            {/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- Tastatur-Ersatz für das Ziehen auf der Konva-Bühne; role="application" reicht Pfeiltasten am Screenreader vorbei durch */}
            <div
              role="application"
              tabIndex={0}
              aria-label="Person verschieben – Pfeiltasten"
              aria-describedby={moveHintId}
              onKeyDown={onMoveKey}
              className="aspect-square w-full overflow-hidden rounded-[14px] border border-grey-200 bg-grey-100 outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 dark:border-grey-700 dark:bg-grey-800"
            >
              {cutout && rect && backgroundCanvas ? (
                <Suspense fallback={null}>
                  <ProfilbildStage
                    background={backgroundCanvas}
                    person={cutout.image}
                    rect={rect}
                    round={variant === 'rund'}
                    onMove={moveTo}
                  />
                </Suspense>
              ) : null}
            </div>
            {/* eslint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
            <div className="flex items-start justify-between gap-sm">
              <p id={moveHintId} className="m-0 text-sm text-grey-600 dark:text-grey-400">
                Person ziehen – sie rastet an Mitte, Raster und Unterkante ein.
              </p>
              <Button type="button" size="sm" variant="ghost" disabled={!cutout} onClick={center}>
                Zentrieren
              </Button>
            </div>
          </>
        )}
        <p className="m-0 text-sm text-grey-600 dark:text-grey-400">{VARIANT_HINTS[variant]}</p>
      </div>

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
            disabled={!placement}
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              if (cutout) setPlacement((p) => (p ? rescalePlacement(cutout.image, p, next) : p));
            }}
            className="accent-primary-600"
          />
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

function InstagramPreview({
  profileRef,
  feedRef,
}: {
  profileRef: React.RefObject<HTMLCanvasElement | null>;
  feedRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const stats = [
    ['12', 'Beiträge'],
    ['340', 'Follower'],
    ['180', 'Gefolgt'],
  ];
  return (
    <div
      role="img"
      aria-label="Vorschau als Instagram-Profilbild"
      className="flex w-full flex-col gap-sm rounded-[14px] border border-grey-200 bg-white p-md dark:border-grey-700 dark:bg-grey-800"
    >
      <p className="m-0 text-sm font-semibold">So sieht es auf Instagram aus</p>
      <div className="flex items-center gap-md">
        <canvas
          ref={profileRef}
          width={154}
          height={154}
          aria-hidden="true"
          className="size-[77px] shrink-0 rounded-full"
        />
        <div className="flex flex-1 justify-between text-center">
          {stats.map(([value, label]) => (
            <div key={label} className="flex flex-col">
              <span className="text-sm font-semibold">{value}</span>
              <span className="text-xs text-grey-600 dark:text-grey-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold">Dein Name</span>
        <span className="text-sm text-grey-600 dark:text-grey-400">Deine Bio steht hier.</span>
      </div>
      <div className="flex items-center gap-sm border-t border-grey-200 pt-sm dark:border-grey-700">
        <canvas
          ref={feedRef}
          width={64}
          height={64}
          aria-hidden="true"
          className="size-8 shrink-0 rounded-full"
        />
        <span className="text-xs font-semibold">dein.name</span>
      </div>
    </div>
  );
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
