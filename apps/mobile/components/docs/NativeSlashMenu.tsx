import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme';

interface SlashItem {
  label: string;
  blockType: string;
  props?: Record<string, unknown>;
  icon: IoniconsIconName;
}

// Default BlockNote block types, mirrored as native chips. Each maps to the
// same block conversion the web slash menu performs.
const ITEMS: readonly SlashItem[] = [
  { label: 'Text', blockType: 'paragraph', icon: 'text-outline' },
  { label: 'Überschrift 1', blockType: 'heading', props: { level: 1 }, icon: 'text' },
  { label: 'Überschrift 2', blockType: 'heading', props: { level: 2 }, icon: 'text' },
  { label: 'Überschrift 3', blockType: 'heading', props: { level: 3 }, icon: 'text' },
  { label: 'Aufzählung', blockType: 'bulletListItem', icon: 'list-outline' },
  { label: 'Nummeriert', blockType: 'numberedListItem', icon: 'reorder-four-outline' },
  { label: 'To-do', blockType: 'checkListItem', icon: 'checkbox-outline' },
];

export function NativeSlashMenu() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const slashMenuOpen = useDocsEditorBridgeStore((s) => s.slashMenuOpen);
  const slashQuery = useDocsEditorBridgeStore((s) => s.slashQuery);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);
  const setSlashMenu = useDocsEditorBridgeStore((s) => s.setSlashMenu);
  // AI features disabled (buggy): setAiEditOpen no longer used here
  // const setAiEditOpen = useDocsEditorBridgeStore((s) => s.setAiEditOpen);

  const q = slashQuery.trim().toLowerCase();
  const items = useMemo(
    () => (!q ? ITEMS : ITEMS.filter((i) => i.label.toLowerCase().includes(q))),
    [q]
  );
  // AI features disabled (buggy): the KI chip is hidden
  const showAi = false;

  if (!slashMenuOpen || (items.length === 0 && !showAi)) return null;

  const handleSelect = (item: SlashItem) => {
    dispatchAction({ type: 'slash-select', blockType: item.blockType, props: item.props });
    setSlashMenu(false, '');
  };

  // AI features disabled (buggy): "Mit KI schreiben" handler commented out
  // const handleAi = () => {
  //   // Clear the typed "/" (convert to empty paragraph), close the menu, then
  //   // open the inline "Mit KI bearbeiten" sheet to generate at the cursor.
  //   dispatchAction({ type: 'slash-select', blockType: 'paragraph' });
  //   setSlashMenu(false, '');
  //   setAiEditOpen(true);
  // };

  return (
    <KeyboardStickyView style={styles.sticky}>
      <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          keyboardShouldPersistTaps="always"
        >
          {/* AI features disabled (buggy): "Mit KI schreiben" chip commented out
          {showAi && (
            <TouchableOpacity
              style={[styles.chip, styles.aiChip, { borderColor: colors.primary[600] }]}
              onPress={handleAi}
              accessibilityLabel="Mit KI schreiben"
            >
              <Ionicons name="sparkles" size={16} color={colors.primary[600]} />
              <Text style={[styles.chipText, { color: colors.primary[600] }]}>KI</Text>
            </TouchableOpacity>
          )}
          */}
          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.chip, { borderColor: theme.border }]}
              onPress={() => handleSelect(item)}
              accessibilityLabel={item.label}
            >
              <Ionicons name={item.icon} size={16} color={colors.primary[600]} />
              <Text style={[styles.chipText, { color: theme.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  row: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiChip: {
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
