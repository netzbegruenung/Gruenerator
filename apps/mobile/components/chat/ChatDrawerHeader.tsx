import { useAuiState } from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing } from '../../theme';

import type { Theme } from '../../theme/colors';

interface Props {
  onOpenDrawer: () => void;
  theme?: Theme;
}

export const ChatDrawerHeader = memo(function ChatDrawerHeader({
  onOpenDrawer,
  theme: themeProp,
}: Props) {
  const resolvedTheme = useTheme();
  const theme = themeProp ?? resolvedTheme;
  const insets = useSafeAreaInsets();
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <View style={[styles.header, { paddingTop: insets.top, backgroundColor: theme.background }]}>
      <Pressable
        onPress={onOpenDrawer}
        style={styles.menuButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="menu" size={26} color={theme.text} />
      </Pressable>

      <Text style={[styles.title, { color: theme.text }]}>Chat</Text>

      <View style={styles.rightSlot}>
        {isRunning && <ActivityIndicator size="small" color={colors.primary[600]} />}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  rightSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
