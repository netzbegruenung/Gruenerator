// SPDX-License-Identifier: MPL-2.0
import React, { useState } from 'react';
import { PiCopy, PiLockSimple, PiLockSimpleOpen } from 'react-icons/pi';

import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useCanvasTextFormatting } from '@ggraphic/editor/components/CanvasTextOverlay';
import { CropModeControls } from '@ggraphic/editor/components/TopBar/CropModeControls';
import {
  BackgroundImagePicker,
  BackgroundRemoveImageButton,
  BackgroundRestoreImageButton,
  BackgroundZoomControl,
  SetAsBackgroundButton,
} from '@ggraphic/editor/components/TopBar/modules/FloatingBackgroundControls';
import { FloatingColorPicker } from '@ggraphic/editor/components/TopBar/modules/FloatingColorPicker';
import { FloatingFontSizeControl } from '@ggraphic/editor/components/TopBar/modules/FloatingFontSizeControl';
import { FloatingOpacityControl } from '@ggraphic/editor/components/TopBar/modules/FloatingOpacityControl';
import {
  FloatingPositionControl,
  type PositionCommandId,
} from '@ggraphic/editor/components/TopBar/modules/FloatingPositionControl';
import { FloatingTextAlignControl } from '@ggraphic/editor/components/TopBar/modules/FloatingTextAlignControl';
import { type BackgroundControls } from '@ggraphic/editor/configs/types';
import { type FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { hasEffects } from '@ggraphic/editor/sidebar/sections/effects/effectsFor';
import { useOptionalUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';
import { type SelectionGeometry } from '@ggraphic/editor/utils/canvasCommands';
import { brandColors, fontColors } from '@ggraphic/editor/utils/colorOptions';
import { type CropAspectId } from '@ggraphic/editor/utils/cropAspect';
import { focusPage, isKeyboardModality } from '@ggraphic/editor/utils/editorFocus';
import { type LockState } from '@ggraphic/editor/utils/layerLock';
import { type TextAlign } from '@ggraphic/editor/utils/textAlign';
import { useUnsplashHome } from '@ggraphic/editor/utils/unsplashLinks';

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
  /** Seitenverhältnis-Vorgabe im Zuschneide-Modus (nur eigene Bilder). */
  cropAspect?: CropAspectId;
  /** Begradigungs-Winkel des Fotos im Zuschneide-Modus (Grad). */
  cropRotation?: number;
  /** Läuft ein „Erweitern" (KI): der Knopf wartet. */
  isExpanding?: boolean;
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
    handleBlurChange?: (id: string, blur: number) => void;
    /** Ausschnitt mode for a framed photo: the photo moves inside its frame. */
    handleCropImage?: () => void;
    /** Im Zuschneide-Modus: zurück zum Stand beim Betreten bzw. übernehmen. */
    handleCancelCrop?: () => void;
    handleFinishCrop?: () => void;
    handleCropAspect?: (id: CropAspectId) => void;
    handleCropRotation?: (deg: number) => void;
    handleSmartCrop?: () => void;
    handleExpandImage?: () => void;
    /** Ausrichtung des Textes in seiner Box — freie und Vorlagen-Texte. */
    handleTextAlignChange?: (id: string, align: TextAlign) => void;
    handleToggleLock?: () => void;
    /** Opens the image-adjust (t.topBar.edit) panel for the selected image. */
    onEditImage?: () => void;
    /** Opens the „Effekte“ area: gradient, outline and shadow of the selection. */
    onOpenEffects?: () => void;
  };
  /** The page's background controls (colour plane and photo), if the template has them. */
  background?: BackgroundControls | null;
  /** Removes one own image by id — not "the selection", which can change meanwhile. */
  onRemoveUserImage?: (id: string) => void;
  /** Mobil, im „Auswahl“-Block des Sheets: die Seite löschen. */
  onDeletePage?: () => void;
  /** Clears the element selection. Escape does the same, but is invisible. */
  onDeselect?: () => void;
  /** Duplizieren, Sperren und Abwählen liegen in der Pille (`SelectionPill`), nicht hier. */
  hideObjectActions?: boolean;
  /** Anordnung der Zuschneide-Leiste; mobil mit eigener Begradigen-Zeile und festen Ausgängen. */
  cropLayout?: 'inline' | 'mobile';
}

/**
 * Ist die Auswahl ein Objekt auf der Seite? Fläche und Hintergrundfoto sind es
 * nicht: kein Duplizieren, keine Ebene, keine Pille.
 */
export function hasObjectActions(module: FloatingModuleState | null): boolean {
  if (module?.type === 'background') return false;
  return !(module?.type === 'image' && !!module.data.isPhoto);
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

const CROP_BTN =
  'inline-flex items-center gap-1.5 h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none bg-transparent px-2 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] aria-pressed:bg-[var(--editor-active-bg)] aria-pressed:text-[var(--editor-active-fg)]';

const TEXT_BTN =
  'inline-flex items-center h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none bg-transparent px-2 cursor-pointer whitespace-nowrap text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]';

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
  cropAspect = 'free',
  cropRotation = 0,
  isExpanding = false,
  lockState = 'none',
  canLock = false,
  canAlign = false,
  backgroundPickerRequest = 0,
  handlers,
  background,
  onRemoveUserImage,
  onDeletePage,
  onDeselect,
  hideObjectActions = false,
  cropLayout = 'inline',
}: ContextControlsProps) {
  const t = useMessages();
  const unsplashHome = useUnsplashHome();
  const [isColorPickerExpanded, setIsColorPickerExpanded] = useState(false);
  // Fett/Kursiv/… nur, solange wirklich getippt wird: die Knöpfe bedienen die
  // Auswahl IM Text, und ohne offenen Editor gibt es keine.
  const formatting = useCanvasTextFormatting();
  // Ohne Dienst des Hosts oder ohne Uploads (das Ergebnis wird hochgeladen) kein „Erweitern".
  const uploads = useOptionalUserUploads();
  const canExpand = !!useCanvasEditorServices().expandImage && !!uploads;

  if (showsCropModeBar({ isCropping, handlers })) {
    const handleCropAspect = handlers.handleCropAspect;
    const handleCropRotation = handlers.handleCropRotation;
    return (
      <CropModeControls
        layout={cropLayout}
        onCancel={() => handlers.handleCancelCrop?.()}
        onDone={() => handlers.handleFinishCrop?.()}
        aspect={
          activeFloatingModule?.type === 'user-image' && handleCropAspect
            ? { value: cropAspect, onChange: handleCropAspect }
            : null
        }
        straighten={
          handleCropRotation ? { value: cropRotation, onChange: handleCropRotation } : null
        }
        onAuto={handlers.handleSmartCrop ?? null}
        expand={
          canExpand && handlers.handleExpandImage
            ? { onExpand: handlers.handleExpandImage, busy: isExpanding }
            : null
        }
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
  const showObjectActions = hasObjectActions(activeFloatingModule);
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
        {...(isText ? { colors: fontColors() } : {})}
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
      : [...own, ...brandColors().filter((c) => !known.has(c.value.toLowerCase()))];
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
        label={background.currentImageSrc ? t.topBar.replace : t.common.image}
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
          onClick={(e) => {
            handleCropImage();
            // Wie beim Zuschneiden eigener Bilder: per Tastatur gehören die Pfeile danach der Seite.
            if (!isCropping && isKeyboardModality()) focusPage(e.currentTarget);
          }}
          title={t.topBar.adjustCropPhoto}
          aria-label={t.topBar.adjustCrop}
          aria-pressed={isCropping}
        >
          <CropIcon />
          {t.topBar.crop}
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

  // Verlauf, Kontur und Schatten liegen im Bereich „Effekte“, wie bei Canva —
  // als drei Popover nebeneinander waren sie drei kaum unterscheidbare Icons.
  if (handlers.onOpenEffects && hasEffects(activeFloatingModule)) {
    groups.push(
      <button key="effects" type="button" className={TEXT_BTN} onClick={handlers.onOpenEffects}>
        {t.topBar.effects}
      </button>
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
        onClick={(e) => {
          handlers.handleCropImage!();
          // Per Tastatur begonnen: der Fokus geht auf die Seite, damit die
          // Pfeile den Ausschnitt schieben — in der mobilen Werkzeugleiste
          // gehören sie sonst dem Wechsel zwischen den Knöpfen. Enter auf der
          // Seite beendet den Ausschnitt (useCanvasKeyboardHandlers).
          if (!isCropping && isKeyboardModality()) focusPage(e.currentTarget);
        }}
        title={t.topBar.cropImage}
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
          href={unsplashHome}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--editor-text)] underline"
        >
          Unsplash
        </a>
      </span>
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

  // Ausrichten, Lage und Ebene unter einem Knopf, wie bei Canva. Gesperrt
  // bleibt nur die Ebene: verschieben geht dann nicht, umschichten schon.
  if (selectedElement && showObjectActions) {
    const runCommand = canAlign ? handlers.runCommand : undefined;
    groups.push(
      <FloatingPositionControl
        // Neu je Element: offene Felder zeigen nie die Lage des vorigen.
        key={`position-${selectedElement}`}
        canAlign={!!runCommand}
        canDistribute={false}
        onCommand={runCommand ?? (() => {})}
        getGeometry={handlers.getGeometry ?? (() => null)}
        onPositionChange={handlers.handlePositionChange}
        onSizeChange={handlers.handleSizeChange}
        layer={{ canMoveUp, canMoveDown, onMove: handlers.handleMoveLayer }}
      />
    );
  }

  // Direkt nach „Position“: beides betrifft das Element als Ganzes,
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
        title={canDuplicate ? t.topBar.duplicate : t.topBar.templateNoDuplicate}
        aria-label={t.topBar.duplicate}
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
        title={isLocked ? t.topBar.unlockHint : t.topBar.lockHint}
        aria-label={label}
        type="button"
      >
        {isLocked ? <PiLockSimple size={18} /> : <PiLockSimpleOpen size={18} />}
      </button>
    );
  }

  if (onDeletePage && !hideObjectActions) {
    groups.push(
      <button
        key="delete"
        className="inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text-secondary)] transition-colors duration-150 hover:text-[var(--editor-danger-fg)] hover:bg-[var(--editor-danger-bg)]"
        onClick={() => {
          if (window.confirm(t.topBar.confirmDeletePage)) {
            onDeletePage();
          }
        }}
        title={t.topBar.deletePage}
        aria-label={t.topBar.deletePage}
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
        title={t.topBar.clearSelection}
        aria-label={t.topBar.clearSelection}
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

/** Opens the t.topBar.edit panel: filters, presets, flip — for a free image or the background photo. */
function EditImageButton({ onClick }: { onClick: () => void }) {
  const t = useMessages();
  return (
    <button
      className="inline-flex items-center gap-1.5 h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none bg-transparent px-2 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]"
      onClick={onClick}
      title={t.topBar.adjustImage}
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
      {t.topBar.edit}
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
