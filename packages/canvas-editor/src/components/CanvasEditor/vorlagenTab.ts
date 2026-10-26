import { canvasFormatIdSchema } from '@gruenerator/contracts';
import { PiLayoutFill } from 'react-icons/pi';

import { DEFAULT_FORMAT_ID } from '../../formats';

import type { SidebarTab } from '../../sidebar/types';

/**
 * The „Vorlagen" tab acts on the whole document, not on the active page, so
 * the editor adds it itself instead of every template config listing it.
 */
export const vorlagenTab: SidebarTab = {
  id: 'vorlagen',
  icon: PiLayoutFill,
  label: 'Vorlagen',
  ariaLabel: 'Vorlagen: Grünerator-Vorlagen anwenden',
};

/**
 * Every canvas format has Vorlagen: sharepic specs, print Vorlagen and canvas
 * Vorlagen (finished pages — the profile picture, the sticker sheet). A format
 * without any shows the empty state. An unknown legacy id has none.
 */
export const formatHasVorlagen = (formatId: string | undefined): boolean =>
  canvasFormatIdSchema.safeParse(formatId ?? DEFAULT_FORMAT_ID).success;

/** Right above „Text"; first where a template has none. */
export function withVorlagenTab(tabs: readonly SidebarTab[]): SidebarTab[] {
  const at = Math.max(
    tabs.findIndex((t) => t.id === 'text'),
    0
  );
  return [...tabs.slice(0, at), vorlagenTab, ...tabs.slice(at)];
}
