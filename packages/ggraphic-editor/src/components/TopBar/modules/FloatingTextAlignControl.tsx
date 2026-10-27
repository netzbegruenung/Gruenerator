// SPDX-License-Identifier: MPL-2.0
import { TEXT_ALIGNS, type TextAlign } from '@ggraphic/editor/utils/textAlign';
import { PiTextAlignCenter, PiTextAlignLeft, PiTextAlignRight } from 'react-icons/pi';

import type { IconType } from 'react-icons';

const ICON_BTN =
  'inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]';

const OPTIONS: Record<TextAlign, { label: string; Icon: IconType }> = {
  left: { label: 'linksbündig', Icon: PiTextAlignLeft },
  center: { label: 'zentriert', Icon: PiTextAlignCenter },
  right: { label: 'rechtsbündig', Icon: PiTextAlignRight },
};

interface FloatingTextAlignControlProps {
  align: TextAlign;
  onAlignChange: (align: TextAlign) => void;
}

/**
 * Richtet den Text in seiner Box aus — ein Knopf, der wie in Canva
 * weiterschaltet: links → zentriert → rechts. „Position“ daneben richtet
 * dagegen die Box auf der Seite aus.
 */
export function FloatingTextAlignControl({ align, onAlignChange }: FloatingTextAlignControlProps) {
  const next = TEXT_ALIGNS[(TEXT_ALIGNS.indexOf(align) + 1) % TEXT_ALIGNS.length]!;
  const { label, Icon } = OPTIONS[align];

  return (
    <button
      type="button"
      className={ICON_BTN}
      onClick={() => onAlignChange(next)}
      title={`Textausrichtung: ${label}`}
      aria-label={`Textausrichtung: ${label}`}
    >
      <Icon size={18} />
    </button>
  );
}
