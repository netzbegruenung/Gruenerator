import { View, StyleSheet, useColorScheme } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { DocumentsView } from '../../../components/docs/DocumentsView';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { useOfficeExtraItems } from '../../../components/office/useOfficeExtraItems';
import { useTabNavigationSwipe } from '../../../hooks/useTabSwipe';

/**
 * "Arbeiten": everything the user has made — documents, presentations, sheets,
 * boards and canvases in one list. Creating and searching both hang off the FAB
 * stack in `DocumentsView`, so the list itself starts at the top of the screen.
 *
 * This screen absorbed the former Office tab. On mobile the two were the same
 * list with different chrome, so Office is gone and its `extraItems` (boards +
 * canvases, which the /docs endpoint does not return) are fetched here instead.
 */
export default function ArbeitenScreen() {
  const isDark = useColorScheme() === 'dark';
  const { items } = useOfficeExtraItems();

  // Flat near-white tint mirrors the web Arbeiten tab (bg-[#F7FBF8]); dark keeps the
  // app gradient.
  const backdrop = isDark ? undefined : (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flatBg]} />
  );

  const swipe = useTabNavigationSwipe('/(tabs)/(arbeiten)');

  return (
    <ScreenScaffold title="Arbeiten" backdrop={backdrop}>
      <GestureDetector gesture={swipe}>
        <View style={styles.flex}>
          <DocumentsView extraItems={items} />
        </View>
      </GestureDetector>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flatBg: {
    backgroundColor: '#F7FBF8',
  },
});
