import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';

import {
  useNotebookSharing,
  type Audience,
  type EditPolicy,
  type ShareMode,
} from '../../hooks/notebook/useNotebookSharing';
import { colors, spacing, typography } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

import type { Theme } from '../../theme/colors';

interface Props {
  notebookId: string;
  notebookName: string;
  visible: boolean;
  onClose: () => void;
  theme: Theme;
}

const SHARE_MODE_OPTIONS: Array<{ value: ShareMode; label: string; description: string }> = [
  { value: 'private', label: 'Privat', description: 'Nur du hast Zugriff.' },
  { value: 'groups', label: 'Mit Gruppen', description: 'Ausgewählte Gruppen können lesen.' },
  {
    value: 'authenticated',
    label: 'Alle Angemeldeten',
    description: 'Alle angemeldeten Nutzer*innen können lesen.',
  },
];

const EDIT_POLICY_OPTIONS: Array<{ value: EditPolicy; label: string }> = [
  { value: 'owner_only', label: 'Nur ich' },
  { value: 'group_admins', label: 'Gruppen-Admins' },
  { value: 'all_members', label: 'Alle Mitglieder' },
];

const AUDIENCE_OPTIONS: Array<{ value: Audience; label: string }> = [
  { value: 'de-DE', label: 'Deutschland' },
  { value: 'de-AT', label: 'Österreich' },
];

function OptionRow({
  label,
  description,
  selected,
  onPress,
  theme,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable onPress={onPress} style={styles.optionRow}>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? colors.primary[600] : theme.textSecondary}
      />
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionLabel, { color: theme.text }]}>{label}</Text>
        {description && (
          <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function NotebookShareSheet({ notebookId, notebookName, visible, onClose, theme }: Props) {
  const {
    settings,
    isLoading,
    error,
    myGroups,
    groupShares,
    setShareMode,
    setEditPolicy,
    setAudience,
    setIsPublic,
    addGroupShare,
    removeGroupShare,
  } = useNotebookSharing(notebookId, visible);

  const sharedGroupIds = new Set(groupShares.map((g) => g.group_id));
  const addableGroups = myGroups.filter((g) => !sharedGroupIds.has(g.id));

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          „{notebookName}“ teilen
        </Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[600]} />
        </View>
      )}

      {error && !isLoading && (
        <Text style={[styles.errorText, { color: colors.error[500] }]}>{error}</Text>
      )}

      {settings && (
        <ScrollView style={styles.scroll}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Wer kann lesen?</Text>
          {SHARE_MODE_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={settings.share_mode === opt.value}
              onPress={() => setShareMode(opt.value)}
              theme={theme}
            />
          ))}

          {settings.share_mode !== 'private' && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                Wer kann bearbeiten?
              </Text>
              {EDIT_POLICY_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={settings.edit_policy === opt.value}
                  onPress={() => setEditPolicy(opt.value)}
                  theme={theme}
                />
              ))}
            </>
          )}

          {settings.share_mode === 'groups' && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Gruppen</Text>
              {groupShares.map((g) => (
                <View key={g.group_id} style={styles.groupRow}>
                  <Ionicons name="people" size={18} color={colors.primary[600]} />
                  <Text style={[styles.groupName, { color: theme.text }]} numberOfLines={1}>
                    {g.group_name}
                  </Text>
                  <Pressable onPress={() => removeGroupShare(g.group_id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ))}
              {addableGroups.map((g) => (
                <Pressable key={g.id} onPress={() => addGroupShare(g.id)} style={styles.groupRow}>
                  <Ionicons name="add-circle-outline" size={18} color={theme.textSecondary} />
                  <Text
                    style={[styles.groupName, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {g.name}
                  </Text>
                </Pressable>
              ))}
              {groupShares.length === 0 && addableGroups.length === 0 && (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Du bist in keinen Gruppen.
                </Text>
              )}
            </>
          )}

          {settings.share_mode === 'authenticated' && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Zielgruppe</Text>
              {AUDIENCE_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={settings.audience === opt.value}
                  onPress={() => setAudience(opt.value)}
                  theme={theme}
                />
              ))}
              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={[styles.optionLabel, { color: theme.text }]}>Von der Basis</Text>
                  <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
                    In der öffentlichen Notebook-Galerie zeigen.
                  </Text>
                </View>
                <Switch
                  value={settings.is_public}
                  onValueChange={(v) => setIsPublic(v)}
                  trackColor={{ true: colors.primary[600] }}
                />
              </View>
            </>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.small,
  },
  title: {
    ...typography.bodyBold,
    fontSize: 17,
    flex: 1,
  },
  scroll: {
    maxHeight: 420,
  },
  center: {
    padding: spacing.large,
    alignItems: 'center',
  },
  errorText: {
    ...typography.bodySmall,
    paddingVertical: spacing.small,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.medium,
    marginBottom: spacing.xsmall,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  optionDescription: {
    fontSize: 12,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
  },
  groupName: {
    fontSize: 15,
    flex: 1,
  },
  emptyText: {
    ...typography.bodySmall,
    paddingVertical: spacing.small,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
  },
  switchTextWrap: {
    flex: 1,
    gap: 2,
  },
});
