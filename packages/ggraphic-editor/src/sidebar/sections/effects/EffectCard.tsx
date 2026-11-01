// SPDX-License-Identifier: MPL-2.0
import React, { useId } from 'react';

import { useMessages } from '@ggraphic/editor/i18n/messages';
import {
  CONTROL_GROUP,
  CONTROL_GROUP_HEADER,
  CONTROL_GROUP_LABEL,
} from '@ggraphic/editor/sidebar/sidebarStyles';

/**
 * Ein Effekt im Bereich „Effekte“: Überschrift, Ein/Aus und — eingeschaltet —
 * seine Regler. Die Gruppe trägt die Überschrift als Namen.
 */
export function EffectCard({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useMessages();
  const titleId = useId();
  return (
    <section className={CONTROL_GROUP} aria-labelledby={titleId}>
      <div className={`${CONTROL_GROUP_HEADER} justify-between`}>
        <h3 id={titleId} className={`${CONTROL_GROUP_LABEL} m-0`}>
          {title}
        </h3>
        <button
          className="text-[11px] font-medium text-[var(--editor-accent)] hover:underline"
          onClick={onToggle}
          aria-label={`${title}: ${enabled ? t.sidebar.imageAdjust.remove : t.sidebar.imageAdjust.enable}`}
          type="button"
        >
          {enabled ? t.sidebar.imageAdjust.remove : t.sidebar.imageAdjust.enable}
        </button>
      </div>
      {enabled && <div className="flex flex-col gap-2.5 pt-1">{children}</div>}
    </section>
  );
}
