import React, { useState } from 'react';
import { PiCopy, PiLockSimple, PiLockSimpleOpen, PiTrash } from 'react-icons/pi';

import { type BackgroundControls } from '../../configs/types';
import { type ShadowPatch } from '../../hooks/useFloatingModuleHandlers';
import { type FloatingModuleState } from '../../hooks/useFloatingModuleState';
import { formatShortcut, isMacPlatform, shortcutOf } from '../../utils/canvasCommandRegistry';
import { type SelectionGeometry } from '../../utils/canvasCommands';
import { type GradientFill } from '../../utils/gradientFill';
import { type LockState } from '../../utils/layerLock';
import { BRAND_COLORS, FONT_COLORS, STROKE_ONLY_SHAPES } from '../../utils/shapes';
import { type TextAlign } from '../../utils/textAlign';
import { useCanvasTextFormatting } from '../CanvasTextOverlay';

import { CropModeControls } from './CropModeControls';
import {
  BackgroundImagePicker,
  BackgroundRemoveImageButton,
  BackgroundRestoreImageButton,
  BackgroundZoomControl,
  SetAsBackgroundButton,
} from './modules/FloatingBackgroundControls';
import { FloatingColorPicker } from './modules/FloatingColorPicker';
import { FloatingFontSizeControl } from './modules/FloatingFontSizeControl';
import { FloatingGradientControl } from './modules/FloatingGradientControl';
import { FloatingLayerControls } from './modules/FloatingLayerControls';
import { FloatingOpacityControl } from './modules/FloatingOpacityControl';
import { FloatingOutlineControl } from './modules/FloatingOutlineControl';
import { FloatingPositionControl, type PositionCommandId } from './modules/FloatingPositionControl';
import { FloatingShadowControl } from './modules/FloatingShadowControl';
import { FloatingTextAlignControl } from './modules/FloatingTextAlignControl';

export interface ContextControlsProps {
  selectedElement: string | null;
  activeFloatingModule: FloatingModuleState | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Vorlagen-Elemente und Icons lassen sich nicht duplizieren — der Knopf
   *  bleibt sichtbar und ausgegraut, statt zu verschwinden. */
  canDuplicate: boolean;
  /** The selected framed photo is in Ausschnitt mode. */
  isCropping?: boolean;
  /** Gesperrt: nicht ziehen, skalieren, ausrichten, löschen — gestalten geht weiter. */
  lockState?: LockState;
  canLock?: boolean;
  /** Lässt sich die Auswahl verschieben — Ausrichten und Position (`selectionCapabilities`). */
  canAlign?: boolean;
  /** Zählt hoch, wenn das Kontextmenü „Bild ersetzen …“ wählt: die Bildauswahl öffnet sich. */
  backgroundPickerRequest?: number;
  handlers: {
    handleMoveLayer: (direction: 'up' | 'down') => void;
    handleDuplicate: () => void;
    handleColorSelect: (color: string) => void;
    handleOpacityChange: (id: string, opacity: number, type: string) => void;
    handleFontSizeChange: (id: string, size: number) => void;
    /** Ausrichten und Position laufen über die Befehls-Türen der Seite. */
    runCommand?: (id: PositionCommandId) => void;
    getGeometry?: () => SelectionGeometry | null;
    handlePositionChange?: (patch: { x?: number; y?: number }) => void;
    handleSizeChange?: (patch: { width?: number; height?: number }) => void;
    handleShadowChange?: (id: string, patch: ShadowPatch, type: string) => void;
    handleOutlineChange?: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
    handleBlurChange?: (id: string, blur: number) => void;
    /** Ausschnitt mode for a framed photo: the photo moves inside its frame. */
    handleCropImage?: () => void;
    /** Im Zuschneide-Modus: zurück zum Stand beim Betreten bzw. übernehmen. */
    handleCancelCrop?: () => void;
    handleFinishCrop?: () => void;
    handleGradientSelect?: (gradient: GradientFill | null) => void;
    /** Ausrichtung des Textes in seiner Box — freie und Vorlagen-Texte. */
    handleTextAlignChange?: (id: string, align: TextAlign) => void;
    handleToggleLock?: () => void;
    /** Opens the image-adjust ("Bearbeiten") panel for the selected image. */
    onEditImage?: () => void;
  };
  /** The page's background controls (colour plane and photo), if the template has them. */
  background?: BackgroundControls | null;
  /** Removes one own image by id — not "the selection", which can change meanwhile. */
  onRemoveUserImage?: (id: string) => void;
  /** Löscht die Auswahl — nur die Desktop-Leiste gibt es mit; mobil liegt Löschen in der Pille. */
  onDeleteElement?: () => void;
  /** Vorlagen-Elemente und gesperrte lassen sich nicht löschen. */
  canDelete?: boolean;
  /** Mobil, im „Auswahl“-Block des Sheets: die Seite löschen. */
  onDeletePage?: () => void;
  /** Clears the element selection. Escape does the same, but is invisible. */
  onDeselect?: () => void;
  /** Mobil: Duplizieren, Löschen und Abwählen liegen in Pille und ✓, nicht hier. */
  hideObjectActions?: boolean;
}

/** Läuft ein Zuschneide-Modus, zeigt die Leiste nur ihn (`CropModeControls`). */
export function showsCropModeBar({
  isCropping,
  handlers,
}: Pick<ContextControlsProps, 'isCropping' | 'handlers'>): boolean {
  return !!isCropping && !!handlers.handleCancelCrop && !!handlers.handleFinishCrop;
}

const ICON_BTN =
  'inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

const DANGER_BTN =
  'inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-danger-bg)] hover:text-[var(--editor-danger-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

const CROP_BTN =
  'inline-flex items-center gap-1.5 h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none bg-transparent px-2 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] aria-pressed:bg-[var(--editor-active-bg)] aria-pressed:text-[var(--editor-active-fg)]';

const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=gruenerator&utm_medium=referral';

const SEP = 'w-px h-[22px] bg-[var(--editor-border-soft)] mx-1 shrink-0';

/**
 * ContextControls — the selection-driven formatting controls (color, font size,
 * alignment, opacity, layer order, duplicate, lock, delete; delete page in the
 * mobile sheet). Shared between the desktop
 * floating ContextToolbar and the mobile bottom context row; owns its own
 * color-picker expansion state. Renders nothing when there is no active module.
 */
export function ContextControls({
  selectedElement,
  activeFloatingModule,
  canMoveUp,
  canMoveDown,
  canDuplicate,
  isCropping = false,
  lockState = 'none',
  canLock = false,
  canAlign = false,
  backgroundPickerRequest = 0,
  handlers,
  background,
  onRemoveUserImage,
  onDeleteElement,
  canDelete = false,
  onDeletePage,
  onDeselect,
  hideObjectActions = false,
}: ContextControlsProps) {
  const [isColorPickerExpanded, setIsColorPickerExpanded] = useState(false);
  // Fett/Kursiv/… nur, solange wirklich getippt wird: die Knöpfe bedienen die
  // Auswahl IM Text, und ohne offenen Editor gibt es keine.
  const formatting = useCanvasTextFormatting();

  if (showsCropModeBar({ isCropping, handlers })) {
    return (
      <CropModeControls
        onCancel={() => handlers.handleCancelCrop?.()}
        onDone={() => handlers.handleFinishCrop?.()}
      />
    );
  }

  const showColorFor = (type: FloatingModuleState['type']) => {
    if (type === 'text') {
      return { color: activeFloatingModule?.data.fill || '#000000', variant: 'font' as const };
    }
    // The colour plane takes the template's palette, below.
    if (type === 'background') return null;
    if (type === 'image') {
      return activeFloatingModule?.data.fill !== undefined
        ? { color: activeFloatingModule?.data.fill || '#FFFFFF', variant: 'swatch' as const }
        : null;
    }
    if (type === 'shape' || type === 'pill-badge' || type === 'circle-badge') {
      return { color: activeFloatingModule?.data.fill ?? '#000000', variant: 'swatch' as const };
    }
    // Assets are fixed-color brand graphics (PNG/SVG files) — AssetPrimitive
    // has no color to set, so a swatch there would be a dead control.
    if (type === 'icon' || type === 'illustration') {
      return { color: activeFloatingModule?.data.color ?? '#000000', variant: 'swatch' as const };
    }
    return null;
  };

  const colorConfig = activeFloatingModule ? showColorFor(activeFloatingModule.type) : null;
  const isPlane = activeFloatingModule?.type === 'background';
  const isPhoto = activeFloatingModule?.type === 'image' && !!activeFloatingModule.data.isPhoto;
  // The background is not an object on the page: no opacity, layer order or copy.
  // Frame elements expose no formatting controls (matches prior Toolbar behavior).
  const showOpacity = activeFloatingModule && activeFloatingModule.type !== 'frame' && !isPlane;
  const showObjectActions = !isPlane && !isPhoto;
  const isText = activeFloatingModule?.type === 'text';
  const isLocked = lockState === 'all';

  // Build the present control groups, then interleave separators — this keeps
  // dividers strictly between groups (no dangling leading/trailing divider
  // regardless of which groups are visible).
  const groups: React.ReactNode[] = [];

  if (colorConfig) {
    groups.push(
      <FloatingColorPicker
        key="color"
        currentColor={colorConfig.color}
        onColorSelect={handlers.handleColorSelect}
        isExpanded={isColorPickerExpanded}
        onExpandChange={setIsColorPickerExpanded}
        variant={colorConfig.variant}
        {...(isText ? { colors: FONT_COLORS } : {})}
      />
    );
  }

  // On the photo too: the photo covers the plane, so this is the only way to a colour.
  if ((isPlane || isPhoto) && background?.colors?.length && background.onColorChange) {
    const { onColorChange, onImageChange, colorReplacesImage, paletteOnly } = background;
    const own = background.colors.map((c) => ({ id: c.id, name: c.label, value: c.color }));
    const known = new Set(own.map((c) => c.value.toLowerCase()));
    const palette = paletteOnly
      ? own
      : [...own, ...BRAND_COLORS.filter((c) => !known.has(c.value.toLowerCase()))];
    const pickColor =
      isPhoto && !colorReplacesImage && onImageChange
        ? (color: string) => {
            onImageChange(null, undefined, null);
            onColorChange(color);
            onDeselect?.();
          }
        : isPhoto
          ? (color: string) => {
              onColorChange(color);
              onDeselect?.();
            }
          : onColorChange;
    groups.push(
      <FloatingColorPicker
        key="background-color"
        currentColor={(isPhoto ? '' : background.currentColor) || '#FFFFFF'}
        onColorSelect={pickColor}
        isExpanded={isColorPickerExpanded}
        onExpandChange={setIsColorPickerExpanded}
        colors={palette}
        allowCustom={!paletteOnly}
      />
    );
  }

  if ((isPlane || isPhoto) && background?.onImageChange) {
    const onImageChange = background.onImageChange;
    groups.push(
      <BackgroundImagePicker
        key="background-image"
        label={background.currentImageSrc ? 'Ersetzen' : 'Bild'}
        currentImageSrc={background.currentImageSrc}
        onImageChange={onImageChange}
        openRequest={backgroundPickerRequest}
      />
    );
  }

  if (isPlane && background?.onRestoreImage) {
    groups.push(
      <BackgroundRestoreImageButton key="restore-image" onRestore={background.onRestoreImage} />
    );
  }

  if (isPhoto && background) {
    const photoControls: React.ReactNode[] = [];
    if (background.scale !== undefined && background.onScaleChange) {
      photoControls.push(
        <BackgroundZoomControl
          key="zoom"
          scale={background.scale}
          onScaleChange={background.onScaleChange}
        />
      );
    }
    if (activeFloatingModule?.data.canCrop && handlers.handleCropImage) {
      const handleCropImage = handlers.handleCropImage;
      photoControls.push(
        <button
          key="crop"
          type="button"
          className={CROP_BTN}
          onClick={() => handleCropImage()}
          title="Ausschnitt anpassen (oder Doppelklick aufs Foto)"
          aria-label="Ausschnitt anpassen"
          aria-pressed={isCropping}
        >
          <CropIcon />
          Ausschnitt
        </button>
      );
    }
    if (background.onImageChange) {
      const onImageChange = background.onImageChange;
      photoControls.push(
        <BackgroundRemoveImageButton
          key="remove"
          onRemove={() => {
            onImageChange(null, undefined, null);
            // The photo element is gone; a selection on it would keep these controls up.
            onDeselect?.();
          }}
        />
      );
    }
    if (background.currentImageSrc && handlers.onEditImage) {
      groups.push(<EditImageButton key="edit-image" onClick={handlers.onEditImage} />);
    }
    if (photoControls.length) {
      groups.push(
        <div key="photo" className="flex items-center gap-0.5">
          {photoControls}
        </div>
      );
    }
  }

  const userImageSrc =
    activeFloatingModule?.type === 'user-image' ? activeFloatingModule.data.src : undefined;
  if (
    typeof userImageSrc === 'string' &&
    !userImageSrc.startsWith('blob:') &&
    background?.onImageChange &&
    onRemoveUserImage &&
    activeFloatingModule
  ) {
    const fileName = activeFloatingModule.data.fileName;
    // Captured now: the fetch is async and the selection may move before it lands.
    const imageId = activeFloatingModule.data.id;
    groups.push(
      <SetAsBackgroundButton
        key="as-background"
        src={userImageSrc}
        fileName={typeof fileName === 'string' && fileName ? fileName : 'hintergrund'}
        attribution={activeFloatingModule.data.attribution}
        onImageChange={background.onImageChange}
        onRemoveElement={() => {
          onRemoveUserImage(imageId);
          onDeselect?.();
        }}
      />
    );
  }

  if (isText && activeFloatingModule) {
    groups.push(
      <FloatingFontSizeControl
        key="fontsize"
        fontSize={activeFloatingModule.data.fontSize ?? 16}
        onFontSizeChange={(size) =>
          handlers.handleFontSizeChange(activeFloatingModule.data.id, size)
        }
      />
    );
  }

  // Die Schnitt-Gruppe steht bei der Schrift, nicht bei der Ausrichtung — wie
  // in Canva, wo alles Typografische beieinanderliegt. Der Id-Vergleich hält
  // die Knöpfe vom falschen Element fern, falls Auswahl und Sitzung je
  // auseinanderlaufen.
  if (isText && formatting && formatting.editingId === activeFloatingModule?.data.id) {
    groups.push(
      <formatting.TextFormatControls
        key="format"
        editor={formatting.editor}
        marks={formatting.marks}
        variant="contextBar"
      />
    );
  }

  if (isText && activeFloatingModule && handlers.handleTextAlignChange) {
    const { handleTextAlignChange } = handlers;
    groups.push(
      <FloatingTextAlignControl
        key="text-align"
        align={activeFloatingModule.data.align ?? 'left'}
        onAlignChange={(align) => handleTextAlignChange(activeFloatingModule.data.id, align)}
      />
    );
  }

  const type = activeFloatingModule?.type;
  // Only instance-backed text (additionalTexts) stores effect fields; config
  // template texts route through state keys and don't support these controls.
  const isEffectText = type === 'text' && !!activeFloatingModule?.data.isInstanceText;
  // Stroke-only shapes (lines/arrows) render no fill area, so a gradient fill
  // would be a dead control on them.
  const isFillableShape =
    type === 'shape' && !STROKE_ONLY_SHAPES.has(String(activeFloatingModule?.data.type));

  if ((isFillableShape || isEffectText) && activeFloatingModule && handlers.handleGradientSelect) {
    groups.push(
      <FloatingGradientControl
        key="gradient"
        currentColor={activeFloatingModule.data.fill ?? '#000000'}
        gradient={activeFloatingModule.data.fillGradient ?? null}
        onChange={(gradient) => handlers.handleGradientSelect!(gradient)}
      />
    );
  }

  if (isEffectText && activeFloatingModule && handlers.handleOutlineChange) {
    groups.push(
      <FloatingOutlineControl
        key="outline"
        stroke={activeFloatingModule.data.stroke}
        strokeWidth={activeFloatingModule.data.strokeWidth}
        onChange={(patch) => handlers.handleOutlineChange!(activeFloatingModule.data.id, patch)}
      />
    );
  }

  // Images edit their shadow inside the "Bearbeiten" panel, not the context bar.
  if ((type === 'shape' || isEffectText) && activeFloatingModule && handlers.handleShadowChange) {
    groups.push(
      <FloatingShadowControl
        key="shadow"
        shadowColor={activeFloatingModule.data.shadowColor}
        shadowBlur={activeFloatingModule.data.shadowBlur}
        shadowOffsetX={activeFloatingModule.data.shadowOffsetX}
        shadowOffsetY={activeFloatingModule.data.shadowOffsetY}
        shadowOpacity={activeFloatingModule.data.shadowOpacity}
        onChange={(patch) =>
          handlers.handleShadowChange!(
            activeFloatingModule.data.id,
            patch,
            activeFloatingModule.type
          )
        }
      />
    );
  }

  if (type === 'user-image' && handlers.onEditImage) {
    groups.push(<EditImageButton key="edit-image" onClick={handlers.onEditImage} />);
  }

  if (type === 'user-image' && handlers.handleCropImage) {
    groups.push(
      <button
        key="crop-image"
        disabled={isLocked}
        className={CROP_BTN}
        onClick={() => handlers.handleCropImage!()}
        title="Zuschneiden (oder Doppelklick aufs Bild; Enter zum Beenden)"
        aria-pressed={isCropping}
        type="button"
      >
        <CropIcon />
        {isCropping ? 'Fertig' : 'Zuschneiden'}
      </button>
    );
  }

  const credit =
    type === 'user-image'
      ? activeFloatingModule?.data.attribution
      : isPhoto
        ? background?.imageAttribution
        : undefined;
  if (credit) {
    groups.push(
      <span
        key="credit"
        className="inline-flex items-center gap-1 h-8 shrink-0 px-1 text-[12px] text-[var(--editor-text-muted)] whitespace-nowrap"
      >
        Foto von
        <a
          href={credit.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--editor-text)] underline"
        >
          {credit.photographer}
        </a>
        auf
        <a
          href={UNSPLASH_HOME}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--editor-text)] underline"
        >
          Unsplash
        </a>
      </span>
    );
  }

  if (selectedElement && showObjectActions && canAlign && handlers.runCommand) {
    groups.push(
      <FloatingPositionControl
        // Neu je Element: offene Felder zeigen nie die Lage des vorigen.
        key={`position-${selectedElement}`}
        canDistribute={false}
        onCommand={handlers.runCommand}
        getGeometry={handlers.getGeometry ?? (() => null)}
        onPositionChange={handlers.handlePositionChange}
        onSizeChange={handlers.handleSizeChange}
      />
    );
  }

  if (showOpacity && activeFloatingModule) {
    groups.push(
      <FloatingOpacityControl
        key="opacity"
        opacity={activeFloatingModule.data.opacity ?? 1}
        onOpacityChange={(val) =>
          handlers.handleOpacityChange(activeFloatingModule.data.id, val, activeFloatingModule.type)
        }
      />
    );
  }

  if (selectedElement && showObjectActions) {
    groups.push(
      <FloatingLayerControls
        key="layer"
        onMoveUp={() => handlers.handleMoveLayer('up')}
        onMoveDown={() => handlers.handleMoveLayer('down')}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
      />
    );
  }

  // Direkt bei den Ebenen-Knöpfen: beides betrifft das Element als Ganzes,
  // nicht sein Aussehen. Der Knopf bleibt bei Vorlagen-Elementen und Icons
  // sichtbar, aber deaktiviert — verschwände er, wäre unklar, ob die Aktion
  // fehlt oder nur hier nicht geht.
  if (selectedElement && showObjectActions && !hideObjectActions) {
    groups.push(
      <button
        key="duplicate"
        className={ICON_BTN}
        onClick={handlers.handleDuplicate}
        disabled={!canDuplicate}
        title={
          canDuplicate
            ? 'Duplizieren (Strg+D)'
            : 'Dieses Element gehört zur Vorlage und lässt sich nicht duplizieren'
        }
        aria-label="Duplizieren (Strg+D)"
        type="button"
      >
        <PiCopy size={18} />
      </button>
    );
  }

  if (
    selectedElement &&
    showObjectActions &&
    !hideObjectActions &&
    canLock &&
    handlers.handleToggleLock
  ) {
    const label = isLocked ? 'Entsperren' : 'Sperren';
    groups.push(
      <button
        key="lock"
        className={`${ICON_BTN} aria-pressed:bg-[var(--editor-active-bg)] aria-pressed:text-[var(--editor-active-fg)]`}
        onClick={handlers.handleToggleLock}
        aria-pressed={isLocked}
        title={
          isLocked
            ? 'Entsperren — wieder bewegen und löschen'
            : 'Sperren — Lage und Größe festhalten'
        }
        aria-label={label}
        type="button"
      >
        {isLocked ? <PiLockSimple size={18} /> : <PiLockSimpleOpen size={18} />}
      </button>
    );
  }

  if (selectedElement && showObjectActions && !hideObjectActions && onDeleteElement) {
    const label = `Löschen (${formatShortcut(shortcutOf('delete')!, isMacPlatform())})`;
    groups.push(
      <button
        key="delete-element"
        className={DANGER_BTN}
        onClick={onDeleteElement}
        disabled={!canDelete}
        title={
          canDelete
            ? label
            : isLocked
              ? 'Gesperrt — zum Löschen erst entsperren'
              : 'Dieses Element gehört zur Vorlage und lässt sich nicht löschen'
        }
        aria-label={label}
        type="button"
      >
        <PiTrash size={18} />
      </button>
    );
  }

  if (onDeletePage && !hideObjectActions) {
    groups.push(
      <button
        key="delete"
        className="inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text-secondary)] transition-colors duration-150 hover:text-[var(--editor-danger-fg)] hover:bg-[var(--editor-danger-bg)]"
        onClick={() => {
          if (window.confirm('Seite wirklich löschen?')) {
            onDeletePage();
          }
        }}
        title="Seite löschen"
        aria-label="Seite löschen"
        type="button"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    );
  }

  // Last group: the only visible way out of a selection. Escape is bound in
  // useCanvasKeyboardHandlers but nothing in the UI ever said so, and the
  // artboard is fully covered — clicking "somewhere empty" selects the
  // background instead of deselecting.
  if (onDeselect && selectedElement && !hideObjectActions) {
    groups.push(
      <button
        key="deselect"
        className={ICON_BTN}
        onClick={onDeselect}
        title="Auswahl aufheben (Esc)"
        aria-label="Auswahl aufheben (Esc)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    );
  }

  return (
    <>
      {groups.map((group, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className={SEP} />}
          {group}
        </React.Fragment>
      ))}
    </>
  );
}

/** Opens the "Bearbeiten" panel: filters, presets, flip — for a free image or the background photo. */
function EditImageButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-1.5 h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none bg-transparent px-2 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]"
      onClick={onClick}
      title="Bild anpassen (Filter, Helligkeit, Kontrast…)"
      type="button"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </svg>
      Bearbeiten
    </button>
  );
}

function CropIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}
