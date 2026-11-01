// SPDX-License-Identifier: MPL-2.0
import React from 'react';

import { effectsFor } from '@ggraphic/editor/sidebar/sections/effects/effectsFor';
import { GradientSettings } from '@ggraphic/editor/sidebar/sections/effects/GradientSettings';
import { OutlineSettings } from '@ggraphic/editor/sidebar/sections/effects/OutlineSettings';
import { ShadowSettings } from '@ggraphic/editor/sidebar/sections/effects/ShadowSettings';
import { SIDEBAR_SECTION } from '@ggraphic/editor/sidebar/sidebarStyles';

import type { ShadowPatch } from '@ggraphic/editor/hooks/useFloatingModuleHandlers';
import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';
import type { GradientFill } from '@ggraphic/editor/utils/gradientFill';

export interface EffectsSectionProps {
  module: FloatingModuleState | null;
  onGradientChange?: (gradient: GradientFill | null) => void;
  onOutlineChange?: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  onShadowChange?: (id: string, patch: ShadowPatch, type: string) => void;
}

/**
 * „Effekte“: Farbverlauf, Kontur und Schatten der Auswahl, geöffnet über den
 * gleichnamigen Knopf der Kontextleiste. Wie die Ebenen hängt der Editor den
 * Bereich selbst an — er liest die Auswahl aus dem Bericht der Seite, nicht
 * aus `state`/`actions` einer Config-Section.
 */
export function EffectsSection({
  module,
  onGradientChange,
  onOutlineChange,
  onShadowChange,
}: EffectsSectionProps) {
  const available = effectsFor(module);
  const gradient = available.gradient && onGradientChange;
  const outline = available.outline && onOutlineChange;
  const shadow = available.shadow && onShadowChange;

  // Ohne Effekte schließt der Editor den Bereich (`CanvasEditorShell`).
  if (!module || (!gradient && !outline && !shadow)) return null;
  const { data } = module;

  return (
    <div className={SIDEBAR_SECTION}>
      {gradient && (
        <GradientSettings
          currentColor={data.fill ?? '#000000'}
          gradient={data.fillGradient ?? null}
          onChange={onGradientChange}
        />
      )}
      {outline && (
        <OutlineSettings
          stroke={data.stroke}
          strokeWidth={data.strokeWidth}
          onChange={(patch) => onOutlineChange(data.id, patch)}
        />
      )}
      {shadow && (
        <ShadowSettings
          shadowColor={data.shadowColor}
          shadowBlur={data.shadowBlur}
          shadowOffsetX={data.shadowOffsetX}
          shadowOffsetY={data.shadowOffsetY}
          shadowOpacity={data.shadowOpacity}
          onChange={(patch) => onShadowChange(data.id, patch, module.type)}
        />
      )}
    </div>
  );
}
