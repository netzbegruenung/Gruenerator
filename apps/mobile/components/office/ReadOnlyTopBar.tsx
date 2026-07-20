import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { darkTheme, lightTheme } from '../../theme';

/**
 * Shared header for the read-only Office viewers (sheet/slide/board/canvas):
 * back, title, a "Nur Ansicht" pill, and right-side actions — always
 * "Im Browser öffnen", plus an optional download (canvas). Kept intentionally
 * light: the viewers are display-only, so there is no editing chrome.
 */
export interface ReadOnlyTopBarProps {
  title: string;
  /** Opens the full web editor; omit to hide the action. */
  webUrl?: string;
  /** Canvas download handler; omit to hide the action. */
  onDownload?: () => void;
  /** Type accent (icon tint), from officeTypeColor. */
  accent?: string;
}

export function ReadOnlyTopBar({ title, webUrl, onDownload, accent }: ReadOnlyTopBarProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const iconColor = accent ?? theme.text;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + 6,
          backgroundColor: theme.card,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.iconBtn}
        accessibilityLabel="Zurück"
      >
        <Ionicons name="chevron-back" size={26} color={theme.text} />
      </Pressable>

      <View style={styles.titleWrap}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title || 'Unbenannt'}
        </Text>
        <View style={[styles.badge, { backgroundColor: theme.surface }]}>
          <Ionicons name="eye-outline" size={11} color={theme.textSecondary} />
          <Text style={[styles.badgeText, { color: theme.textSecondary }]}>Nur Ansicht</Text>
        </View>
      </View>

      {onDownload && (
        <Pressable
          onPress={onDownload}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconBtn}
          accessibilityLabel="Herunterladen"
        >
          <Ionicons name="download-outline" size={22} color={iconColor} />
        </Pressable>
      )}
      {webUrl && (
        <Pressable
          onPress={() => void Linking.openURL(webUrl)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconBtn}
          accessibilityLabel="Im Browser öffnen"
        >
          <Ionicons name="open-outline" size={22} color={iconColor} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
