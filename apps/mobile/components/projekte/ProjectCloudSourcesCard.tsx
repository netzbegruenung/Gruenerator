import { type GroupCloudSource } from '@gruenerator/contracts';
import {
  cloudSourceStatusParts,
  cloudSyncSummaryText,
  detachCloudSourceDescription,
  useDetachGroupCloudSource,
  useGroupCloudSources,
  useSyncGroupCloudSource,
} from '@gruenerator/shared/groups';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { useNoticeStore } from '../../stores/noticeStore';
import { BODY_FONT, colors } from '../../theme';
import { MenuActionSheet } from '../chat/MenuActionSheet';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';

import { buildCloudSourceActions, DETACH_SOURCE_ID, SYNC_SOURCE_ID } from './cloudSourcesMenu';
import { useProjekteTone } from './projekteTone';

interface ProjectCloudSourcesCardProps {
  groupId: string;
  isAdmin: boolean;
  archived: boolean;
}

const ICON: Record<GroupCloudSource['provider'], 'cloud-outline' | 'logo-google'> = {
  wolke: 'cloud-outline',
  'google-drive': 'logo-google',
};

/**
 * „Wolke & Drive" (experimentell, #5945) wie im Web: Quellen, deren Dateien als
 * Projektwissen eingelesen und stündlich abgeglichen werden. Mitglieder sehen
 * die Quellen; Admins hängen einen Wolke-Ordner an, gleichen ab und trennen.
 * Drive-Dateien wählt man im Web — den Google Picker gibt es nur im Browser.
 */
export function ProjectCloudSourcesCard({
  groupId,
  isAdmin,
  archived,
}: ProjectCloudSourcesCardProps) {
  const theme = useTheme();
  const tone = useProjekteTone();
  const router = useRouter();
  const { data: sources = [] } = useGroupCloudSources(groupId);
  const sync = useSyncGroupCloudSource(groupId);
  const detach = useDetachGroupCloudSource(groupId);
  const [menuFor, setMenuFor] = useState<GroupCloudSource | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const canEdit = isAdmin && !archived;
  if (sources.length === 0 && !canEdit) return null;

  const notice = useNoticeStore.getState().show;

  // Erfolg spürt man (Haptik), die Zeile zeigt das Ergebnis; nur Fehler und Lücken melden sich.
  const runSync = (source: GroupCloudSource) =>
    sync.mutate(source.id, {
      onSuccess: (result) => {
        if (result.source.lastError) notice('error', result.source.lastError);
        else if (result.summary.failed > 0 || result.summary.pending > 0) {
          notice('warning', cloudSyncSummaryText(result.summary));
        } else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (error: Error) => notice('error', error.message),
    });

  const confirmDetach = (source: GroupCloudSource) =>
    Alert.alert(`„${source.name}" trennen?`, detachCloudSourceDescription(source), [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Trennen',
        style: 'destructive',
        onPress: () =>
          detach.mutate(source.id, {
            onSuccess: () =>
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
            onError: (error: Error) => notice('error', error.message),
          }),
      },
    ]);

  const handleSelect = (id: string) => {
    const source = menuFor;
    if (!source) return;
    // Das Menü-Sheet schließt noch; iOS zeigt im selben Tick keinen zweiten Dialog.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (id === SYNC_SOURCE_ID) runSync(source);
      else if (id === DETACH_SOURCE_ID) confirmDetach(source);
    }, SHEET_HANDOFF_MS);
  };

  const actions = buildCloudSourceActions(isAdmin, archived);

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Ionicons name="cloud-outline" size={18} color={tone.accent} />
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          Wolke & Drive
        </Text>
        <View style={[styles.badge, { borderColor: theme.textSecondary }]}>
          <Text style={[styles.badgeText, { color: theme.textSecondary }]}>Experimentell</Text>
        </View>
        <View style={styles.flex} />
        {canEdit ? (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(focused)/projekte/[id]/wolke', params: { id: groupId } })
            }
            accessibilityRole="button"
            accessibilityLabel="Wolke-Ordner verbinden"
            hitSlop={8}
            style={styles.add}
          >
            <Ionicons name="add" size={18} color={tone.accent} />
            <Text style={[styles.addText, { color: tone.accent }]}>Ordner</Text>
          </Pressable>
        ) : null}
      </View>
      {archived && sources.length > 0 ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Pausiert, solange das Projekt archiviert ist.
        </Text>
      ) : null}
      {sources.length === 0 ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Verbinde einen Nextcloud-Ordner: seine Dateien landen im Wissen und bleiben aktuell.
        </Text>
      ) : (
        sources.map((source) => {
          const syncing = sync.isPending && sync.variables === source.id;
          return (
            <View key={source.id} style={styles.row}>
              <Ionicons
                name={ICON[source.provider]}
                size={16}
                color={theme.textSecondary}
                style={styles.rowIcon}
              />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
                  {source.name}
                </Text>
                <Text
                  style={[
                    styles.status,
                    {
                      color:
                        source.lastError && !syncing ? colors.semantic.error : theme.textSecondary,
                    },
                  ]}
                >
                  {syncing
                    ? 'Wird abgeglichen …'
                    : cloudSourceStatusParts(source, (iso) => formatRelativeTime(iso))}
                </Text>
              </View>
              {actions.length > 0 ? (
                <Pressable
                  onPress={() => setMenuFor(source)}
                  accessibilityRole="button"
                  accessibilityLabel={`Aktionen für ${source.name}`}
                  hitSlop={8}
                  style={styles.more}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
      {canEdit ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Dateien aus Google Drive fügst du im Web hinzu.
        </Text>
      ) : null}
      <MenuActionSheet
        visible={menuFor !== null}
        theme={theme}
        actions={actions}
        onSelect={handleSelect}
        onClose={() => setMenuFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: BODY_FONT, fontSize: 11 },
  flex: { flex: 1 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  addText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowIcon: { marginTop: 3 },
  name: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  status: { fontFamily: BODY_FONT, fontSize: 12, marginTop: 2 },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10 },
  hint: { fontFamily: BODY_FONT, fontSize: 12 },
});
