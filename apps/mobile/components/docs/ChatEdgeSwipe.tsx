import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';

/**
 * Invisible right-edge strip that opens the KI-Assistent sidebar on a leftward
 * swipe (the right-drawer reveal). Deliberately on the right edge — the left
 * edge → right swipe is the OS back gesture (the top bar no longer has a back
 * arrow). The strip stops short of the bottom so it never steals the fullscreen
 * FAB's touches. runOnJS lets onEnd call the Zustand action on the JS thread.
 */
export function ChatEdgeSwipe() {
  const insets = useSafeAreaInsets();
  const toggleSidebar = useDocsEditorBridgeStore((s) => s.toggleSidebar);

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 9999])
    .onEnd((e) => {
      if (e.translationX < -40 && !useDocsEditorBridgeStore.getState().sidebarOpen) {
        toggleSidebar();
      }
    })
    .runOnJS(true);

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.strip, { top: insets.top + 56, bottom: insets.bottom + 140 }]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    right: 0,
    width: 24,
    zIndex: 20,
  },
});
