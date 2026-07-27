import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { spacing, borderRadius } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

import type { MessageExportKind } from '../../hooks/useMessageActions';
import type { Theme } from '../../theme/colors';

/**
 * The secondary actions of an assistant message, behind the action bar's "⋮".
 *
 * Which actions live here follows ChatGPT's split rather than ours: the bar
 * carries only what one reaches for mid-conversation (copy, read aloud,
 * regenerate), and everything that leaves the chat — the Word export, the
 * editor handoff — moves one tap away.
 */
export const MessageActionsSheet = memo(function MessageActionsSheet({
  visible,
  theme,
  exporting,
  onClose,
  onExportDocx,
  onOpenInDocs,
}: {
  visible: boolean;
  theme: Theme;
  exporting: MessageExportKind | null;
  onClose: () => void;
  onExportDocx: () => void;
  onOpenInDocs: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="45%" padded>
      <SheetRow
        icon={exporting === 'docx' ? 'hourglass-outline' : 'download-outline'}
        label="Als Word herunterladen"
        theme={theme}
        disabled={!!exporting}
        onPress={onExportDocx}
      />
      <SheetRow
        icon={exporting === 'docs' ? 'hourglass-outline' : 'create-outline'}
        label="Im Editor öffnen"
        theme={theme}
        disabled={!!exporting}
        onPress={onOpenInDocs}
      />
    </BottomSheet>
  );
});

function SheetRow({
  icon,
  label,
  theme,
  disabled,
  onPress,
}: {
  icon: IoniconsIconName;
  label: string;
  theme: Theme;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.surface },
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={theme.textSecondary} />
      </View>
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 16,
  },
});
