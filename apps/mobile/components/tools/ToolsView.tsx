import { StyleSheet, ScrollView } from 'react-native';

import { useLayout } from '../../hooks/useLayout';
import { spacing } from '../../theme';
import { ContentColumn } from '../common/ContentColumn';

import { TOOLS } from './toolsConfig';
import { ToolSquareGrid } from './ToolSquareGrid';
import { ToolSectionHeading } from './ToolTileGrid';

/**
 * Tools body without the surrounding ScreenScaffold, so it can render both
 * standalone (the /(tabs)/(tools) route) and inside the merged Arbeiten tab.
 */
export function ToolsView() {
  const { gridWidth } = useLayout();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* A tile field carries no line length, so it gets the wider of the two
          caps and spends the room on further columns rather than bigger tiles. */}
      <ContentColumn variant="grid" style={styles.section}>
        <ToolSectionHeading title="Werkzeuge" badge={`${TOOLS.length}`} />
        <ToolSquareGrid tools={TOOLS} availableWidth={gridWidth} />
      </ContentColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  section: {
    paddingTop: spacing.large,
  },
});
