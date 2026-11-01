// SPDX-License-Identifier: MPL-2.0
import { currentFontRole, fontRoleOptions, type ElementBind, type FontRole } from '@ggraphic/core';
import React from 'react';

import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { useBarTiles } from '@ggraphic/editor/components/TopBar/barTiles';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { primaryFontFamily } from '@ggraphic/editor/utils/fontMarkSupport';
import { requestFontFace } from '@ggraphic/editor/utils/textUtils';

/** Value of the entry that stands for a family no role has. */
const CUSTOM = '';

const stackOf = (family: string) => `"${primaryFontFamily(family)}", sans-serif`;

interface FloatingFontRoleControlProps {
  text: { fontFamily: string; bind?: ElementBind };
  onChange: (role: FontRole) => void;
}

/**
 * The font of a free text, picked by role (Überschrift, Text, …) and never by name: only the
 * fonts of the document's own brand are offered, and a text picked this way stays bound to its
 * role. Each role is shown in its own font. A native select: keyboard and screen reader for free.
 * Hidden when the brand has fewer than two distinct fonts: there is nothing to choose.
 */
export function FloatingFontRoleControl({ text, onChange }: FloatingFontRoleControlProps) {
  const t = useMessages();
  // Als Kachel volle 44 px zum Tippen; das Wort darunter liegt im leeren
  // unteren Rand der Liste und lässt Taps durch (`TileCaption`).
  const tiles = useBarTiles();
  const brand = useDocumentBrand();
  const options = fontRoleOptions(brand.fonts);
  if (options.length < 2) return null;

  const role = currentFontRole(text, options);
  const family = options.find((o) => o.role === role)?.family ?? text.fontFamily;

  return (
    <select
      aria-label={t.topBar.fontRole}
      title={t.topBar.fontRole}
      value={role ?? CUSTOM}
      onChange={(e) => {
        const picked = options.find((o) => o.role === e.target.value);
        if (!picked) return;
        // The face starts loading before the text is switched to it, not on the first draw.
        requestFontFace(picked.family);
        onChange(picked.role);
      }}
      style={{ fontFamily: stackOf(family) }}
      className={`${tiles ? 'h-11 -mb-3' : 'h-8 max-canvas-mobile:h-11'} max-w-36 shrink-0 rounded-md border-none bg-transparent px-1 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]`}
    >
      {role === null && (
        <option value={CUSTOM} disabled>
          {t.topBar.fontRoleCustom(primaryFontFamily(text.fontFamily))}
        </option>
      )}
      {options.map((o) => (
        <option key={o.role} value={o.role} style={{ fontFamily: stackOf(o.family) }}>
          {t.topBar.fontRoles[o.role]}
        </option>
      ))}
    </select>
  );
}
