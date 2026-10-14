import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Modal, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useLayout } from '../../hooks/useLayout';
import { lightTheme, darkTheme, colors, spacing } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';

import { shouldDismissSheet } from './sheetDismiss';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: `${number}%` | number;
  keyboardAvoiding?: boolean;
  /**
   * Apply a standard horizontal content inset to the sheet. Opt-in because most
   * sheets pad their own rows/sections; turn it on for sheets whose content (e.g.
   * full-width buttons, chips) would otherwise sit flush against the edges.
   */
  padded?: boolean;
  /**
   * Sheet fill. Defaults to `theme.background`; pass the darker `theme.surface`
   * for sheets built out of grouped cards, which need the cards to read as
   * raised against the sheet rather than melting into it.
   */
  backgroundColor?: string;
}

/**
 * Mounts on the first open and stays mounted: the RN Modal has to be in the tree
 * to animate out. A sheet that is never opened costs nothing, which matters
 * because every assistant row and the start page carry several.
 */
export function BottomSheet(props: BottomSheetProps) {
  const [opened, setOpened] = useState(props.visible);
  if (props.visible && !opened) setOpened(true);
  if (!opened) return null;
  return <SheetModal {...props} />;
}

function SheetModal({
  visible,
  onClose,
  children,
  maxHeight = '85%',
  keyboardAvoiding,
  padded,
  backgroundColor,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const { isTablet } = useLayout();

  // Drag-to-dismiss on the handle row. Only there: most sheets scroll, and a
  // pan over the whole sheet would fight the ScrollView for every drag.
  const translateY = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  // A sheet dragged away stays off screen until the Modal is gone; the next
  // open has to start from its resting place again — before the first paint.
  useLayoutEffect(() => {
    if (visible) translateY.set(0);
  }, [visible, translateY]);
  // Back button or parent may close the sheet while it is still springing
  // away; the spring must not close it a second time.
  const shown = useSharedValue(visible);
  useEffect(() => {
    shown.set(visible);
  }, [visible, shown]);

  const dragToDismiss = useMemo(() => {
    const commitHaptic = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return Gesture.Pan()
      .activeOffsetY([-8, 8])
      .onUpdate((e) => {
        // Downward only: lifted above its rest the sheet would bare the page
        // under its bottom edge.
        translateY.set(Math.max(0, e.translationY));
      })
      .onEnd((e) => {
        const height = sheetHeight.get();
        // Wide sheets float above a bottom margin; their own height alone
        // would leave that strip of them on screen.
        const offScreen = height + spacing.medium;
        if (shouldDismissSheet(translateY.get(), e.velocityY, height)) {
          // The haptic marks the decision, so it fires now, not when the sheet lands.
          scheduleOnRN(commitHaptic);
          translateY.set(
            withSpring(
              offScreen,
              { duration: 300, dampingRatio: 1, velocity: e.velocityY, overshootClamping: true },
              (finished) => {
                if (finished && shown.get()) scheduleOnRN(onClose);
              }
            )
          );
        } else {
          translateY.set(
            withSpring(0, { duration: 300, dampingRatio: 0.8, velocity: e.velocityY })
          );
        }
      });
  }, [onClose, translateY, sheetHeight, shown]);

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const content = (
    <>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dialog schließen"
      />
      <AnimatedPressable
        onLayout={(e) => sheetHeight.set(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          // A sheet that spans a 1024dp slab is not a sheet, it is a second
          // screen. Capped it needs a bottom edge of its own — the two upper
          // corners were enough while the lower ones ran off the display.
          isTablet && styles.sheetWide,
          {
            // Always keep a comfortable gap below the last element — the safe-area
            // inset (often 0 inside a RN Modal) plus a fixed cushion.
            paddingBottom: Math.max(insets.bottom, spacing.medium) + spacing.medium,
            paddingHorizontal: padded ? spacing.medium : undefined,
            backgroundColor: backgroundColor ?? theme.background,
            borderColor: theme.border,
            maxHeight,
          },
          dragStyle,
        ]}
        onPress={() => {}}
        accessibilityRole="none"
      >
        <GestureDetector gesture={dragToDismiss}>
          <View style={styles.handleRow}>
            <View
              style={[
                styles.handle,
                { backgroundColor: isDark ? colors.grey[600] : colors.grey[300] },
              ]}
            />
          </View>
        </GestureDetector>
        {children}
      </AnimatedPressable>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      {/* A Modal is a separate native root: gestures inside it need their own
          GestureHandlerRootView, or the handle's pan never fires on Android. */}
      <GestureHandlerRootView style={styles.container}>
        {keyboardAvoiding ? (
          <KeyboardAvoidingView behavior="padding" style={styles.container}>
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // No dim at all. It was 0.4 — a modal scrim, right for something that demands
  // an answer, wrong for a picker you open, tap once and leave. The sheet is its
  // own surface with a border and a radius, so what is behind it does not need
  // to be pushed back to read as inactive; darkening it mainly hid the page.
  //
  // Still a Pressable, and still the whole area above the sheet: React Native
  // hit-tests by layout rather than by painted pixels, so tap-to-close works
  // exactly as before. This style is what makes the region invisible, not
  // intangible.
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetWide: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    marginBottom: spacing.medium,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});
