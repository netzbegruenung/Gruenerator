import { personInitials, type GroupMember } from '@gruenerator/shared/groups';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';

import { useProjekteTone } from './projekteTone';

const PREVIEW = 4;

/** Nur für Gruppen mit mehr als einer Person; „Alle anzeigen“ führt zur Info-Seite. */
export function ProjectMembersPreview({
  members,
  onShowAll,
}: {
  members: GroupMember[];
  onShowAll: () => void;
}) {
  const theme = useTheme();
  const tone = useProjekteTone();
  if (members.length < 2) return null;
  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          Mitglieder
        </Text>
        <Text style={[styles.count, { color: theme.textSecondary }]}>{members.length}</Text>
      </View>
      {members.slice(0, PREVIEW).map((m) => {
        const name = m.display_name || m.first_name || 'Mitglied';
        return (
          <View key={m.user_id} style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: tone.soft }]}>
              <Text style={[styles.initials, { color: tone.accent }]}>{personInitials(name)}</Text>
            </View>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {name}
            </Text>
            {m.role === 'admin' ? (
              <Text style={[styles.role, { color: theme.textSecondary }]}>Admin</Text>
            ) : null}
          </View>
        );
      })}
      <Pressable onPress={onShowAll} accessibilityRole="button" style={styles.all}>
        <Text style={[styles.allText, { color: tone.accent }]}>
          {members.length > PREVIEW ? `Alle ${members.length} anzeigen` : 'Mitglieder anzeigen'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  count: { fontFamily: BODY_FONT, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: BODY_FONT, fontSize: 12, fontWeight: '700' },
  name: { flex: 1, minWidth: 0, fontFamily: BODY_FONT, fontSize: 15 },
  role: { fontFamily: BODY_FONT, fontSize: 13 },
  all: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  allText: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
});
