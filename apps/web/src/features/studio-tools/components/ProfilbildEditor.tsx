import { useMediaQuery } from '@gruenerator/shared/hooks';
import {
  clampPerson,
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  defaultPlacement,
  FREE_BACKGROUND_ID,
  gradientSwatches,
  MIN_STICKER,
  placementRect,
  presetDesigns,
  PROFILBILD_SIZE,
  rescalePlacement,
  snapNudge,
  snapPerson,
  snapSticker,
  STICKER_BASE_WIDTH,
  stickerById,
  type FreeBackground,
  type PersonPlacement,
  type PresetDesign,
  type ProfilbildSticker,
  type SavedProfilbild,
  type SavedProfilbildSticker,
} from '@gruenerator/shared/profilbild';
import { assetStickerId, isAssetStickerId, isShareSrc } from '@gruenerator/shared/stickers';
import {
  Alert,
  AlertDescription,
  Button,
  Slider,
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { PiArrowsOut, PiDotsThree, PiImage, PiSticker } from 'react-icons/pi';

import { useAuthStore } from '../../../stores/authStore';
import { downloadDataUrl } from '../../../utils/downloadFile';
import { BackgroundUploadDialog } from '../../studio-assets/BackgroundUploadDialog';
import {
  loadShareFileDataUrl,
  type ProfilbildSaveInput,
  useProfilbildShare,
} from '../hooks/useProfilbildShare';
import { type ProfilbildLayout } from '../profilbildCanvas';
import {
  composeProfilbild,
  loadImage,
  renderProfilbildBackground,
  trimCutout,
  type ProfilbildBackground,
  type TrimmedCutout,
} from '../utils/composeProfilbild';
import { type GalleryAsset } from '../utils/galleryAsset';
import { loadCachedImage, resolvePreset } from '../utils/profilbildBackgrounds';
import {
  restoreSavedStickers,
  type PlacedSticker,
  type StickerChange,
} from '../utils/profilbildStickers';

import { CUSTOM_ID, ProfilbildBackgroundPicker } from './ProfilbildBackgroundPicker';
import { ProfilbildStickerPicker } from './ProfilbildStickerPicker';

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

type MobileSheet = 'hintergrund' | 'sticker' | 'groesse' | 'mehr';

const MOBILE_TOOLS: { id: MobileSheet; label: string; icon: typeof PiImage }[] = [
  { id: 'hintergrund', label: 'Hintergrund', icon: PiImage },
  { id: 'sticker', label: 'Sticker', icon: PiSticker },
  { id: 'groesse', label: 'Größe', icon: PiArrowsOut },
  { id: 'mehr', label: 'Mehr', icon: PiDotsThree },
];

const SHEET_TITLES: Record<MobileSheet, string> = {
  hintergrund: 'Hintergrund',
  sticker: 'Sticker',
  groesse: 'Größe der Person',
  mehr: 'Mehr',
};

/** Gedrückt halten ohne Bewegung öffnet auf dem Handy die Instagram-Vorschau. */
const PEEK_DELAY = 450;
const PEEK_SLOP = 5;

const NUDGE = 10;
const NUDGE_FAST = NUDGE * 10;
const ARROWS: Record<string, [number, number, string]> = {
  ArrowLeft: [-1, 0, 'links'],
  ArrowRight: [1, 0, 'rechts'],
  ArrowUp: [0, -1, 'oben'],
  ArrowDown: [0, 1, 'unten'],
};
const PERSON_SCALE = { min: 0.5, max: 1.5, step: 0.05 };
const STICKER_SCALE_STEP = 1.1;
const STICKER_MAX = PROFILBILD_SIZE * 1.5;
const ROTATE_STEP = 15;
const ANNOUNCE_INTERVAL = 600;

/** The pause after the last edit before the Profilbild is saved. */
const AUTOSAVE_DELAY = 1500;

const SAVE_STATUS = {
  idle: '',
  saving: 'Wird gespeichert …',
  saved: 'Unter „Zuletzt“ gespeichert',
  error: 'Nicht gespeichert – die nächste Änderung versucht es erneut.',
};
const PERSON = 'Person';

/**
 * A plain colour stays an editable profilbild canvas, its stickers as movable
 * elements; gradients, presets and own photos are handed over flattened as one
 * 1080 image.
 */
export type ProfilbildCanvasHandoff =
  | {
      kind: 'profilbild';
      backgroundColor: string;
      layout: ProfilbildLayout;
      cutoutDataUrl: string;
      stickers: SavedProfilbildSticker[];
    }
  | { kind: 'flat'; imageDataUrl: string };

/** A saved Profilbild being reopened: its share and the editor state stored with it. */
export interface ProfilbildReopen {
  shareToken: string;
  saved: SavedProfilbild;
}

export interface ProfilbildEditorProps {
  title: string;
  description: string;
  /** Above the stage, e.g. the recent Profilbilder while the stage is empty. */
  beforeStage?: ReactNode;
  /** The cut-out person; null until a photo is in — the editor shows `emptyStage` instead. */
  cutoutUrl: string | null;
  /**
   * Fills the stage while there is no person yet: upload, progress or error. Gets
   * the chosen background as an image URL, to preview it without a person.
   */
  emptyStage?: (backgroundPreview: string | null) => ReactNode;
  reopen?: ProfilbildReopen | null;
  /** A gallery item handed over by deep link, applied once the photo is in. */
  galleryAsset?: GalleryAsset | null;
  onEditInCanvas: (handoff: ProfilbildCanvasHandoff) => Promise<void>;
  onReset: () => void;
}

export function ProfilbildEditor({
  title,
  description,
  beforeStage,
  cutoutUrl,
  emptyStage,
  reopen = null,
  galleryAsset = null,
  onEditInCanvas,
  onReset,
}: ProfilbildEditorProps) {
  const backgroundHeadingId = useId();
  const stickerHeadingId = useId();
  const sizeHeadingId = useId();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [sheet, setSheet] = useState<MobileSheet | null>(null);
  const [peek, setPeek] = useState(false);
  const peekStart = useRef<{ x: number; y: number; timer: number } | null>(null);
  const endPeek = () => {
    if (peekStart.current) window.clearTimeout(peekStart.current.timer);
    peekStart.current = null;
    setPeek(false);
  };
  const peekHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      endPeek();
      peekStart.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => setPeek(true), PEEK_DELAY),
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const start = peekStart.current;
      if (start && !peek && Math.hypot(e.clientX - start.x, e.clientY - start.y) > PEEK_SLOP)
        endPeek();
    },
    onPointerUp: endPeek,
    onPointerCancel: endPeek,
    // A long press would otherwise open the system menu instead of the preview.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  useEffect(() => () => endPeek(), []);
  const moveHintId = useId();
  const igProfileRef = useRef<HTMLCanvasElement>(null);
  const igFeedRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const customUrlRef = useRef<string | null>(null);
  const isAustria = useAuthStore((s) => s.locale === 'de-AT');
  const galleryAssetRef = useRef(galleryAsset);
  const [sharingCustom, setSharingCustom] = useState(false);
  // The own photo already shared to the gallery, so it is not offered twice.
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const colorSwatches = isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE;
  const presets = useMemo(() => presetDesigns(isAustria), [isAustria]);
  const presetsRef = useRef(presets);
  const reopenRef = useRef(reopen);
  const savedBackground = reopen?.saved.background;
  const saveProfilbild = useProfilbildShare(reopen?.shareToken ?? null);
  const [cutout, setCutout] = useState<TrimmedCutout | null>(null);
  const [customImage, setCustomImage] = useState<HTMLImageElement | null>(null);
  // Where the own background photo lives: a stored share file once saved, else the picked file.
  const [customSource, setCustomSource] = useState<{ url: string | null; file: File | null }>(
    () => ({ url: savedBackground?.kind === 'custom' ? savedBackground.url : null, file: null })
  );
  const [selected, setSelected] = useState(() =>
    savedBackground
      ? savedBackground.kind === 'custom'
        ? CUSTOM_ID
        : savedBackground.kind === 'free'
          ? FREE_BACKGROUND_ID
          : savedBackground.id
      : (colorSwatches[0]?.id ?? 'tanne')
  );
  const [freeBackground, setFreeBackground] = useState<FreeBackground | null>(() =>
    savedBackground?.kind === 'free' ? savedBackground.background : null
  );
  const [presetBackground, setPresetBackground] = useState<{
    design: PresetDesign;
    background: ProfilbildBackground;
  } | null>(null);
  const [stickers, setStickers] = useState<PlacedSticker[]>([]);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const stickerSeq = useRef(0);
  // Saved stickers whose image failed to load: kept in the saved state, not drawn.
  const unrestoredStickers = useRef<SavedProfilbildSticker[]>([]);
  const backgroundRequest = useRef(0);
  const [placement, setPlacement] = useState<PersonPlacement | null>(null);
  const [variant, setVariant] = useState<Variant>('rund');
  const [canvasBusy, setCanvasBusy] = useState(false);
  // A reopened Profilbild is only compared against what is saved once its stickers are in.
  const [restored, setRestored] = useState(!reopen);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // The state last written (or loaded); `undefined` until a reopened one has settled.
  const lastSaved = useRef<string | undefined>(reopen ? undefined : '');
  const pendingSave = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pendingAnnouncement = useRef<string | null>(null);
  const announceTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!cutoutUrl) return;
    let alive = true;
    loadImage(cutoutUrl)
      .then((img) => {
        if (!alive) return;
        const trimmed = trimCutout(img);
        setCutout(trimmed);
        setPlacement(reopenRef.current?.saved.person ?? defaultPlacement(trimmed.image));
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

  // Reopening: load what the saved state only references — preset, own photo, stickers.
  useEffect(() => {
    const saved = reopenRef.current?.saved;
    if (!saved) return;
    let alive = true;
    const fail = (cause: unknown) => {
      if (alive)
        setError(errorMessage(cause, 'Das Profilbild konnte nicht vollständig geladen werden.'));
    };
    const bg = saved.background;
    if (bg.kind === 'custom') {
      loadShareFileDataUrl(bg.url)
        .then(loadImage)
        .then((img) => {
          if (alive) setCustomImage(img);
        })
        .catch(fail);
    } else if (bg.kind === 'id') {
      const design = presetsRef.current.find((p) => p.id === bg.id);
      if (design)
        resolvePreset(design)
          .then((resolved) => {
            if (alive) setPresetBackground({ design, background: resolved });
          })
          .catch(fail);
    }
    restoreSavedStickers(
      saved.stickers,
      async (s) => {
        const sticker = isAssetStickerId(s.id) ? null : stickerById(s.id);
        const src = sticker?.src ?? s.src;
        if (!src) return null;
        const image = sticker
          ? await loadCachedImage(src)
          : await loadShareFileDataUrl(src).then(loadImage);
        const placed: PlacedSticker = {
          ...s,
          src,
          uid: `sticker-${++stickerSeq.current}`,
          label: sticker?.label ?? 'Sticker',
          image,
        };
        return placed;
      },
      fail
    )
      .then(({ placed, unrestored }) => {
        if (!alive) return;
        unrestoredStickers.current = unrestored;
        setStickers(placed);
      })
      .catch(fail)
      .finally(() => {
        if (alive) setRestored(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A locale switch swaps the palette and the presets: a colour missing from the
  // new palette falls back to its first colour, a chosen preset is re-resolved.
  const gradients = gradientSwatches(isAustria);
  const flatSwatches = [
    ...colorSwatches,
    ...gradients,
    ...(freeBackground
      ? [{ id: FREE_BACKGROUND_ID, label: 'Eigene Farbe', background: freeBackground }]
      : []),
  ];
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
  const backgroundPreview = useMemo(
    () => (!cutoutUrl && backgroundCanvas ? backgroundCanvas.toDataURL('image/jpeg', 0.8) : null),
    [cutoutUrl, backgroundCanvas]
  );

  const colorBackground = flat?.background.kind === 'color' ? flat.background.color : null;
  const flattenForCanvas = !colorBackground;
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
    if (variant !== 'instagram' && !peek) return;
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

  const placeSticker = (
    sticker: Pick<PlacedSticker, 'id' | 'src' | 'label' | 'image'>,
    scale: number,
    aspect: number
  ) => {
    const uid = `sticker-${++stickerSeq.current}`;
    const width = PROFILBILD_SIZE * STICKER_BASE_WIDTH * scale;
    setStickers((list) => {
      const shift = (list.length % 5) * 40;
      return [
        ...list,
        {
          ...sticker,
          uid,
          x: PROFILBILD_SIZE * 0.68 - shift,
          y: PROFILBILD_SIZE * 0.72 - shift,
          width,
          height: width * aspect,
          rotation: 0,
        },
      ];
    });
    setSelectedSticker(uid);
  };

  const addSticker = async (sticker: ProfilbildSticker) => {
    setError(null);
    try {
      const image = await loadCachedImage(sticker.src);
      placeSticker(
        { id: sticker.id, src: sticker.src, label: sticker.label, image },
        sticker.defaultScale,
        image.height / image.width
      );
    } catch (cause) {
      setError(errorMessage(cause, 'Sticker konnte nicht geladen werden.'));
    }
  };

  // Loaded as a data URL, like a reopened gallery sticker, so the export canvas stays untainted.
  const addGallerySticker = async (item: GalleryAsset) => {
    setError(null);
    if (!isShareSrc(item.src)) {
      setError('Dieser Sticker kann nicht verwendet werden.');
      return;
    }
    try {
      const image = await loadImage(await loadShareFileDataUrl(item.src));
      const aspect =
        item.width > 0 && item.height > 0 ? item.height / item.width : image.height / image.width;
      placeSticker(
        { id: assetStickerId(item.id), src: item.src, label: item.title || 'Sticker', image },
        1,
        aspect
      );
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
    } else if (e.key === ' ' && stickers.length > 0) {
      e.preventDefault();
      const order = [null, ...stickers.map((st) => st.uid)];
      const next = order[(order.indexOf(selectedSticker) + 1) % order.length] ?? null;
      setSelectedSticker(next);
      const picked = stickers.find((st) => st.uid === next);
      announce(`${picked ? (stickerNames.get(picked.uid) ?? picked.label) : PERSON} ausgewählt`);
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
      setCustomSource({ url: null, file });
      setSelected(CUSTOM_ID);
    } catch (cause) {
      URL.revokeObjectURL(url);
      if (request !== backgroundRequest.current) return;
      setError(errorMessage(cause, 'Bild konnte nicht geladen werden.'));
    }
  };

  const pickGalleryBackground = async (item: GalleryAsset) => {
    setError(null);
    if (!isShareSrc(item.src)) {
      setError('Dieser Hintergrund kann nicht verwendet werden.');
      return;
    }
    const request = ++backgroundRequest.current;
    try {
      const img = await loadImage(await loadShareFileDataUrl(item.src));
      if (request !== backgroundRequest.current) return;
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
      customUrlRef.current = null;
      setCustomImage(img);
      setCustomSource({ url: item.src, file: null });
      setSelected(CUSTOM_ID);
    } catch (cause) {
      if (request !== backgroundRequest.current) return;
      setError(errorMessage(cause, 'Hintergrund konnte nicht geladen werden.'));
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

  // A gallery deep link lands once the photo (and a reopened state) is in.
  useEffect(() => {
    const asset = galleryAssetRef.current;
    if (!asset || !cutout || !restored) return;
    galleryAssetRef.current = null;
    void (asset.kind === 'sticker' ? addGallerySticker(asset) : pickGalleryBackground(asset));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applied once; the handlers only read state setters
  }, [cutout, restored]);

  const placedStickers = (): SavedProfilbildSticker[] =>
    stickers.map(({ id, src, x, y, width, height, rotation }) => ({
      id,
      ...(isAssetStickerId(id) ? { src } : {}),
      x,
      y,
      width,
      height,
      rotation,
    }));

  const saveInputFor = (imageDataUrl: string): ProfilbildSaveInput | null =>
    cutout && placement && cutoutUrl
      ? {
          imageDataUrl,
          cutoutDataUrl: cutout.dataUrl ?? cutoutUrl,
          person: placement,
          background:
            activeId === CUSTOM_ID
              ? { kind: 'custom', ...customSource }
              : activeId === FREE_BACKGROUND_ID && freeBackground
                ? { kind: 'free', background: freeBackground }
                : { kind: 'id', id: activeId },
          stickers: [...placedStickers(), ...unrestoredStickers.current],
        }
      : null;

  // What the saved Profilbild is made of; a change to any of it is worth saving.
  const { file: customFile, url: customUrl } = customSource;
  const signature = JSON.stringify([
    placement,
    activeId,
    activeId === CUSTOM_ID ? [customUrl, customFile?.name, customFile?.size] : null,
    activeId === FREE_BACKGROUND_ID ? freeBackground : null,
    stickers.map(({ id, x, y, width, height, rotation }) => [id, x, y, width, height, rotation]),
  ]);
  const ready = restored && !!cutout && !!placement && !!background;

  // Autosave, like the canvas: a pause in editing writes the Profilbild to „Zuletzt".
  useEffect(() => {
    if (!ready) return;
    if (lastSaved.current === undefined) {
      lastSaved.current = signature;
      return;
    }
    if (signature === lastSaved.current) return;
    const run = () => {
      pendingSave.current = null;
      const composed = compose();
      const input = composed && saveInputFor(composed.toDataURL('image/png'));
      if (!input) return;
      lastSaved.current = signature;
      setSaveState('saving');
      saveProfilbild(input)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    };
    pendingSave.current = run;
    const timer = window.setTimeout(run, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  });

  // Leaving within the pause still keeps the last change.
  useEffect(() => () => pendingSave.current?.(), []);

  const download = async () => {
    setError(null);
    let imageDataUrl: string;
    try {
      const composed = compose();
      if (!composed || !cutout || !placement) return;
      imageDataUrl = composed.toDataURL('image/png');
      await downloadDataUrl(imageDataUrl, 'profilbild.png');
    } catch (cause) {
      setError(errorMessage(cause, 'Der Download ist fehlgeschlagen.'));
      return;
    }
    try {
      const input = saveInputFor(imageDataUrl);
      if (!input) return;
      await saveProfilbild(input);
      lastSaved.current = signature;
      setSaveState('saved');
    } catch {
      setError('Heruntergeladen – unter „Zuletzt“ gespeichert werden konnte es aber nicht.');
    }
  };

  const editInCanvas = async () => {
    if (canvasBusy || !cutout || !rect || !cutoutUrl) return;
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
          stickers: placedStickers(),
        });
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Der Canvas konnte nicht geöffnet werden.'));
    } finally {
      setCanvasBusy(false);
    }
  };

  const scalePct = placement ? Math.round(placement.scale * 100) : 0;
  const backgroundName =
    activeId === CUSTOM_ID
      ? 'Eigenes Bild'
      : (flat?.label ?? presets.find((p) => p.id === activeId)?.label ?? '');
  const hasPhoto = !!cutoutUrl;

  const downloadButton = (
    <Button
      type="button"
      variant="brand"
      size={isMobile ? 'lg' : 'default'}
      disabled={!cutout}
      onClick={() => void download()}
    >
      Herunterladen
    </Button>
  );

  const sizeSlider = (
    <Slider
      aria-label="Größe der Person"
      min={PERSON_SCALE.min * 100}
      max={PERSON_SCALE.max * 100}
      step={1}
      value={[scalePct]}
      disabled={!placement}
      onValueChange={([pct]) => {
        if (cutout && pct !== undefined)
          setPlacement((p) => (p ? rescalePlacement(cutout.image, p, pct / 100) : p));
      }}
    />
  );

  const backgroundPicker = (
    <ProfilbildBackgroundPicker
      colors={colorSwatches}
      gradients={gradients}
      freeBackground={freeBackground}
      onSelectFree={(bg) => {
        backgroundRequest.current++;
        setFreeBackground(bg);
        setSelected(FREE_BACKGROUND_ID);
      }}
      presets={presets}
      selected={activeId}
      customImageSrc={customImage?.src ?? null}
      customUrl={customSource.url}
      onSelect={(id) => {
        backgroundRequest.current++;
        setSelected(id);
      }}
      onSelectPreset={(design) => void selectPreset(design)}
      onSelectGallery={(item) => void pickGalleryBackground(item)}
      onUpload={() => fileRef.current?.click()}
      onShareCustom={
        customSource.file && customSource.file !== sharedFile ? () => setSharingCustom(true) : null
      }
    />
  );

  const stickerPicker = (
    <ProfilbildStickerPicker
      locale={isAustria ? 'de-AT' : 'de-DE'}
      disabled={!cutout}
      onAddSystem={(st) => void addSticker(st)}
      onAddAsset={(item) => void addGallerySticker(item)}
    />
  );

  // Unter der Bühne nur der Hinweis und eine Aktion: gearbeitet wird im Bild selbst.
  const stageBar = (
    <div className="flex w-full items-start justify-between gap-3">
      <p id={moveHintId} className="m-0 text-xs leading-snug text-muted-foreground">
        {isMobile
          ? 'Ziehen zum Verschieben. Gedrückt halten für die Instagram-Vorschau.'
          : 'Ziehen zum Verschieben. Leertaste wählt aus, Pfeiltasten bewegen, + / – skaliert, [ ] dreht, Entf löscht.'}
      </p>
      {selectedSticker ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            const st = stickers.find((s) => s.uid === selectedSticker);
            removeSticker(selectedSticker);
            if (st) announce(`${stickerNames.get(st.uid) ?? st.label} entfernt`);
          }}
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
  );

  // Handy: immer Quadrat mit Kreisrand; Desktop: die gewählte Form.
  const shape: Variant = isMobile ? 'rund' : variant;
  const stageFrame = (
    <div
      {...(hasPhoto
        ? {
            role: 'application',
            tabIndex: 0,
            'aria-label': selectedSticker
              ? 'Sticker verschieben – Pfeiltasten, Entf löscht'
              : 'Person verschieben – Pfeiltasten',
            'aria-describedby': moveHintId,
            onKeyDown: onEditorKey,
          }
        : {})}
      {...(isMobile && hasPhoto ? peekHandlers : {})}
      className={cn(
        'relative aspect-square w-full touch-manipulation overflow-hidden bg-surface shadow-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background-alt',
        shape === 'rund' && !isMobile && hasPhoto ? 'rounded-full' : 'rounded-[4%]',
        'transition-[border-radius] duration-250 motion-reduce:transition-none'
      )}
    >
      {!hasPhoto ? (
        <div className="relative size-full">{emptyStage?.(backgroundPreview)}</div>
      ) : cutout && rect && backgroundCanvas ? (
        <Suspense fallback={null}>
          <ProfilbildStage
            background={backgroundCanvas}
            person={cutout.image}
            rect={rect}
            round={isMobile}
            onMove={moveTo}
            stickers={stickers}
            selectedSticker={selectedSticker}
            onSelectSticker={setSelectedSticker}
            onStickerChange={changeSticker}
          />
        </Suspense>
      ) : null}
      {peek ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="w-[86%]">
            <InstagramPreview profileRef={igProfileRef} feedRef={igFeedRef} />
          </div>
        </div>
      ) : null}
    </div>
  );

  const stage =
    !isMobile && variant === 'instagram' && cutout ? (
      <div className="w-[min(560px,100cqw_-_48px)]">
        <InstagramPreview profileRef={igProfileRef} feedRef={igFeedRef} />
      </div>
    ) : (
      <div
        className={cn(
          'flex flex-col items-center gap-3',
          isMobile
            ? sheet
              ? 'w-[min(342px,100cqw_-_48px,100cqh_-_24px)]'
              : 'w-[min(342px,100cqw_-_48px,100cqh_-_96px)]'
            : 'w-[min(500px,100cqw_-_48px,100cqh_-_260px)]'
        )}
      >
        {stageFrame}
        {hasPhoto && !(isMobile && sheet) ? stageBar : null}
      </div>
    );

  const errorAlert = error ? (
    <Alert variant="destructive" role="alert" className="w-full max-w-[500px]">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  const saveStatus = (className: string) => (
    <p role="status" className={cn('m-0 text-muted-foreground', className)}>
      {hasPhoto ? SAVE_STATUS[saveState] : ''}
    </p>
  );

  const sectionHead = (heading: string, aside: ReactNode, id?: string) => (
    <div className="flex items-baseline justify-between gap-sm">
      <h2 id={id} className="m-0 text-base font-semibold text-foreground-heading">
        {heading}
      </h2>
      <span className="min-w-0 truncate text-[13px] text-muted-foreground">{aside}</span>
    </div>
  );

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header
        className={cn(
          'flex flex-none items-center justify-between gap-md',
          isMobile ? 'pt-1.5 pr-4 pb-2.5 pl-14' : 'h-[72px] border-b border-border px-6 lg:px-8'
        )}
      >
        <div
          className={cn('flex min-w-0', isMobile ? 'flex-col gap-0.5' : 'items-baseline gap-3.5')}
        >
          <h1
            className={cn(
              'm-0 shrink-0 font-semibold text-foreground-heading',
              isMobile ? 'text-[22px]' : 'text-2xl'
            )}
          >
            {title}
          </h1>
          {isMobile ? (
            saveStatus('truncate text-xs')
          ) : (
            <span className="hidden truncate text-[15px] text-muted-foreground xl:inline">
              {description}
            </span>
          )}
        </div>
        {hasPhoto ? (
          <div className="flex flex-none items-center gap-2">
            {isMobile ? null : (
              <>
                {saveStatus('mr-2 hidden text-[13px] lg:block')}
                <Button type="button" variant="ghost" onClick={onReset}>
                  Anderes Foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={canvasBusy || !cutout}
                  onClick={() => void editInCanvas()}
                >
                  {canvasBusy ? 'Canvas wird geöffnet …' : 'In Canvas bearbeiten'}
                </Button>
              </>
            )}
            {downloadButton}
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <main
          // Die Bühne bemisst sich an dieser Fläche (Container-Einheiten): so groß wie
          // möglich, ohne dass sie mit Umschalter und Hinweis über den Rand ragt.
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-background-alt [container-type:size]',
            isMobile ? 'gap-3 px-6 py-3' : 'gap-7 p-6 lg:p-8'
          )}
        >
          {beforeStage}
          {stage}
          {!isMobile && hasPhoto ? (
            <div className="flex flex-none flex-col items-center gap-3.5">
              <ToggleGroup
                type="single"
                variant="outline"
                aria-label="Vorschau"
                value={variant}
                onValueChange={(v) => {
                  if (v) setVariant(v as Variant);
                }}
              >
                {VARIANTS.map((o) => (
                  <ToggleGroupItem key={o.value} value={o.value} className="px-4">
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="m-0 text-[13px] text-muted-foreground">{VARIANT_HINTS[variant]}</p>
            </div>
          ) : null}
          {errorAlert}
        </main>

        {!isMobile ? (
          <aside className="flex w-[340px] flex-none flex-col gap-8 overflow-y-auto border-l border-border p-6 lg:w-[400px] lg:p-7">
            <section aria-labelledby={backgroundHeadingId} className="flex flex-col gap-3.5">
              {sectionHead('Hintergrund', backgroundName, backgroundHeadingId)}
              {backgroundPicker}
            </section>
            {hasPhoto ? (
              <>
                <section aria-labelledby={stickerHeadingId} className="flex flex-col gap-3.5">
                  {sectionHead('Sticker', 'Mehrere möglich', stickerHeadingId)}
                  {stickerPicker}
                </section>
                <section aria-labelledby={sizeHeadingId} className="flex flex-col gap-3.5">
                  <div className="flex items-baseline justify-between gap-sm">
                    <h2
                      id={sizeHeadingId}
                      className="m-0 text-base font-semibold text-foreground-heading"
                    >
                      Größe der Person
                    </h2>
                    <span className="text-sm tabular-nums text-muted-foreground">{scalePct} %</span>
                  </div>
                  {sizeSlider}
                </section>
                {flattenForCanvas ? (
                  <p className="mt-auto mb-0 text-[13px] leading-normal text-muted-foreground">
                    „In Canvas bearbeiten“ übernimmt das Bild als Ganzes – Person und Sticker sind
                    dort nicht mehr einzeln verschiebbar.
                  </p>
                ) : null}
              </>
            ) : null}
          </aside>
        ) : null}
      </div>

      {isMobile ? (
        <>
          {sheet ? (
            <section
              aria-label={SHEET_TITLES[sheet]}
              className="relative z-10 -mt-5 flex max-h-[60dvh] flex-none flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-background px-4 pt-2 pb-4 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
            >
              <span
                aria-hidden="true"
                className="h-[5px] w-10 flex-none self-center rounded-full bg-border"
              />
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[17px] font-semibold text-foreground-heading">
                  {SHEET_TITLES[sheet]}
                </h2>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSheet(null)}>
                  Fertig
                </Button>
              </div>
              {sheet === 'hintergrund' ? backgroundPicker : null}
              {sheet === 'sticker' ? (
                <div className="flex flex-col gap-2.5">
                  <span className="text-[13px] text-muted-foreground">
                    Mehrere möglich · auf dem Bild verschieben
                  </span>
                  <div className="max-h-[228px] overflow-y-auto">{stickerPicker}</div>
                </div>
              ) : null}
              {sheet === 'groesse' ? (
                <div className="flex flex-col gap-3.5 pb-1.5">
                  <div className="flex justify-between text-sm">
                    <strong>Größe der Person</strong>
                    <span className="tabular-nums text-muted-foreground">{scalePct} %</span>
                  </div>
                  <div className="px-1 py-2">{sizeSlider}</div>
                </div>
              ) : null}
              {sheet === 'mehr' ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-12 w-full"
                    disabled={canvasBusy || !cutout}
                    onClick={() => void editInCanvas()}
                  >
                    {canvasBusy ? 'Canvas wird geöffnet …' : 'In Canvas bearbeiten'}
                  </Button>
                  {flattenForCanvas ? (
                    <span className="px-1 pb-1.5 text-xs leading-snug text-muted-foreground">
                      Im Canvas wird das Bild als Ganzes übernommen – Person und Sticker sind dort
                      nicht mehr einzeln verschiebbar.
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-12 w-full"
                    onClick={onReset}
                  >
                    Anderes Foto
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
          <nav
            aria-label="Werkzeuge"
            className="grid flex-none grid-cols-4 border-t border-border bg-background px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
          >
            {MOBILE_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                aria-pressed={sheet === tool.id}
                // Ohne Foto gibt es nur den Hintergrund zu wählen.
                disabled={!hasPhoto && tool.id !== 'hintergrund'}
                onClick={() => setSheet((s) => (s === tool.id ? null : tool.id))}
                className="flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:text-primary-600"
              >
                <tool.icon aria-hidden="true" className="size-6" />
                {tool.label}
              </button>
            ))}
          </nav>
        </>
      ) : null}

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
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

      {sharingCustom && customSource.file ? (
        <BackgroundUploadDialog
          initialFile={customSource.file}
          onCreated={() => setSharedFile(customSource.file)}
          onClose={() => setSharingCustom(false)}
        />
      ) : null}
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
