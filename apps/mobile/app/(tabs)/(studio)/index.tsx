import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { STUDIO_TOOLS } from '../../../components/tools/toolsConfig';
import { ToolSquareGrid } from '../../../components/tools/ToolSquareGrid';
import { spacing } from '../../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../../theme/layout';

/**
 * The Studio tab — Vorlagen, KI-Bild and Reel, mirroring web's /studio landing
 * strip. The individual tools live in the (tools) group and are reached from
 * here rather than from a tab of their own.
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
