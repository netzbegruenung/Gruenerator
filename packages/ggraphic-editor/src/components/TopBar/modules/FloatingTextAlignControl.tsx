// SPDX-License-Identifier: MPL-2.0
import { PiTextAlignCenter, PiTextAlignLeft, PiTextAlignRight } from 'react-icons/pi';

import { TILE, TileCaption, useBarTiles } from '@ggraphic/editor/components/TopBar/barTiles';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { TEXT_ALIGNS, type TextAlign } from '@ggraphic/editor/utils/textAlign';

import type { IconType } from 'react-icons';

const ICON_BTN =
  'inline-flex items-center justify-center size-8 max-canvas-mobile:size-11 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)]';

const ICONS: Record<TextAlign, IconType> = {
  left: PiTextAlignLeft,
  center: PiTextAlignCenter,
  right: PiTextAlignRight,
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
  const t = useMessages();
  const tiles = useBarTiles();
  const label = t.topBar.textAlign[align];
  const Icon = ICONS[align];
  // Als Kachel steht „Ausrichtung“ darunter; der Name beginnt mit dem Wort.
  const name = tiles ? `${t.topBar.tiles.textAlign}: ${label}` : t.topBar.textAlignLabel(label);

  return (
    <button
      type="button"
      className={tiles ? TILE : ICON_BTN}
      onClick={() => onAlignChange(next)}
      title={name}
      aria-label={name}
    >
      <Icon size={18} aria-hidden />
      <TileCaption>{t.topBar.tiles.textAlign}</TileCaption>
    </button>
  );
}
