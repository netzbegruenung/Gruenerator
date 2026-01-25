import { useColorScheme, Platform, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { spacing, borderRadius } from '../../theme';

interface FloatingGlassMenuProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FloatingGlassMenu({ children, style }: FloatingGlassMenuProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const menuStyle: ViewStyle = {
    position: 'absolute',
    top: insets.top + spacing.small,
    right: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.pill,
    padding: spacing.xsmall,
    gap: spacing.xxsmall,
    zIndex: 100,
  };

  const combinedStyle = [menuStyle, style];

  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return <GlassView style={combinedStyle}>{children}</GlassView>;
  }

  return (
    <BlurView
      intensity={80}
      tint={colorScheme === 'dark' ? 'dark' : 'light'}
      style={[
        combinedStyle,
        {
          overflow: 'hidden',
          backgroundColor:
            colorScheme === 'dark' ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.75)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 5,
        },
      ]}
    >
      {children}
    </BlurView>
  );
}
