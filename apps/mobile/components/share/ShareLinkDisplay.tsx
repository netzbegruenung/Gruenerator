/**
 * ShareLinkDisplay
 * Displays QR code and shareable link with copy/share actions
 */

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface ShareLinkDisplayProps {
  shareUrl: string;
  onCopy: () => void;
  onShare: () => void;
  copied: boolean;
}

export function ShareLinkDisplay({ shareUrl, onCopy, onShare, copied }: ShareLinkDisplayProps) {
  return (
    <View style={styles.container}>
      <View style={styles.qrContainer}>
        <QRCode
          value={shareUrl}
          size={160}
          backgroundColor={colors.white}
          color={colors.grey[900]}
        />
      </View>

      <Text style={styles.label}>Link zum Teilen</Text>

      <View style={styles.linkContainer}>
        <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
          {shareUrl}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={20}
              color={copied ? colors.primary[600] : colors.grey[600]}
            />
          </Pressable>

          <Pressable
            onPress={onShare}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Ionicons name="share-outline" size={20} color={colors.grey[600]} />
          </Pressable>
        </View>
      </View>

      {copied && <Text style={styles.copiedText}>Link kopiert!</Text>}
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
    color: colors.grey[500],
    marginBottom: spacing.small,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.grey[100],
    borderRadius: borderRadius.medium,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xsmall,
    paddingVertical: spacing.xsmall,
    width: '100%',
  },
  linkText: {
    flex: 1,
    ...typography.body,
    color: colors.grey[700],
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
    backgroundColor: colors.white,
  },
  iconButtonPressed: {
    backgroundColor: colors.grey[200],
  },
  copiedText: {
    ...typography.caption,
    color: colors.primary[600],
    marginTop: spacing.small,
  },
});
