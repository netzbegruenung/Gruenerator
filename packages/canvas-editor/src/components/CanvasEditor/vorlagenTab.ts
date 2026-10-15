import { sharepicFormatSchema } from '@gruenerator/contracts';
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
  ariaLabel: 'Grünerator-Vorlagen anwenden',
};

/** The catalogue has Vorlagen for the sharepic formats only, none for the profile picture. */
export const formatHasVorlagen = (formatId: string | undefined): boolean =>
  sharepicFormatSchema.safeParse(formatId ?? DEFAULT_FORMAT_ID).success;

/** Right above „Text"; first where a template has none. */
export function withVorlagenTab(tabs: readonly SidebarTab[]): SidebarTab[] {
  const at = Math.max(
    tabs.findIndex((t) => t.id === 'text'),
    0
  );
  return [...tabs.slice(0, at), vorlagenTab, ...tabs.slice(at)];
}
