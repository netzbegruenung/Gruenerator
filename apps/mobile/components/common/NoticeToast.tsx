import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { useNoticeStore } from '../../stores/noticeStore';
import { borderRadius, chatType, colors, spacing } from '../../theme';

const VISIBLE_MS = 6000;

/**
 * Zeigt Hinweise aus `notifyError`/`notifyWarning` des Chat-Pakets oben über
 * dem Bildschirm an. Ohne ihn endeten auf dem Handy Warnungen wie
 * `search_degraded` und Fehler auf Klickpfaden als bloße Konsolenzeile (#3996).
 *
 * Kein Alert: eine Warnung kommt mitten im Stream, und ein modaler Dialog
 * würde die Antwort verdecken, über die sie etwas sagt.
 */
export function NoticeToast() {
  const notice = useNoticeStore((s) => s.notice);
  const dismiss = useNoticeStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';

  useEffect(() => {
    if (!notice) return;
    // iOS kennt keine Live-Region; die Ansage ist dort der einzige Weg zum Screenreader.
    AccessibilityInfo.announceForAccessibility(
      notice.description ? `${notice.message}. ${notice.description}` : notice.message
    );
    const timer = setTimeout(() => dismiss(notice.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) return null;

  const isError = notice.kind === 'error';
  const tint = isError ? (isDark ? colors.error[400] : colors.error[700]) : theme.text;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.xsmall }]}>
      <Animated.View key={notice.id} entering={FadeInUp} exiting={FadeOutUp}>
        <Pressable
          onPress={() => dismiss(notice.id)}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityHint="Tippen zum Schließen"
          testID="notice-toast"
          style={[styles.toast, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        >
          <Ionicons
            name={isError ? 'alert-circle-outline' : 'warning-outline'}
            size={18}
            color={isError ? tint : colors.semantic.warning}
          />
          <View style={styles.texts}>
            <Text style={[styles.message, { color: tint }]}>{notice.message}</Text>
            {notice.description ? (
              <Text style={[styles.description, { color: theme.textSecondary }]}>
                {notice.description}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.medium,
    right: spacing.medium,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
    padding: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  texts: {
    flex: 1,
    gap: spacing.xxsmall,
  },
  message: {
    ...chatType.chatLabel,
  },
  description: {
    ...chatType.chatMeta,
  },
});
