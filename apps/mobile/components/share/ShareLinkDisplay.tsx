/**
 * ShareLinkDisplay
 * Displays QR code and shareable link with copy/share actions
 */

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { lazy, Suspense } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, typography } from '../../theme';

// Loaded when the share sheet first shows a link, not at launch: the QR
// library's logo support pulls in css-tree, which builds its whole CSS grammar
// from mdn-data on import (616 KB of bundle, ~36 ms in Node on a fast Mac) —
// work every app start paid for a code only this sheet draws.
const QRCode = lazy(() => import('react-native-qrcode-svg'));

const QR_SIZE = 160;

interface ShareLinkDisplayProps {
  shareUrl: string;
  onCopy: () => void;
  onShare: () => void;
  copied: boolean;
}

export function ShareLinkDisplay({ shareUrl, onCopy, onShare, copied }: ShareLinkDisplayProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {/* QR tile stays white in both schemes: QR codes need a light background to scan reliably */}
      <View style={styles.qrContainer}>
        <Suspense fallback={<View style={styles.qrPlaceholder} />}>
          <QRCode
            value={shareUrl}
            size={QR_SIZE}
            backgroundColor={colors.white}
            color={colors.grey[900]}
          />
        </Suspense>
      </View>

      <Text style={[styles.label, { color: theme.textSecondary }]}>Link zum Teilen</Text>

      <View style={[styles.linkContainer, { backgroundColor: theme.surface }]}>
        <Text
          style={[styles.linkText, { color: theme.text }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {shareUrl}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: pressed ? theme.buttonBackground : theme.background },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Link kopieren"
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={20}
              color={copied ? theme.textGreen : theme.textSecondary}
            />
          </Pressable>

          <Pressable
            onPress={onShare}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: pressed ? theme.buttonBackground : theme.background },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Link teilen"
          >
            <Ionicons name="share-outline" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      {copied && <Text style={[styles.copiedText, { color: theme.textGreen }]}>Link kopiert!</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.large,
  },
  qrContainer: {
    padding: spacing.medium,
    backgroundColor: colors.white,
    borderRadius: borderRadius.large,
    marginBottom: spacing.large,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrPlaceholder: {
    width: QR_SIZE,
    height: QR_SIZE,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.small,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.medium,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xsmall,
    paddingVertical: spacing.xsmall,
    width: '100%',
  },
  linkText: {
    flex: 1,
    ...typography.body,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xxsmall,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiedText: {
    ...typography.caption,
    marginTop: spacing.small,
  },
});
