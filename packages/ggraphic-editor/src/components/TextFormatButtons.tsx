// SPDX-License-Identifier: MPL-2.0
/**
 * TextFormatButtons — Fett, Kursiv, Unterstrichen, Akzent, Textmarker, Aufzählung, Nummerierung.
 *
 * EINE Definition der Knöpfe, ohne dass sie wissen, wen sie bedienen. Sie
 * lesen einen `TextFormatState` und rufen `TextFormatCommands`; wer beides
 * liefert, ist der Wirt:
 *
 * - `TextFormatControls` aus dem tiptap-Editor, solange ein Text bearbeitet wird;
 * - `WholeTextFormatControls` aus dem gespeicherten Text, solange er nur
 *   ausgewählt ist und die Knöpfe für den ganzen Text gelten.
 *
 * Dieses Modul kennt kein tiptap: die Kopfleiste lädt es mit, den Editor
 * (~360 KB) lädt sie erst beim Bearbeiten nach.
 *
 * `variant` wählt nur das Aussehen; welche Knöpfe erscheinen und was sie
 * bedeuten, steht genau einmal hier.
 */
import { type BrandPack } from '@ggraphic/core';
import clsx from 'clsx';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { FiBold, FiItalic, FiList, FiUnderline } from 'react-icons/fi';
import { MdBorderColor, MdFormatListNumbered, MdHighlight } from 'react-icons/md';

import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { useRovingToolbar } from '@ggraphic/editor/hooks/useRovingToolbar';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { KEEP_EDITING_ATTR } from '@ggraphic/editor/utils/keyboardOwnership';

import { brandColors, type ColorOption } from '../utils/colorOptions.js';
import { type FontMarkSupport } from '../utils/fontMarkSupport.js';
import { defaultTextMarker, markerSwatches } from '../utils/markerColors.js';

import { CustomColorSwatch } from './CustomColorSwatch.js';

export type TextFormatVariant = 'floating' | 'contextBar';

/**
 * Was das bearbeitete Feld anbietet: die Schnitte der Schrift und, ob die
 * Vorlage einen eigenen Akzent- bzw. Markerstil hat. Akzent und Textmarker
 * gibt es immer (in jeder Farbe); der Stil der Vorlage ist dann die
 * „Vorlagenfarbe" im Farbwähler.
 */
export interface OfferedMarks extends FontMarkSupport {
  /** Der Text hat einen Akzentstil (`TextAccent`). */
  accent?: boolean;
  /** Der Text hat einen Markerstil (`TextMarker`). */
  marker?: boolean;
}

/** Was der Text, den die Knöpfe bedienen, gerade trägt. */
export interface TextFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  accent: boolean;
  /** Die eigene Farbe des Akzents; `null` = Farbe der Vorlage (oder keine). */
  accentColor: string | null;
  marker: boolean;
  markerColor: string | null;
  bulletList: boolean;
  orderedList: boolean;
}

/** Was ein Klick bewirkt. Farben: `null` = die Farbe der Vorlage. */
export interface TextFormatCommands {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  setAccent: (color: string | null) => void;
  /** Live-Vorschau aus dem Farbfeld; fehlt sie, übernimmt das Farbfeld erst beim Schließen. */
  previewAccent?: (color: string) => void;
  removeAccent: () => void;
  setMarker: (color: string | null) => void;
  previewMarker?: (color: string) => void;
  removeMarker: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
}

export interface TextFormatButtonsProps {
  state: TextFormatState;
  commands: TextFormatCommands;
  /**
   * Welche Schnitt-Auszeichnung die Schrift des Feldes wirklich tragen kann.
   * Unterstreichung und Listen stehen nicht darin: die brauchen keinen
   * Schnitt und gelten überall.
   */
  marks: OfferedMarks;
  variant?: TextFormatVariant;
  /** Die Nummerierung lässt sich für diesen Text nicht setzen. */
  orderedListDisabled?: boolean;
  /** Die Leiste selbst, für den Wirt (Tab aus dem Editor in die Leiste). */
  toolbarRef?: Ref<HTMLDivElement>;
  /** Fokus verlässt das Farbfeld der eigenen Farbe — der Editor-Wirt beendet dann den Text. */
  onColorFieldBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

// Die Kontextleiste übernimmt die Maße ihrer Nachbarn (`ICON_BTN` in
// ContextControls), damit die Gruppe nicht aus der Reihe fällt. Am Handy
// greifen die Knöpfe über `touch-target` auf 44 px, ohne die Reihe zu dehnen.
const BUTTON_CLASS: Record<TextFormatVariant, string> = {
  floating:
    'flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-[var(--editor-text-secondary)] transition-colors hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-text)] [&_svg]:h-4 [&_svg]:w-4',
  contextBar:
    'touch-target inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] [&_svg]:h-4 [&_svg]:w-4',
};

const GROUP_CLASS: Record<TextFormatVariant, string> = {
  floating: 'flex items-center gap-0.5 px-1 py-0.5',
  contextBar: 'flex items-center gap-0.5',
};

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  disabled?: boolean;
  label: string;
  variant: TextFormatVariant;
  children: ReactNode;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled = false,
  label,
  variant,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // preventDefault hält Auswahl und Fokus im Editor, während man klickt —
      // sonst schlösse ein Blur den Editor, bevor der Klick ankommt. In der
      // Kopfleiste wiegt das schwerer als in der schwebenden Karte: sie liegt
      // weit vom Text entfernt, der Weg dorthin führt über die Leinwand.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={clsx(
        BUTTON_CLASS[variant],
        isActive && 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]',
        disabled && 'cursor-not-allowed opacity-30'
      )}
    >
      {children}
    </button>
  );
}

export function TextFormatButtons({
  state,
  commands,
  marks,
  variant = 'floating',
  orderedListDisabled = false,
  toolbarRef,
  onColorFieldBlur,
}: TextFormatButtonsProps) {
  const roving = useRovingToolbar<HTMLDivElement>();
  const m = useMessages().textFormat;
  const brand = useDocumentBrand();
  const { ref: rovingRef, ...rovingHandlers } = roving;
  useImperativeHandle(toolbarRef, () => rovingRef.current as HTMLDivElement, [rovingRef]);

  return (
    // Die ganze Leiste hält den Editor offen: wandert der Fokus per Tab hierher,
    // ist das kein Verlassen des Textes.
    <div
      ref={rovingRef}
      {...rovingHandlers}
      {...{ [KEEP_EDITING_ATTR]: '' }}
      role="toolbar"
      aria-label={m.toolbar}
      className={GROUP_CLASS[variant]}
    >
      {marks.bold && (
        <ToolbarButton
          onClick={commands.toggleBold}
          isActive={state.bold}
          label={m.bold}
          variant={variant}
        >
          <FiBold />
        </ToolbarButton>
      )}
      {marks.italic && (
        <ToolbarButton
          onClick={commands.toggleItalic}
          isActive={state.italic}
          label={m.italic}
          variant={variant}
        >
          <FiItalic />
        </ToolbarButton>
      )}
      <ToolbarButton
        onClick={commands.toggleUnderline}
        isActive={state.underline}
        label={m.underline}
        variant={variant}
      >
        <FiUnderline />
      </ToolbarButton>
      <MarkColorButton
        label={m.accent}
        icon={<MdHighlight />}
        variant={variant}
        isActive={state.accent}
        color={state.accentColor}
        presets={brandColors(brand)}
        hasTemplate={!!marks.accent}
        onPick={commands.setAccent}
        onPreview={commands.previewAccent}
        onRemove={commands.removeAccent}
        onColorFieldBlur={onColorFieldBlur}
      />
      <MarkColorButton
        label={m.marker}
        icon={<MdBorderColor />}
        variant={variant}
        isActive={state.marker}
        color={state.markerColor ?? (marks.marker ? null : defaultTextMarker(brand).fill)}
        presets={markerColorPresets(brand)}
        hasTemplate={!!marks.marker}
        onPick={commands.setMarker}
        onPreview={commands.previewMarker}
        onRemove={commands.removeMarker}
        onColorFieldBlur={onColorFieldBlur}
      />
      <ToolbarButton
        onClick={commands.toggleBulletList}
        isActive={state.bulletList}
        label={m.bulletList}
        variant={variant}
      >
        <FiList />
      </ToolbarButton>
      <ToolbarButton
        onClick={commands.toggleOrderedList}
        isActive={state.orderedList}
        disabled={orderedListDisabled}
        label={m.orderedList}
        variant={variant}
      >
        <MdFormatListNumbered />
      </ToolbarButton>
    </div>
  );
}

type ColorPreset = ColorOption;

/** The marker boxes first, then the brand colours that are not among them. */
const markerColorPresets = (pack: BrandPack): ColorPreset[] => {
  const markers = markerSwatches(pack);
  return [
    ...markers,
    ...brandColors(pack).filter((color) => !markers.some((m) => m.value === color.value)),
  ];
};

const POPOVER_WIDTH = 184;
/** Wie bei den Knöpfen der Leiste: Auswahl und Fokus bleiben im Editor. */
const keepSelection = (e: ReactMouseEvent<HTMLButtonElement>) => e.preventDefault();
/** Höhe des Popovers mit allen Zeilen, gerundet nach oben — für die Wahl oben/unten. */
const POPOVER_MAX_HEIGHT = 200;

const SWATCH_CLASS =
  'size-6 shrink-0 cursor-pointer rounded-full border border-[var(--editor-border-strong)] p-0 transition-transform duration-150 hover:scale-110';
const MENU_ITEM_CLASS =
  'w-full cursor-pointer rounded-sm border-none bg-transparent px-2 py-1 text-left text-xs text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]';

interface MarkColorButtonProps {
  label: string;
  icon: ReactNode;
  variant: TextFormatVariant;
  isActive: boolean;
  /** Die eigene Farbe der Auswahl; `null` = Farbe der Vorlage bzw. keine. */
  color: string | null;
  presets: ColorPreset[];
  /** Die Vorlage hat einen eigenen Stil: „Vorlagenfarbe" anbieten. */
  hasTemplate: boolean;
  onPick: (color: string | null) => void;
  /** Live-Vorschau aus dem Farbfeld, ohne den Fokus zurückzuholen. */
  onPreview: ((color: string) => void) | undefined;
  onRemove: () => void;
  onColorFieldBlur: ((event: FocusEvent<HTMLInputElement>) => void) | undefined;
}

/**
 * Akzent bzw. Textmarker als Knopf mit Farbwähler: Voreinstellungen, eine
 * freie Farbe über das native Farbfeld, die Farbe der Vorlage und Entfernen.
 */
function MarkColorButton({
  label,
  icon,
  variant,
  isActive,
  color,
  presets,
  hasTemplate,
  onPick,
  onPreview,
  onRemove,
  onColorFieldBlur,
}: MarkColorButtonProps) {
  const m = useMessages();
  // Fest positioniert und in den Body portiert: die Kontextleiste scrollt
  // waagerecht (`overflow-x-auto`) und schnitte ein Popover in ihr ab.
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const open = position !== null;
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setPosition(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const toggle = () => {
    if (open || !rootRef.current) {
      setPosition(null);
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    // Unten am Bildschirm (die mobile Auswahl-Leiste) öffnet er nach oben.
    setPosition(
      rect.bottom + POPOVER_MAX_HEIGHT > window.innerHeight
        ? { left, bottom: window.innerHeight - rect.top + 4 }
        : { left, top: rect.bottom + 4 }
    );
  };

  const pick = (next: string | null) => {
    onPick(next);
    setPosition(null);
  };

  return (
    <div ref={rootRef} className="relative">
      <ToolbarButton onClick={toggle} isActive={isActive} label={label} variant={variant}>
        <span className="flex flex-col items-center">
          {icon}
          <span
            className="mt-px h-[3px] w-3.5 rounded-[1px]"
            style={{ backgroundColor: color ?? 'currentColor' }}
          />
        </span>
      </ToolbarButton>
      {position &&
        createPortal(
          <div
            ref={popoverRef}
            {...{ [KEEP_EDITING_ATTR]: '' }}
            role="dialog"
            aria-label={m.textFormat.colorOf(label)}
            style={{ ...position, width: POPOVER_WIDTH }}
            className="fixed z-[10001] flex flex-col gap-2 rounded-md border border-[var(--editor-border)] bg-[var(--editor-surface)] p-2 shadow-lg"
          >
            <div className="grid grid-cols-6 gap-1.5">
              {presets.map((preset) => {
                // Der Text schreibt Farben in Großbuchstaben, die Marke vielleicht nicht.
                const picked = isActive && color?.toLowerCase() === preset.value.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onMouseDown={keepSelection}
                    title={preset.name}
                    aria-label={preset.name}
                    aria-pressed={picked}
                    className={clsx(
                      SWATCH_CLASS,
                      picked && 'outline-2 outline-offset-1 outline-[var(--editor-active-fg)]'
                    )}
                    style={{ backgroundColor: preset.value }}
                    onClick={() => pick(preset.value)}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--editor-text)]">
              <CustomColorSwatch
                value={color}
                presets={presets.map((preset) => preset.value)}
                onPick={pick}
                onPreview={onPreview}
                className="size-6"
                inputProps={{
                  [KEEP_EDITING_ATTR]: '',
                  ...(onColorFieldBlur && { onBlur: onColorFieldBlur }),
                }}
              />
              <span aria-hidden="true">{m.common.ownColor}</span>
            </div>
            {hasTemplate && (
              <button
                type="button"
                onMouseDown={keepSelection}
                className={MENU_ITEM_CLASS}
                onClick={() => pick(null)}
              >
                {m.textFormat.templateColor}
              </button>
            )}
            {isActive && (
              <button
                type="button"
                onMouseDown={keepSelection}
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  onRemove();
                  setPosition(null);
                }}
              >
                {m.textFormat.remove(label)}
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
