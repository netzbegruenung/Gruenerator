import { View, Text, StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';

import { getNotebookCover } from '../../config/notebookCovers';
import { type MobileNotebookEntry } from '../../config/notebooksConfig';
import { useIsTablet } from '../../hooks/useIsTablet';
import { spacing, lightTheme, darkTheme } from '../../theme';

import { NotebookTile } from './NotebookTile';

const GAP = spacing.small;
/** Horizontal padding of the Wissen screen's scroll content, both sides. */
const SCREEN_PADDING = spacing.medium * 2;

/**
 * A titled grid of system notebooks — the mobile echo of web's notebook gallery.
 * Renders nothing when empty.
 */
export function NotebookSection({
  title,
  notebooks,
  onNotebookPress,
  onNotebookLongPress,
}: {
  title: string;
  notebooks: MobileNotebookEntry[];
  onNotebookPress: (notebook: MobileNotebookEntry) => void;
  onNotebookLongPress?: (notebook: MobileNotebookEntry) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isTablet = useIsTablet();
  const { width } = useWindowDimensions();

  if (notebooks.length === 0) return null;

  const columns = isTablet ? 3 : 2;
  const tileSize = Math.floor((width - SCREEN_PADDING - GAP * (columns - 1)) / columns);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.grid}>
        {notebooks.map((notebook) => (
          <NotebookTile
            key={notebook.id}
            title={notebook.title}
            meta={notebook.meta}
            icon={notebook.icon}
            cover={getNotebookCover(notebook.id)}
            size={tileSize}
            onPress={() => onNotebookPress(notebook)}
            onLongPress={onNotebookLongPress ? () => onNotebookLongPress(notebook) : undefined}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.large,
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 17,
    marginBottom: spacing.small,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
});
