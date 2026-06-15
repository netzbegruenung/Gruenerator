/**
 * ShareLinkDisplay
 * Displays QR code and shareable link with copy/share actions
 */

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, typography } from '../../theme';

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
        <QRCode
          value={shareUrl}
          size={160}
          backgroundColor={colors.white}
          color={colors.grey[900]}
        />
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
