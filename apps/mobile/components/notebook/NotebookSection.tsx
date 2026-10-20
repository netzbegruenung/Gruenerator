import {
  landesverbandCardPaths,
  landesverbandCoverForNotebook,
} from '@gruenerator/shared/marketplace';
import { memo, useCallback, type ReactNode } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';

import { type MobileNotebookEntry } from '../../config/notebooksConfig';
import { resolveWebUrl } from '../../services/webOrigin';
import { spacing, lightTheme, darkTheme, HEADING_FONT_BOLD } from '../../theme';

import { NotebookTile, notebookTileGridStyle, useNotebookTileGrid } from './NotebookTile';

/**
 * One tile, with its own press handlers.
 *
 * The binding lives here rather than in the grid's `.map` because that is what
 * makes `memo` mean anything: an inline `() => onNotebookPress(notebook)` is a
 * fresh function on every render, so every tile would re-render even when
 * nothing about it changed. With the notebook and the (stable) section
 * callbacks as props, all five sections' tiles sit out a re-render caused by anything else on the screen.
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
  // A Landesverband notebook shows the photo of its Marktplatz card.
  const lvCover = landesverbandCoverForNotebook(notebook.id);

  return (
    <NotebookTile
      title={notebook.title}
      meta={notebook.meta}
      icon={notebook.icon}
      photo={lvCover ? resolveWebUrl(landesverbandCardPaths(lvCover).w480) : null}
      size={size}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
    />
  );
});

/**
 * A titled grid of system notebooks — the mobile echo of web's notebook gallery.
 * Renders nothing when empty. `trailing` tiles follow the notebooks in the same grid.
 */
export const NotebookSection = memo(function NotebookSection({
  title,
  notebooks,
  onNotebookPress,
  onNotebookLongPress,
  trailing,
}: {
  title: string;
  notebooks: MobileNotebookEntry[];
  trailing?: ReactNode;
  onNotebookPress: (notebook: MobileNotebookEntry) => void;
  onNotebookLongPress?: (notebook: MobileNotebookEntry) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { size } = useNotebookTileGrid();

  if (notebooks.length === 0 && !trailing) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={notebookTileGridStyle}>
        {notebooks.map((notebook) => (
          <SectionTile
            key={notebook.id}
            notebook={notebook}
            size={size}
            onPress={onNotebookPress}
            onLongPress={onNotebookLongPress}
          />
        ))}
        {trailing}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.large,
  },
  sectionTitle: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 17,
    marginBottom: spacing.small,
  },
});
