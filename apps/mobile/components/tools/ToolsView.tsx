import { View, StyleSheet, ScrollView } from 'react-native';

import { spacing } from '../../theme';

import { TOOLS } from './toolsConfig';
import { ToolSquareGrid } from './ToolSquareGrid';
import { ToolSectionHeading } from './ToolTileGrid';

/**
 * Tools body without the surrounding ScreenScaffold, so it can render both
 * standalone (the /(tabs)/(tools) route) and inside the merged Arbeiten tab.
 */
export function ToolsView() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <ToolSectionHeading title="Werkzeuge" badge={`${TOOLS.length}`} />
        <ToolSquareGrid tools={TOOLS} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  section: {
    paddingTop: spacing.large,
    paddingHorizontal: spacing.medium,
  },
});
