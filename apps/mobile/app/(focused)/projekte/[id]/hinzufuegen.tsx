import { GROUP_SHARE_NOTE_MAX } from '@gruenerator/contracts';
import {
  addItemsToGroup,
  addableKey,
  groupContentKey,
  sharedContentKeys,
  type AddableItem,
} from '@gruenerator/shared/groups';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../../components/common';
import { NeutralBackdrop } from '../../../../components/common/NeutralBackdrop';
import { ScreenScaffold } from '../../../../components/navigation/ScreenScaffold';
import { AddableContentList } from '../../../../components/projekte/AddableContentList';
import { useGroupFeed } from '../../../../hooks/useGroupContent';
import { useGroupDetails } from '../../../../hooks/useGroups';
import { useTheme } from '../../../../hooks/useTheme';
import { spacing, BODY_FONT } from '../../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../../theme/layout';
import { goBackOr } from '../../../../utils/navigation';

/**
 * Eigene Agents, Rezepte, Notebooks, Docs und Boards in ein Projekt legen —
 * das Gegenstück zum Web-Dialog „Inhalte hinzufügen". Im Team dürfen Mitglieder
 * geteilte Docs bearbeiten, sonst wird nur lesend geteilt; ob es erlaubt ist,
 * entscheidet der Server.
 */
export default function ProjektHinzufuegenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const group = useGroupDetails(id).data?.group;
  // Wie im Web: im Team dürfen Mitglieder geteilte Docs bearbeiten, sonst nur lesen.
  const isTeam = !!group && group.is_system !== true;
  const feed = useGroupFeed(id);
  const alreadyShared = useMemo(() => sharedContentKeys(feed.data ?? []), [feed.data]);

  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<Map<string, AddableItem>>(new Map());
  const [saving, setSaving] = useState(false);

  const toggle = (item: AddableItem) =>
    setSelected((prev) => {
      const next = new Map(prev);
      const key = addableKey(item);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });

  const close = () => goBackOr({ pathname: '/(focused)/projekte/[id]', params: { id: groupId } });

  const submit = async () => {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    // addItemsToGroup wirft nie (Promise.allSettled), deshalb kein try.
    const result = await addItemsToGroup(groupId, [...selected.values()], note, {
      writeDocuments: isTeam,
    });
    setSaving(false);
    void queryClient.invalidateQueries({ queryKey: groupContentKey(groupId) });
    if (result.failed === 0) {
      close();
      return;
    }
    const head =
      result.added > 0
        ? `${result.added} hinzugefügt, ${result.failed} nicht.`
        : 'Nichts wurde hinzugefügt.';
    Alert.alert(head, result.firstError ?? undefined);
  };

  const count = selected.size;

  return (
    <ScreenScaffold backdrop={<NeutralBackdrop />} title="Inhalte hinzufügen" onBack={close}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.column, styles.scroll]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {group?.name ? (
            <Text style={[styles.lead, { color: theme.textSecondary }]}>
              Mitglieder von „{group.name}“ können geteilte Inhalte ansehen und verwenden.
            </Text>
          ) : null}
          <AddableContentList
            selected={new Set(selected.keys())}
            onToggle={toggle}
            alreadyShared={alreadyShared}
          />
        </ScrollView>

        <View
          style={[
            styles.footer,
            styles.column,
            {
              paddingBottom: Math.max(insets.bottom, spacing.medium),
              borderTopColor: theme.border,
            },
          ]}
        >
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Notiz für das Projekt (optional)"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Notiz für das Projekt"
            maxLength={GROUP_SHARE_NOTE_MAX}
            multiline
            style={[styles.note, { color: theme.text, backgroundColor: theme.buttonBackground }]}
          />
          <Button onPress={() => void submit()} disabled={count === 0} loading={saving}>
            {count > 0 ? `${count} hinzufügen` : 'Hinzufügen'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  scroll: { paddingHorizontal: spacing.medium, paddingBottom: spacing.large, gap: 14 },
  lead: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  footer: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    gap: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  note: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 96,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
