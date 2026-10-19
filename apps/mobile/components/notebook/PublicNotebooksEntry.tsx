import { useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { HEADING_FONT_BOLD, darkTheme, lightTheme, spacing } from '../../theme';
import { MarketplaceSheet } from '../marketplace/MarketplaceSheet';

import { NotebookCoverArt } from './NotebookCoverArt';
import { NotebookTile, notebookTileGridStyle, useNotebookTileGrid } from './NotebookTile';

/**
 * „Öffentlich" — what others list publicly now lives in the Marktplatz; this
 * tile opens it on the notebooks. Gated on `enabled` (auth), like the list it
 * replaced, so a signed-out screen never asks the auth-only endpoint.
 */
export function PublicNotebooksEntry({ enabled }: { enabled: boolean }) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const { size } = useNotebookTileGrid();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Öffentlich</Text>
      <View style={notebookTileGridStyle}>
        <NotebookTile
          icon="people-outline"
          title="Öffentlich"
          size={size}
          coverNode={
            <NotebookCoverArt title="Öffentlich" subtitle="Im Marktplatz stöbern" size={size} />
          }
          onPress={() => setOpen(true)}
        />
      </View>
      <MarketplaceSheet
        visible={open}
        onClose={() => setOpen(false)}
        kinds={['notebook']}
        title="Öffentliche Notebooks"
      />
    </View>
  );
}

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
