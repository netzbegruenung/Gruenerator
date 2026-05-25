import { View, Text, StyleSheet, useColorScheme } from 'react-native';

import { type MobileNotebookEntry } from '../../config/notebooksConfig';
import { spacing, lightTheme, darkTheme } from '../../theme';

import { NotebookCard } from './NotebookCard';

/** A titled 2-column grid of system notebooks. Renders nothing when empty. */
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

  if (notebooks.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {notebooks.map((notebook) => (
        <NotebookCard
          key={notebook.id}
          icon={notebook.icon}
          title={notebook.title}
          meta={notebook.meta}
          onPress={() => onNotebookPress(notebook)}
          onLongPress={onNotebookLongPress ? () => onNotebookLongPress(notebook) : undefined}
        />
      ))}
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
});
