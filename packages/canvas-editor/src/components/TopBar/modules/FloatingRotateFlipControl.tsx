import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { Slider } from 'radix-ui';
import React, { useEffect, useId, useRef, useState } from 'react';
import {
  PiArrowClockwise,
  PiArrowCounterClockwise,
  PiFlipHorizontal,
  PiFlipVertical,
} from 'react-icons/pi';

import {
  CANVAS_COMMANDS,
  ariaShortcut,
  formatShortcut,
  isMacPlatform,
  shortcutOf,
} from '../../../utils/canvasCommandRegistry';
import { normalizeRotation } from '../../../utils/orientation';

interface FloatingRotateFlipControlProps {
  /** Die Drehung der Einzelauswahl in Grad, (−180, 180]. */
  rotation: number;
  /** Das Element spiegelt (Text, Diagramme und Vorlagen-Marken nicht). */
  canFlip: boolean;
  /** Schreibt die Drehung — ein Zustand, ein Verlaufsschritt. */
  onRotationCommit: (deg: number) => void;
  /** Nur die Anzeige, während der Regler gezogen wird. */
  onRotationPreview: (deg: number) => void;
  /**
   * Ein Zug endet ohne Abschluss: die Seite schreibt die Vorschau dem Element
   * zu, das sie zeigt (nicht der Auswahl von jetzt — die kann eine andere sein).
   */
  onPreviewAbandon: () => void;
  onFlip: (axis: 'x' | 'y') => void;
}

const TRIGGER_BTN =
  'inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]';

const ROW_BTN =
  'inline-flex flex-1 items-center justify-center gap-1.5 h-8 max-canvas-mobile:h-11 rounded-md border border-[var(--editor-border-soft)] bg-transparent px-2 cursor-pointer text-[12px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]';

const clamp = (deg: number) => Math.min(180, Math.max(-180, deg));

/** „Horizontal spiegeln (⇧H)“ — Name und Kürzel aus dem Befehlsregister. */
function flipLabel(id: 'flipHorizontal' | 'flipVertical') {
  const shortcut = shortcutOf(id)!;
  const mac = isMacPlatform();
  return {
    label: `${CANVAS_COMMANDS[id].label} (${formatShortcut(shortcut, mac)})`,
    aria: ariaShortcut(shortcut, mac),
  };
}

/**
 * Drehen & Spiegeln der Einzelauswahl. Der Regler zeigt beim Ziehen nur eine
 * Vorschau am Knoten und schreibt einmal am Ende (`onValueCommit`) — ein Zug,
 * ein Verlaufsschritt. Endet ein Zug ohne Abschluss (Popover zu, Leiste weg),
 * schreibt die Seite die letzte Vorschau dem Element zu, das sie zeigt
 * (`commitRotationPreview`): sonst stünde der Knoten gedreht da, während der
 * Zustand etwas anderes sagt.
 */
export function FloatingRotateFlipControl({
  rotation,
  canFlip,
  onRotationCommit,
  onRotationPreview,
  onPreviewAbandon,
  onFlip,
}: FloatingRotateFlipControlProps) {
  const inputId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rotation);
  const [shownRotation, setShownRotation] = useState(rotation);
  // Getippter Text; null = das Feld zeigt den Reglerwert.
  const [text, setText] = useState<string | null>(null);
  const textRef = useRef<string | null>(null);
  // Eine Vorschau läuft, und noch kein Abschluss ist gefolgt.
  const previewPending = useRef(false);
  const abandonRef = useRef(onPreviewAbandon);
  useEffect(() => {
    abandonRef.current = onPreviewAbandon;
  });

  if (shownRotation !== rotation) {
    setShownRotation(rotation);
    setDraft(rotation);
  }

  const setTyped = (value: string | null) => {
    textRef.current = value;
    setText(value);
  };

  const commit = (deg: number) => {
    previewPending.current = false;
    onRotationCommit(deg);
  };

  const flushPreview = () => {
    if (!previewPending.current) return;
    previewPending.current = false;
    abandonRef.current();
  };

  // Leiste weg (Auswahl gewechselt, Element entfernt) mitten im Zug.
  useEffect(
    () => () => {
      if (!previewPending.current) return;
      previewPending.current = false;
      abandonRef.current();
    },
    []
  );

  const commitTyped = () => {
    const typed = textRef.current;
    if (typed === null) return;
    setTyped(null);
    const parsed = Number(typed.replace(',', '.'));
    if (typed.trim() === '' || !Number.isFinite(parsed)) return;
    const deg = clamp(Math.round(parsed));
    setDraft(deg);
    if (deg !== rotation) commit(deg);
  };

  const step = (delta: number) => {
    const deg = normalizeRotation(rotation + delta);
    setDraft(deg);
    commit(deg);
  };

  const horizontal = flipLabel('flipHorizontal');
  const vertical = flipLabel('flipVertical');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) flushPreview();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={TRIGGER_BTN}
          title="Drehen & Spiegeln"
          aria-label="Drehen & Spiegeln"
          type="button"
        >
          <PiArrowClockwise size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[10001] w-64 flex flex-col gap-2.5 p-3"
        align="center"
        aria-labelledby={titleId}
        onEscapeKeyDown={(e) => {
          // Escape im Feld verwirft nur den getippten Wert; das Popover bleibt offen.
          if (textRef.current === null) return;
          e.preventDefault();
          setTyped(null);
        }}
      >
        <span id={titleId} className="text-xs font-medium text-[var(--editor-text)]">
          Drehen & Spiegeln
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor={inputId} className="text-[11px] text-[var(--editor-text-muted)]">
            Drehung
          </label>
          <Slider.Root
            className="relative flex items-center select-none touch-none grow h-4 max-canvas-mobile:h-11"
            value={[draft]}
            min={-180}
            max={180}
            step={1}
            onValueChange={([v]) => {
              setDraft(v);
              setTyped(null);
              previewPending.current = true;
              onRotationPreview(v);
            }}
            onValueCommit={([v]) => commit(v)}
          >
            <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
              <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
            </Slider.Track>
            <Slider.Thumb
              className="block size-3 max-canvas-mobile:size-5 bg-editor-surface rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
              aria-label="Drehung"
            />
          </Slider.Root>
          <div className="flex items-center gap-0.5">
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={-180}
              max={180}
              step={1}
              value={text ?? String(Math.round(draft))}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTyped();
                } else if (e.key === 'Escape') {
                  setTyped(null);
                }
              }}
              onBlur={commitTyped}
              className="w-12 h-6 max-canvas-mobile:h-11 max-canvas-mobile:text-base rounded border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-1 text-right text-[11px] tabular-nums text-[var(--editor-text)]"
            />
            <span aria-hidden="true" className="text-[11px] text-[var(--editor-text-muted)]">
              °
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={ROW_BTN} onClick={() => step(-90)}>
            <PiArrowCounterClockwise size={15} aria-hidden="true" />
            90° nach links
          </button>
          <button type="button" className={ROW_BTN} onClick={() => step(90)}>
            <PiArrowClockwise size={15} aria-hidden="true" />
            90° nach rechts
          </button>
        </div>
        {canFlip && (
          <div className="flex gap-1.5">
            <button
              type="button"
              className={ROW_BTN}
              onClick={() => onFlip('x')}
              title={horizontal.label}
              aria-label={horizontal.label}
              aria-keyshortcuts={horizontal.aria}
            >
              <PiFlipHorizontal size={15} aria-hidden="true" />
              {CANVAS_COMMANDS.flipHorizontal.label}
            </button>
            <button
              type="button"
              className={ROW_BTN}
              onClick={() => onFlip('y')}
              title={vertical.label}
              aria-label={vertical.label}
              aria-keyshortcuts={vertical.aria}
            >
              <PiFlipVertical size={15} aria-hidden="true" />
              {CANVAS_COMMANDS.flipVertical.label}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
