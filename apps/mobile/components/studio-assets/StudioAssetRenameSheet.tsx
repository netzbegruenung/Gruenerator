import { type StudioAssetItem } from '@gruenerator/contracts';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, borderRadius, colors, spacing } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

const TITLE_MAX = 120;

interface StudioAssetRenameSheetProps {
  /** null = closed. */
  item: StudioAssetItem | null;
  onSave: (item: StudioAssetItem, title: string) => void;
  onClose: () => void;
}

/** Renaming as a sheet: `Alert.prompt` exists only on iOS. */
export function StudioAssetRenameSheet({ item, onSave, onClose }: StudioAssetRenameSheetProps) {
  return (
    <BottomSheet visible={!!item} onClose={onClose} padded keyboardAvoiding>
      {item ? <RenameForm key={item.id} item={item} onSave={onSave} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

/** Mounted only while open, so the draft starts from the current title each time. */
function RenameForm({
  item,
  onSave,
  onClose,
}: {
  item: StudioAssetItem;
  onSave: (item: StudioAssetItem, title: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(item.title);
  const title = draft.trim();
  const canSave = title.length > 0 && title !== item.title;

  const commit = () => {
    if (!canSave) return;
    onSave(item, title);
    onClose();
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
        Umbenennen
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        selectTextOnFocus
        maxLength={TITLE_MAX}
        returnKeyType="done"
        onSubmitEditing={commit}
        placeholder="Titel"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Titel"
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
        ]}
      />
      <View style={styles.actions}>
        <Pressable onPress={onClose} style={styles.button} accessibilityRole="button">
          <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Abbrechen</Text>
        </Pressable>
        <Pressable
          onPress={commit}
          disabled={!canSave}
          style={[styles.button, styles.save, !canSave && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
        >
          <Text style={[styles.buttonText, styles.saveText]}>Speichern</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small, paddingTop: spacing.xsmall, paddingBottom: spacing.small },
  heading: { fontFamily: HEADING_FONT_BOLD, fontSize: 18 },
  input: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xsmall },
  button: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  save: { backgroundColor: colors.primary[600] },
  disabled: { opacity: 0.4 },
  buttonText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  saveText: { color: colors.white },
});
