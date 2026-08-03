import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../../theme';

/**
 * Floating back chevron for the header-less focused/fullscreen screens.
 *
 * Those screens run `headerShown: false` and used to rely on the stack's
 * swipe-back gesture — but `gestureEnabled` on a native stack is iOS-only, so on
 * Android the only way back was the system button, with nothing on screen saying
 * so. Sits in the top-left corner, above the content.
 */
export function BackButton({
  color = colors.grey[800],
  background = 'rgba(255,255,255,0.85)',
  style,
}: {
  color?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  // Absolute children are laid out against their parent's frame, not its padding,
  // so a SafeAreaView around us does not push the button clear of the status bar —
  // it carries the inset itself.
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Zurück"
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        {
          top: insets.top + spacing.xsmall,
          backgroundColor: background,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <Ionicons name="chevron-back" size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    zIndex: 10,
    left: spacing.medium,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
