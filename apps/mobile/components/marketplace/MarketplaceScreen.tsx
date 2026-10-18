import { type MarketplaceFilters } from '@gruenerator/shared/marketplace';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';

import { MarketplaceBrowser } from './MarketplaceBrowser';

/**
 * „Marktplatz" — Agents, Rezepte, Vorlagen, Sticker und Hintergründe, die der
 * Grünerator, der eigene Landesverband oder andere öffentlich anbieten (web:
 * `/marktplatz`). Nur Inhalte des eigenen Landes; das entscheidet der Server.
 */
export function MarketplaceScreen({ initialFilters }: { initialFilters: MarketplaceFilters }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.column}>
        <MarketplaceBrowser initialFilters={initialFilters} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Text cards, so the reading measure, like the Grüneratoren overview.
  column: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
  },
});
