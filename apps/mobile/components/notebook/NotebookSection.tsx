import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';

import { getNotebookCover } from '../../config/notebookCovers';
import { type MobileNotebookEntry } from '../../config/notebooksConfig';
import { useLayout } from '../../hooks/useLayout';
import { spacing, lightTheme, darkTheme } from '../../theme';
import { gridColumns } from '../../theme/layout';

import { NotebookTile } from './NotebookTile';

const GAP = spacing.small;
/**
 * Smallest a notebook tile may get before a column is dropped — what a phone
 * already draws at two columns.
 */
const MIN_TILE = 160;

/**
 * One tile, with its own press handlers.
 *
 * The binding lives here rather than in the grid's `.map` because that is what
 * makes `memo` mean anything: an inline `() => onNotebookPress(notebook)` is a
 * fresh function on every render, so every tile would re-render even when
 * nothing about it changed. With the notebook and the (stable) section
 * callbacks as props, all five sections' tiles — 19 of them, each with a cover
 * image — sit out a re-render caused by anything else on the screen.
 */
const SectionTile = memo(function SectionTile({
  notebook,
  size,
  onPress,
  onLongPress,
}: {
  notebook: MobileNotebookEntry;
  size: number;
  onPress: (notebook: MobileNotebookEntry) => void;
  onLongPress?: (notebook: MobileNotebookEntry) => void;
}) {
  const handlePress = useCallback(() => onPress(notebook), [onPress, notebook]);
  const handleLongPress = useCallback(() => onLongPress?.(notebook), [onLongPress, notebook]);

  return (
    <NotebookTile
      title={notebook.title}
      meta={notebook.meta}
      icon={notebook.icon}
      cover={getNotebookCover(notebook.id)}
      size={size}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
    />
  );
});

/**
 * A titled grid of system notebooks — the mobile echo of web's notebook gallery.
 * Renders nothing when empty.
 */
export const NotebookSection = memo(function NotebookSection({
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
  const { gridWidth } = useLayout();

  if (notebooks.length === 0) return null;

  const columns = gridColumns(gridWidth, MIN_TILE, GAP);
  const tileSize = Math.floor((gridWidth - GAP * (columns - 1)) / columns);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.grid}>
        {notebooks.map((notebook) => (
          <SectionTile
            key={notebook.id}
            notebook={notebook}
            size={tileSize}
            onPress={onNotebookPress}
            onLongPress={onNotebookLongPress}
          />
        ))}
      </View>
    </View>
  );
});

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
