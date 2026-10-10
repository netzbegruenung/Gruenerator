import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import {
  clampPerson,
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  defaultPlacement,
  GRADIENT_SWATCHES,
  MIN_STICKER,
  placementRect,
  presetDesigns,
  PROFILBILD_SIZE,
  PROFILBILD_STICKERS,
  rescalePlacement,
  snapNudge,
  snapPerson,
  snapSticker,
  STICKER_BASE_WIDTH,
  type PersonPlacement,
  type PresetDesign,
  type ProfilbildSticker,
} from '@gruenerator/shared/profilbild';
import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { PiTrash } from 'react-icons/pi';

import { useAuthStore } from '../../../stores/authStore';
import { downloadDataUrl } from '../../../utils/downloadFile';
import { type ProfilbildLayout } from '../profilbildCanvas';
import {
  composeProfilbild,
  loadImage,
  renderProfilbildBackground,
  trimCutout,
  type ProfilbildBackground,
  type TrimmedCutout,
} from '../utils/composeProfilbild';
import { loadCachedImage, resolvePreset } from '../utils/profilbildBackgrounds';
import { type PlacedSticker, type StickerChange } from '../utils/profilbildStickers';

import { CUSTOM_ID, ProfilbildBackgroundPicker } from './ProfilbildBackgroundPicker';
import { TOOL_ACTIONS, TOOL_HINT, TOOL_LABEL, TOOL_PANEL, TOOL_PILL } from './ToolUi';

import { cn } from '@/utils/cn';

const ProfilbildStage = lazy(() => import('./ProfilbildStage'));

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
const NUDGE_FAST = NUDGE * 10;
const ARROWS: Record<string, [number, number, string]> = {
  ArrowLeft: [-1, 0, 'links'],
  ArrowRight: [1, 0, 'rechts'],
  ArrowUp: [0, -1, 'oben'],
  ArrowDown: [0, 1, 'unten'],
};
const PERSON_SCALE = { min: 0.7, max: 1, step: 0.05 };
const STICKER_SCALE_STEP = 1.1;
const STICKER_MAX = PROFILBILD_SIZE * 1.5;
const ROTATE_STEP = 15;
const ANNOUNCE_INTERVAL = 600;
const PERSON = 'Person';

const STICKER_TILE_CLASS =
  'flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-grey-300 p-1 outline-none transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-grey-600';

/**
 * A plain colour without stickers stays an editable profilbild canvas; anything
 * else is handed over flattened as one 1080 image, since the canvas can't rebuild it.
 */
export type ProfilbildCanvasHandoff =
  | {
      kind: 'profilbild';
      backgroundColor: string;
      layout: ProfilbildLayout;
      cutoutDataUrl: string;
    }
  | { kind: 'flat'; imageDataUrl: string };

export interface ProfilbildEditorProps {
  cutoutUrl: string;
  onEditInCanvas: (handoff: ProfilbildCanvasHandoff) => Promise<void>;
  onReset: () => void;
}

export function ProfilbildEditor({ cutoutUrl, onEditInCanvas, onReset }: ProfilbildEditorProps) {
  const sizeId = useId();
  const moveHintId = useId();
  const keysHintId = useId();
  const layersId = useId();
  const igProfileRef = useRef<HTMLCanvasElement>(null);
  const igFeedRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const customUrlRef = useRef<string | null>(null);
  const isAustria = useAuthStore((s) => s.locale === 'de-AT');
  const colorSwatches = isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE;
  const presets = useMemo(() => presetDesigns(isAustria), [isAustria]);
  const [cutout, setCutout] = useState<TrimmedCutout | null>(null);
  const [customImage, setCustomImage] = useState<HTMLImageElement | null>(null);
  const [selected, setSelected] = useState(() => colorSwatches[0]?.id ?? 'tanne');
  const [presetBackground, setPresetBackground] = useState<{
    design: PresetDesign;
    background: ProfilbildBackground;
  } | null>(null);
  const [stickers, setStickers] = useState<PlacedSticker[]>([]);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const stickerSeq = useRef(0);
  const backgroundRequest = useRef(0);
  const personLayerRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<PersonPlacement | null>(null);
  const [variant, setVariant] = useState<Variant>('rund');
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pendingAnnouncement = useRef<string | null>(null);
  const announceTimer = useRef<number | null>(null);

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
      if (announceTimer.current) window.clearTimeout(announceTimer.current);
    },
    []
  );

  // A locale switch swaps the palette and the presets: a colour missing from the
  // new palette falls back to its first colour, a chosen preset is re-resolved.
  const flatSwatches = [...colorSwatches, ...GRADIENT_SWATCHES];
  const activeId =
    flatSwatches.some((s) => s.id === selected) ||
    presets.some((p) => p.id === selected) ||
    selected === CUSTOM_ID
      ? selected
      : (colorSwatches[0]?.id ?? selected);
  const flat = flatSwatches.find((s) => s.id === activeId);
  const chosenDesign = presetBackground?.design;
  const stalePreset = chosenDesign
    ? presets.find((p) => p.id === chosenDesign.id && p !== chosenDesign)
    : undefined;
  useEffect(() => {
    if (!stalePreset) return;
    let alive = true;
    resolvePreset(stalePreset)
      .then((resolved) => {
        if (alive) setPresetBackground({ design: stalePreset, background: resolved });
      })
      .catch((cause: unknown) => {
        if (alive) setError(errorMessage(cause, 'Vorlage konnte nicht geladen werden.'));
      });
    return () => {
      alive = false;
    };
  }, [stalePreset]);

  const background = useMemo<ProfilbildBackground | null>(() => {
    if (flat) return flat.background;
    if (presetBackground?.design.id === activeId) return presetBackground.background;
    return activeId === CUSTOM_ID && customImage ? { kind: 'image', image: customImage } : null;
  }, [flat, presetBackground, activeId, customImage]);
  const backgroundCanvas = useMemo(
    () => (background ? renderProfilbildBackground(background) : null),
    [background]
  );

  const colorBackground = flat?.background.kind === 'color' ? flat.background.color : null;
  const flattenForCanvas = !colorBackground || stickers.length > 0;
  const rect = cutout && placement ? placementRect(cutout.image, placement) : null;

  const stickerNames = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(
      stickers.map((s) => {
        const n = (seen.get(s.label) ?? 0) + 1;
        seen.set(s.label, n);
        return [s.uid, n > 1 ? `${s.label} ${n}` : s.label];
      })
    );
  }, [stickers]);

  // Throttled: holding an arrow key would otherwise flood the screen reader.
  const flushAnnouncement = () => {
    announceTimer.current = null;
    const next = pendingAnnouncement.current;
    pendingAnnouncement.current = null;
    if (next === null) return;
    setAnnouncement(next);
    announceTimer.current = window.setTimeout(flushAnnouncement, ANNOUNCE_INTERVAL);
  };
  const announce = (message: string) => {
    pendingAnnouncement.current = message;
    if (announceTimer.current === null) flushAnnouncement();
  };

  const compose = (canvas?: HTMLCanvasElement) =>
    cutout && background && placement
      ? composeProfilbild({
          cutout: cutout.image,
          background,
          scale: placement.scale,
          position: { x: placement.x, y: placement.y },
          canvas,
          stickers,
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

  const changeSticker = (uid: string, next: StickerChange) =>
    setStickers((list) => list.map((s) => (s.uid === uid ? { ...s, ...next } : s)));

  const removeSticker = (uid: string) => {
    setStickers((list) => list.filter((s) => s.uid !== uid));
    setSelectedSticker((cur) => (cur === uid ? null : cur));
  };

  const addSticker = async (sticker: ProfilbildSticker) => {
    setError(null);
    try {
      const image = await loadCachedImage(sticker.src);
      const uid = `sticker-${++stickerSeq.current}`;
      const width = PROFILBILD_SIZE * STICKER_BASE_WIDTH * sticker.defaultScale;
      const height = (width * image.height) / image.width;
      setStickers((list) => {
        const shift = (list.length % 5) * 40;
        return [
          ...list,
          {
            uid,
            label: sticker.label,
            image,
            x: PROFILBILD_SIZE * 0.68 - shift,
            y: PROFILBILD_SIZE * 0.72 - shift,
            width,
            height,
            rotation: 0,
          },
        ];
      });
      setSelectedSticker(uid);
    } catch (cause) {
      setError(errorMessage(cause, 'Sticker konnte nicht geladen werden.'));
    }
  };

  const nudge = (dx: number, dy: number, direction: string, name: string) => {
    const active = stickers.find((st) => st.uid === selectedSticker);
    let from: { x: number; y: number };
    let next: { x: number; y: number; guideX: number | null; guideY: number | null };
    if (active) {
      const box = { ...active, x: active.x + dx, y: active.y + dy };
      from = active;
      next = snapNudge(
        active,
        snapSticker(box, PROFILBILD_SIZE, 0),
        snapSticker(box, PROFILBILD_SIZE)
      );
      changeSticker(active.uid, { ...active, x: next.x, y: next.y });
    } else if (rect) {
      const moved = clampPerson({ ...rect, x: rect.x + dx, y: rect.y + dy }, PROFILBILD_SIZE);
      from = rect;
      next = snapNudge(rect, moved, snapPerson({ ...rect, ...moved }, PROFILBILD_SIZE));
      moveTo({ x: next.x, y: next.y });
    } else return;
    if (next.x === from.x && next.y === from.y) announce(`${name} ist am Rand`);
    else
      announce(
        `${name} nach ${direction} verschoben${next.guideX !== null || next.guideY !== null ? ', eingerastet' : ''}`
      );
  };

  const resize = (grow: boolean, name: string) => {
    const active = stickers.find((st) => st.uid === selectedSticker);
    const verb = grow ? 'vergrößert' : 'verkleinert';
    if (active) {
      let factor = grow ? STICKER_SCALE_STEP : 1 / STICKER_SCALE_STEP;
      factor = Math.max(factor, MIN_STICKER / Math.min(active.width, active.height));
      factor = Math.min(factor, STICKER_MAX / Math.max(active.width, active.height));
      const width = active.width * factor;
      changeSticker(active.uid, { ...active, width, height: active.height * factor });
      announce(`${name} ${verb}: ${Math.round(width)} px breit`);
      return;
    }
    if (!cutout || !placement) return;
    const delta = grow ? PERSON_SCALE.step : -PERSON_SCALE.step;
    const scale = Math.min(
      Math.max(Math.round((placement.scale + delta) * 100) / 100, PERSON_SCALE.min),
      PERSON_SCALE.max
    );
    setPlacement(rescalePlacement(cutout.image, placement, scale));
    announce(`${name} ${verb}: ${Math.round(scale * 100)} %`);
  };

  const onEditorKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const active = stickers.find((st) => st.uid === selectedSticker);
    const name = active ? (stickerNames.get(active.uid) ?? active.label) : PERSON;
    const dir = ARROWS[e.key];
    if (dir) {
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_FAST : NUDGE;
      nudge(dir[0] * step, dir[1] * step, dir[2], name);
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      resize(e.key !== '-', name);
    } else if (active && (e.key === '[' || e.key === ']')) {
      e.preventDefault();
      const rotation = active.rotation + (e.key === ']' ? ROTATE_STEP : -ROTATE_STEP);
      changeSticker(active.uid, { ...active, rotation });
      announce(`${name} gedreht: ${(((rotation % 360) + 360) % 360).toString()}°`);
    } else if (active && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      removeSticker(active.uid);
      announce(`${name} entfernt`);
    } else if (active && e.key === 'Escape') {
      e.preventDefault();
      setSelectedSticker(null);
      announce(`Auswahl aufgehoben – ${PERSON} ausgewählt`);
    }
  };

  const center = () => {
    if (cutout)
      setPlacement((p) => (p ? defaultPlacement(cutout.image, PROFILBILD_SIZE, p.scale) : p));
  };

  const pickCustom = async (file: File) => {
    setError(null);
    const request = ++backgroundRequest.current;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      if (request !== backgroundRequest.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
      customUrlRef.current = url;
      setCustomImage(img);
      setSelected(CUSTOM_ID);
    } catch (cause) {
      URL.revokeObjectURL(url);
      if (request !== backgroundRequest.current) return;
      setError(errorMessage(cause, 'Bild konnte nicht geladen werden.'));
    }
  };

  const selectPreset = async (design: PresetDesign) => {
    setError(null);
    const request = ++backgroundRequest.current;
    try {
      const resolved = await resolvePreset(design);
      if (request !== backgroundRequest.current) return;
      setPresetBackground({ design, background: resolved });
      setSelected(design.id);
    } catch (cause) {
      if (request !== backgroundRequest.current) return;
      setError(errorMessage(cause, 'Vorlage konnte nicht geladen werden.'));
    }
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
      if (flattenForCanvas) {
        const composed = compose();
        if (!composed) return;
        await onEditInCanvas({ kind: 'flat', imageDataUrl: composed.toDataURL('image/png') });
      } else if (colorBackground) {
        await onEditInCanvas({
          kind: 'profilbild',
          backgroundColor: colorBackground,
          layout: {
            imagePosition: { x: Math.round(rect.x), y: Math.round(rect.y) },
            imageSize: { w: rect.width, h: rect.height },
          },
          cutoutDataUrl: cutout.dataUrl ?? cutoutUrl,
        });
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Der Canvas konnte nicht geöffnet werden.'));
    } finally {
      setCanvasBusy(false);
    }
  };

  const scalePct = placement ? Math.round(placement.scale * 100) : 0;

  return (
    <div className="grid gap-lg md:grid-cols-[300px_1fr] md:items-start">
      <div className="mx-auto flex w-full max-w-[300px] flex-col gap-xs md:mx-0">
        <div role="group" aria-label="Vorschau" className="flex gap-xs">
          {VARIANTS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={variant === o.value}
              onClick={() => setVariant(o.value)}
              className={cn(TOOL_PILL, 'flex-1 px-sm')}
            >
              {o.label}
            </button>
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
              aria-label={
                selectedSticker
                  ? 'Sticker verschieben – Pfeiltasten, Entf löscht'
                  : 'Person verschieben – Pfeiltasten'
              }
              aria-describedby={`${moveHintId} ${keysHintId}`}
              onKeyDown={onEditorKey}
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
                    stickers={stickers}
                    selectedSticker={selectedSticker}
                    onSelectSticker={setSelectedSticker}
                    onStickerChange={changeSticker}
                  />
                </Suspense>
              ) : null}
            </div>
            {/* eslint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
            <div aria-live="polite" className="sr-only">
              {announcement}
            </div>
            <div className="flex items-start justify-between gap-sm">
              <p id={moveHintId} className={cn(TOOL_HINT, 'flex-1 text-xs')}>
                Person und Sticker ziehen – sie rasten an Mitte, Raster und Unterkante ein.
              </p>
              {selectedSticker ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => removeSticker(selectedSticker)}
                >
                  Sticker entfernen
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={!cutout}
                  onClick={center}
                >
                  Zentrieren
                </Button>
              )}
            </div>
            <p id={keysHintId} className={cn(TOOL_HINT, 'hidden text-xs md:block')}>
              Tastatur: Pfeile verschieben (Umschalt × 10), + / − Größe, [ / ] drehen, Entf löscht,
              Esc hebt die Auswahl auf.
            </p>
            <div className="flex flex-col gap-xs">
              <span id={layersId} className={cn(TOOL_LABEL, 'text-xs')}>
                Ebenen
              </span>
              <ul aria-labelledby={layersId} className="m-0 flex list-none flex-col gap-xs p-0">
                <li>
                  <button
                    ref={personLayerRef}
                    type="button"
                    aria-pressed={selectedSticker === null}
                    disabled={!cutout}
                    onClick={() => setSelectedSticker(null)}
                    className={cn(TOOL_PILL, 'w-full justify-start')}
                  >
                    {PERSON}
                  </button>
                </li>
                {stickers.map((st) => {
                  const name = stickerNames.get(st.uid) ?? st.label;
                  return (
                    <li key={st.uid} className="flex items-center gap-xs">
                      <button
                        type="button"
                        aria-pressed={selectedSticker === st.uid}
                        onClick={() => setSelectedSticker(st.uid)}
                        className={cn(TOOL_PILL, 'min-w-0 flex-1 justify-start truncate')}
                      >
                        {name}
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`${name} entfernen`}
                        className="shrink-0 max-md:size-11"
                        onClick={() => {
                          removeSticker(st.uid);
                          announce(`${name} entfernt`);
                          personLayerRef.current?.focus();
                        }}
                      >
                        <PiTrash aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
        <p className={cn(TOOL_HINT, 'text-xs')}>{VARIANT_HINTS[variant]}</p>
      </div>

      <div className={cn(TOOL_PANEL, 'flex min-w-0 flex-col gap-lg')}>
        <fieldset className="m-0 flex min-w-0 flex-col gap-sm border-0 p-0">
          <legend className={cn(TOOL_LABEL, 'mb-sm')}>Hintergrund</legend>
          <ProfilbildBackgroundPicker
            colors={colorSwatches}
            presets={presets}
            selected={activeId}
            customImageSrc={customImage?.src ?? null}
            onSelect={(id) => {
              backgroundRequest.current++;
              setSelected(id);
            }}
            onSelectPreset={(design) => void selectPreset(design)}
            onUpload={() => fileRef.current?.click()}
          />
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
        </fieldset>

        <fieldset className="m-0 flex min-w-0 flex-col gap-sm border-0 p-0">
          <legend className={cn(TOOL_LABEL, 'mb-sm')}>Sticker</legend>
          <div className="flex flex-wrap gap-sm">
            {PROFILBILD_STICKERS.map((st) => (
              <button
                key={st.id}
                type="button"
                aria-label={`Sticker ${st.label} hinzufügen`}
                title={st.label}
                disabled={!cutout}
                onClick={() => void addSticker(st)}
                className={STICKER_TILE_CLASS}
                style={{ background: CANVAS_COLORS.TANNE }}
              >
                <img src={st.src} alt="" aria-hidden="true" className="max-h-full max-w-full" />
              </button>
            ))}
          </div>
          {stickers.length > 0 ? (
            <p className={cn(TOOL_HINT, 'text-xs')}>
              Sticker antippen zum Auswählen – Ecken ziehen zum Vergrößern und Drehen.
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-xs">
          <label htmlFor={sizeId} className={cn(TOOL_LABEL, 'flex justify-between')}>
            Größe der Person{' '}
            <span className="font-normal tabular-nums text-grey-600 dark:text-grey-400">
              {scalePct} %
            </span>
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
            className="h-11 w-full cursor-pointer accent-primary-600 md:h-6"
          />
        </div>

        <div className={TOOL_ACTIONS}>
          <Button type="button" variant="brand" disabled={!cutout} onClick={() => void download()}>
            Herunterladen
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={canvasBusy || !cutout}
            onClick={() => void editInCanvas()}
          >
            {canvasBusy ? 'Canvas wird geöffnet …' : 'In Canvas bearbeiten'}
          </Button>
          <Button type="button" variant="ghost" className="sm:ml-auto" onClick={onReset}>
            Anderes Foto
          </Button>
        </div>

        {flattenForCanvas ? (
          <p className={cn(TOOL_HINT, '-mt-sm text-xs')}>
            Im Canvas wird das Bild als Ganzes übernommen – Person und Sticker sind dort nicht mehr
            einzeln verschiebbar.
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
