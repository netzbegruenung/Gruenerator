import {
  GROUP_COLOR_STYLES,
  resolveGroupColor,
  type GroupColorTone,
} from '@gruenerator/shared/groups';

/** The tile tone of a project colour in the current scheme; null = no colour chosen. */
export function groupColorTone(
  color: string | null | undefined,
  dark: boolean
): GroupColorTone | null {
  const key = resolveGroupColor(color);
  if (!key) return null;
  return dark ? GROUP_COLOR_STYLES[key].dark : GROUP_COLOR_STYLES[key].light;
}
