import { useColorScheme } from 'react-native';

import { getToolTheme } from '../../theme/toolTheme';

/**
 * Projekte's accent, as on web: the tool's blue on mostly white — `soft` for
 * fills (initials, badges, pinned), `accent` for icons, labels and buttons.
 */
export function useProjekteTone(): { soft: string; accent: string; strong: string } {
  const tone = getToolTheme('projekte', useColorScheme() === 'dark');
  return { soft: tone.tile, accent: tone.icon, strong: tone.title };
}
