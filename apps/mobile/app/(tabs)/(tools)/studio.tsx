import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { STUDIO_TOOLS } from '../../../components/tools/toolsConfig';
import { ToolSquareGrid } from '../../../components/tools/ToolSquareGrid';
import { spacing } from '../../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../../theme/layout';

/**
 * The Studio area — Vorlagen, KI-Bild and Reel behind one tile, mirroring web's
 * /studio landing strip. Everything visual lives here so the Arbeiten tool grid
 * stays a short list of areas rather than a wall of individual tools.
 */
export default function StudioScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScreenScaffold title="Studio">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.medium },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <ToolSquareGrid tools={STUDIO_TOOLS} />
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
  },
});
