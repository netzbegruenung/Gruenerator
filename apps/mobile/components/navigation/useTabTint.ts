import { useSegments } from 'expo-router';

import { colors } from '../../theme';

/**
 * The active-tab tint for the current section — the mobile echo of the web
 * `WorkplaceTabs` per-section recoloring (chat green · arbeiten deeper green ·
 * wissen magenta). Native tabs expose only a single tintColor, so we recolor the
 * active tab per focused route instead of the web's sliding tinted pill.
 */
export function useTabTint(): string {
  const segments = useSegments() as string[];
  if (segments.includes('(arbeiten)')) return colors.primary[700]; // #285040
  if (segments.includes('(recherche)')) return '#C4006A'; // notebook magenta
  return colors.primary[600]; // chat / start default (#316049)
}
