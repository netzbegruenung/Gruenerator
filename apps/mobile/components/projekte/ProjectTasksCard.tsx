import { describeRecurrence, useRecurringTasks } from '@gruenerator/shared/grueneratoren';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';

import { useProjekteTone } from './projekteTone';

const SHOWN = 3;

/**
 * „Geplant“ wie im Web (`ProjectTasksCard`): die wiederkehrenden Aufgaben der
 * Person in diesem Projekt — die Aufgabe gehört der Person, nicht dem Projekt,
 * andere Mitglieder sehen ihre eigenen. „+ Aufgabe“ öffnet den Editor mit
 * vorgewähltem Projekt. Experimentell und standardmäßig aus
 * (`profiles.scheduled_tasks_enabled`, Web: Einstellungen → Experimentell).
 *
 * `archived`: ein archiviertes Projekt nimmt nichts Neues an, also keine neue
 * Aufgabe; seine Aufgaben ruhen (der Scheduler überspringt sie, #5951).
 */
export function ProjectTasksCard({ groupId, archived }: { groupId: string; archived: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const enabled = useAuth().user?.scheduled_tasks_enabled === true;
  const { data: tasks = [] } = useRecurringTasks(enabled);
  if (!enabled) return null;
  const own = tasks.filter((t) => t.groupId === groupId);

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          Geplant
        </Text>
        {archived ? null : (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(focused)/grueneratoren/aufgabe/neu',
                params: { projekt: groupId },
              })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Neue Aufgabe für dieses Projekt"
            style={styles.add}
          >
            <Ionicons name="add" size={18} color={tone.accent} />
            <Text style={[styles.addText, { color: tone.accent }]}>Aufgabe</Text>
          </Pressable>
        )}
      </View>
      {archived && own.length > 0 ? (
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          Pausiert, solange das Projekt archiviert ist.
        </Text>
      ) : null}
      {own.length === 0 ? (
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Lass den Grünerator regelmäßig etwas für dieses Projekt tun.
        </Text>
      ) : (
        <>
          {own.slice(0, SHOWN).map((task) => (
            <Pressable
              key={task.id}
              onPress={() =>
                router.push({
                  pathname: '/(focused)/grueneratoren/aufgabe/[id]',
                  params: { id: task.id },
                })
              }
              accessibilityRole="button"
              style={styles.row}
            >
              <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {describeRecurrence(task.recurrence)}
                {task.enabled && !archived ? '' : ' · pausiert'}
              </Text>
            </Pressable>
          ))}
          {own.length > SHOWN ? (
            <Pressable
              onPress={() => router.push('/(focused)/agents')}
              accessibilityRole="button"
              style={styles.row}
            >
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                Alle {own.length} Aufgaben
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flex: 1, fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36, paddingLeft: 4 },
  addText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  note: { fontFamily: BODY_FONT, fontSize: 15, paddingVertical: 4 },
  row: { minHeight: 44, justifyContent: 'center', paddingVertical: 6 },
  rowTitle: { fontFamily: BODY_FONT, fontSize: 15 },
  meta: { fontFamily: BODY_FONT, fontSize: 12 },
});
