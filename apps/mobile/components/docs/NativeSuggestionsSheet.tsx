import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  Alert,
} from 'react-native';

import {
  useDocsEditorBridgeStore,
  type DocSuggestionItem,
  type SuggestionKind,
} from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  canEdit: boolean;
}

const KIND_META: Record<SuggestionKind, { label: string; icon: IoniconsIconName; color: string }> =
  {
    insertion: { label: 'Einfügung', icon: 'add-circle-outline', color: colors.primary[600] },
    deletion: { label: 'Löschung', icon: 'trash-outline', color: colors.error[500] },
    modification: { label: 'Formatierung', icon: 'create-outline', color: '#f59e0b' },
  };

function primaryKind(kinds: SuggestionKind[]): SuggestionKind {
  if (kinds.includes('deletion')) return 'deletion';
  if (kinds.includes('insertion')) return 'insertion';
  return kinds[0] ?? 'modification';
}

// Compact German relative time (mirrors the web sidebar's formatRelativeTime feel
// without pulling the shared util into the native bundle).
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.round(hours / 24);
  return `vor ${days} d`;
}

export function NativeSuggestionsSheet({ visible, onClose, canEdit }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const suggestions = useDocsEditorBridgeStore((s) => s.suggestions);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);

  const confirmAll = (mode: 'accept' | 'reject') => {
    Alert.alert(
      mode === 'accept' ? 'Alle Änderungen annehmen?' : 'Alle Änderungen ablehnen?',
      mode === 'accept'
        ? 'Alle vorgeschlagenen Änderungen werden übernommen.'
        : 'Alle vorgeschlagenen Änderungen werden verworfen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: mode === 'accept' ? 'Annehmen' : 'Ablehnen',
          style: mode === 'reject' ? 'destructive' : 'default',
          onPress: () =>
            dispatchAction({
              type: mode === 'accept' ? 'accept-all-suggestions' : 'reject-all-suggestions',
            }),
        },
      ]
    );
  };

  const jumpTo = (s: DocSuggestionItem) => {
    dispatchAction({ type: 'select-suggestion', id: s.id });
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Änderungen</Text>
        <View style={{ width: 22 }} />
      </View>

      {canEdit && suggestions.length > 0 && (
        <View style={styles.bulkRow}>
          <TouchableOpacity
            style={[styles.bulkBtn, { borderColor: isDark ? colors.grey[700] : colors.grey[300] }]}
            onPress={() => confirmAll('accept')}
            activeOpacity={0.6}
          >
            <Ionicons name="checkmark" size={16} color={colors.primary[600]} />
            <Text style={[styles.bulkBtnText, { color: colors.primary[600] }]}>Alle annehmen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkBtn, { borderColor: isDark ? colors.grey[700] : colors.grey[300] }]}
            onPress={() => confirmAll('reject')}
            activeOpacity={0.6}
          >
            <Ionicons name="close" size={16} color={theme.textSecondary} />
            <Text style={[styles.bulkBtnText, { color: theme.text }]}>Alle ablehnen</Text>
          </TouchableOpacity>
        </View>
      )}

      {suggestions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Keine offenen Änderungsvorschläge.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {suggestions.map((s) => {
            const kind = KIND_META[primaryKind(s.kinds)];
            return (
              <View key={s.id} style={styles.row}>
                <TouchableOpacity
                  style={styles.rowMain}
                  onPress={() => jumpTo(s)}
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.kindIcon,
                      { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] },
                    ]}
                  >
                    <Ionicons name={kind.icon} size={15} color={kind.color} />
                  </View>
                  <View style={styles.rowContent}>
                    <View style={styles.rowTitleLine}>
                      <Text style={[styles.rowTitle, { color: theme.text }]}>{kind.label}</Text>
                      {s.meta?.color && (
                        <View style={[styles.authorDot, { backgroundColor: s.meta.color }]} />
                      )}
                    </View>
                    {!!s.excerpt && (
                      <Text
                        style={[styles.rowExcerpt, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {`„${s.excerpt}“`}
                      </Text>
                    )}
                    <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {s.meta?.name ?? 'Unbekannt'}
                      {s.meta?.createdAt ? ` · ${formatRelativeTime(s.meta.createdAt)}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
                {canEdit && (
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={() => dispatchAction({ type: 'accept-suggestion', id: s.id })}
                      hitSlop={6}
                      style={styles.actionBtn}
                    >
                      <Text style={[styles.actionText, { color: colors.primary[600] }]}>
                        Annehmen
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => dispatchAction({ type: 'reject-suggestion', id: s.id })}
                      hitSlop={6}
                      style={styles.actionBtn}
                    >
                      <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                        Ablehnen
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {canEdit && (
        <TouchableOpacity
          style={styles.endBtn}
          onPress={() => {
            dispatchAction({ type: 'set-suggestion-mode', enabled: false });
            onClose();
          }}
          activeOpacity={0.6}
        >
          <Ionicons name="git-compare-outline" size={18} color={theme.textSecondary} />
          <Text style={[styles.endBtnText, { color: theme.textSecondary }]}>
            Änderungsmodus beenden
          </Text>
        </TouchableOpacity>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },

  bulkRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  bulkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  bulkBtnText: { fontSize: 13, fontWeight: '600' },

  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14 },

  list: { paddingHorizontal: 12, maxHeight: 400 },
  row: { paddingHorizontal: 8, paddingVertical: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  kindIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  authorDot: { width: 8, height: 8, borderRadius: 4 },
  rowExcerpt: { fontSize: 12, marginTop: 1 },
  rowSub: { fontSize: 11, marginTop: 1 },
  rowActions: { flexDirection: 'row', gap: 16, paddingLeft: 38, marginTop: 6 },
  actionBtn: { paddingVertical: 2 },
  actionText: { fontSize: 13, fontWeight: '600' },

  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 12,
  },
  endBtnText: { fontSize: 13, fontWeight: '500' },
});
