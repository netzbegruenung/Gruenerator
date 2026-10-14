/**
 * TextFormatControls — Fett, Kursiv, Unterstrichen, Akzent, Textmarker, Aufzählung, Nummerierung.
 *
 * EINE Definition, zwei Wirte: die schwebende Karte über dem Text (dort, wo es
 * keine Kopfleiste gibt — `StandaloneCanvas`) und die Kontextleiste der
 * Kopfleiste, wo die Knöpfe neben Farbe, Schriftgröße und Ausrichtung stehen.
 * `variant` wählt nur das Aussehen; welche Knöpfe erscheinen und was sie tun,
 * steht genau einmal hier.
 */
import { useEditorState, type Editor } from '@tiptap/react';
import clsx from 'clsx';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FiBold, FiItalic, FiList, FiUnderline } from 'react-icons/fi';
import { MdBorderColor, MdFormatListNumbered, MdHighlight } from 'react-icons/md';

import { type FontMarkSupport } from '../utils/fontMarkSupport';
import { DEFAULT_TEXT_MARKER, MARKER_PRESETS } from '../utils/markerColors';
import { BRAND_COLORS } from '../utils/shapes';

import { CustomColorSwatch } from './CustomColorSwatch';

/**
 * Bedienelemente, die selbst Fokus brauchen (das native Farbfeld), tragen
 * dieses Attribut: wandert der Fokus dorthin, bleibt der Editor offen
 * (`RichTextField` fragt `keepsEditing`).
 */
const KEEP_EDITING_ATTR = 'data-rte-keep-editing';

export const keepsEditing = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`[${KEEP_EDITING_ATTR}]`) !== null;

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

export interface TextFormatControlsProps {
  editor: Editor;
  /**
   * Welche Schnitt-Auszeichnung die Schrift des Feldes wirklich tragen kann.
   * Unterstreichung und Listen stehen nicht darin: die brauchen keinen
   * Schnitt und gelten überall.
   */
  marks: OfferedMarks;
  variant?: TextFormatVariant;
}

// Die Kontextleiste übernimmt die Maße ihrer Nachbarn (`ICON_BTN` in
// ContextControls), damit die Gruppe nicht aus der Reihe fällt.
const BUTTON_CLASS: Record<TextFormatVariant, string> = {
  floating:
    'flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-[var(--editor-text-secondary)] transition-colors hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-text)] [&_svg]:h-4 [&_svg]:w-4',
  contextBar:
    'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] [&_svg]:h-4 [&_svg]:w-4',
};

const GROUP_CLASS: Record<TextFormatVariant, string> = {
  floating: 'flex items-center gap-0.5 px-1 py-0.5',
  contextBar: 'flex items-center gap-0.5',
};

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  label: string;
  variant: TextFormatVariant;
  children: ReactNode;
}

function ToolbarButton({ onClick, isActive, label, variant, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // preventDefault hält Auswahl und Fokus im Editor, während man klickt —
      // sonst schlösse ein Blur den Editor, bevor der Klick ankommt. In der
      // Kopfleiste wiegt das schwerer als in der schwebenden Karte: sie liegt
      // weit vom Text entfernt, der Weg dorthin führt über die Leinwand.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={clsx(
        BUTTON_CLASS[variant],
        isActive && 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]'
      )}
    >
      {children}
    </button>
  );
}

export function TextFormatControls({
  editor,
  marks,
  variant = 'floating',
}: TextFormatControlsProps) {
  // Der Wirt muss nichts von tiptap wissen: die Knöpfe hören selbst auf den
  // Editor. Deshalb reist kein Zustand je Tastendruck durch den Baum nach oben.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      accent: e.isActive('accent'),
      accentColor: (e.getAttributes('accent')['color'] as string | null | undefined) ?? null,
      marker: e.isActive('marker'),
      markerColor: (e.getAttributes('marker')['color'] as string | null | undefined) ?? null,
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
    }),
  });

  return (
    <div role="toolbar" aria-label="Textformatierung" className={GROUP_CLASS[variant]}>
      {marks.bold && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={state.bold}
          label="Fett (⌘B)"
          variant={variant}
        >
          <FiBold />
        </ToolbarButton>
      )}
      {marks.italic && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={state.italic}
          label="Kursiv (⌘I)"
          variant={variant}
        >
          <FiItalic />
        </ToolbarButton>
      )}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={state.underline}
        label="Unterstrichen (⌘U)"
        variant={variant}
      >
        <FiUnderline />
      </ToolbarButton>
      <MarkColorButton
        label="Akzent"
        icon={<MdHighlight />}
        variant={variant}
        isActive={state.accent}
        color={state.accentColor}
        presets={ACCENT_PRESETS}
        hasTemplate={!!marks.accent}
        onPick={(color) => editor.chain().focus().setAccent(color).run()}
        onPreview={(color) => editor.chain().setAccent(color).run()}
        onRemove={() => editor.chain().focus().unsetAccent().run()}
        editor={editor}
      />
      <MarkColorButton
        label="Textmarker"
        icon={<MdBorderColor />}
        variant={variant}
        isActive={state.marker}
        color={state.markerColor ?? (marks.marker ? null : DEFAULT_TEXT_MARKER.fill)}
        presets={MARKER_COLOR_PRESETS}
        hasTemplate={!!marks.marker}
        onPick={(color) => editor.chain().focus().setMarker(color).run()}
        onPreview={(color) => editor.chain().setMarker(color).run()}
        onRemove={() => editor.chain().focus().unsetMarker().run()}
        editor={editor}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={state.bulletList}
        label="Aufzählung"
        variant={variant}
      >
        <FiList />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={state.orderedList}
        label="Nummerierte Liste"
        variant={variant}
      >
        <MdFormatListNumbered />
      </ToolbarButton>
    </div>
  );
}

interface ColorPreset {
  id: string;
  name: string;
  value: string;
}

const ACCENT_PRESETS: ColorPreset[] = BRAND_COLORS;
const MARKER_COLOR_PRESETS: ColorPreset[] = [
  ...MARKER_PRESETS,
  ...BRAND_COLORS.filter((brand) => !MARKER_PRESETS.some((m) => m.value === brand.value)),
];

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
  onPreview: (color: string) => void;
  onRemove: () => void;
  editor: Editor;
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
  editor,
}: MarkColorButtonProps) {
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
            role="dialog"
            aria-label={`${label}: Farbe`}
            style={{ ...position, width: POPOVER_WIDTH }}
            className="fixed z-[10001] flex flex-col gap-2 rounded-md border border-[var(--editor-border)] bg-[var(--editor-surface)] p-2 shadow-lg"
          >
            <div className="grid grid-cols-6 gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onMouseDown={keepSelection}
                  title={preset.name}
                  aria-label={preset.name}
                  aria-pressed={isActive && color === preset.value}
                  className={clsx(
                    SWATCH_CLASS,
                    isActive &&
                      color === preset.value &&
                      'outline-2 outline-offset-1 outline-[var(--editor-active-fg)]'
                  )}
                  style={{ backgroundColor: preset.value }}
                  onClick={() => pick(preset.value)}
                />
              ))}
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
                  // Zurück in den Text — oder, wer woanders hinklickt, beendet ihn.
                  onBlur: (e) => {
                    if (
                      keepsEditing(e.relatedTarget) ||
                      editor.view.dom.contains(e.relatedTarget as Node)
                    ) {
                      return;
                    }
                    editor.chain().focus().blur().run();
                  },
                }}
              />
              <span aria-hidden="true">Eigene Farbe</span>
            </div>
            {hasTemplate && (
              <button
                type="button"
                onMouseDown={keepSelection}
                className={MENU_ITEM_CLASS}
                onClick={() => pick(null)}
              >
                Vorlagenfarbe
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
                {label} entfernen
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
