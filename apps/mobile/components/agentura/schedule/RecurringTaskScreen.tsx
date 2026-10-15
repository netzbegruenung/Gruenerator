import { type RecurringTask } from '@gruenerator/contracts';
import {
  DELIVERY_LABEL,
  describeRecurrence,
  useDeleteRecurringTask,
  useRecurringTasks,
  useUpdateRecurringTask,
} from '@gruenerator/shared/grueneratoren';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../../theme';
import { actionUrlToRoute } from '../../../utils/actionUrl';
import { Button, ListRow, SkeletonRows } from '../../common';
import { RowSwitch } from '../editor/EditorSubPage';
import { FormSection } from '../recipe-editor/FormParts';

import { formatDateTime, RunHistory } from './RunHistory';
import { useTaskRunNow, type RunNowState } from './useTaskRunNow';

/** Detailseite einer wiederkehrenden Aufgabe: Zustand, Steuerung, Verlauf. */
export function RecurringTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const tasksQ = useRecurringTasks();
  const task = tasksQ.data?.find((t) => t.id === id) ?? null;

  if (tasksQ.isPending) {
    return (
      <Frame title="Wiederkehrende Aufgabe">
        <View style={styles.padded}>
          <SkeletonRows count={5} leading={44} />
        </View>
      </Frame>
    );
  }
  if (tasksQ.isError) {
    return (
      <Frame title="Wiederkehrende Aufgabe">
        <View style={styles.centered}>
          <Text style={[styles.stateText, { color: theme.textSecondary }]}>
            Die Aufgabe konnte nicht geladen werden.
          </Text>
          <Button variant="outline" onPress={() => void tasksQ.refetch()}>
            Erneut versuchen
          </Button>
        </View>
      </Frame>
    );
  }
  if (!task) {
    return (
      <Frame title="Wiederkehrende Aufgabe">
        <View style={styles.centered}>
          <Text style={[styles.stateText, { color: theme.textSecondary }]}>
            Diese Aufgabe gibt es nicht mehr.
          </Text>
        </View>
      </Frame>
    );
  }
  return <TaskDetail task={task} />;
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      {children}
    </>
  );
}

function TaskDetail({ task }: { task: RecurringTask }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const update = useUpdateRecurringTask();
  const remove = useDeleteRecurringTask();
  // Ein fertiger Lauf ändert „Zuletzt"/„Nächste" — die Liste neu holen.
  const refreshTasks = useCallback(
    () => void qc.invalidateQueries({ queryKey: ['recurring-tasks'] }),
    [qc]
  );
  const run = useTaskRunNow(task.id, refreshTasks);

  const setEnabled = (enabled: boolean) =>
    update.mutate(
      { id: task.id, patch: { enabled } },
      {
        onError: (err) =>
          Alert.alert(
            'Nicht gespeichert',
            err instanceof Error ? err.message : 'Bitte versuche es erneut.'
          ),
      }
    );

  const startRun = () => {
    run
      .start()
      .catch((err: unknown) =>
        Alert.alert(
          'Ausführen fehlgeschlagen',
          err instanceof Error ? err.message : 'Bitte versuche es erneut.'
        )
      );
  };

  const confirmDelete = () =>
    Alert.alert(
      'Wiederkehrende Aufgabe löschen?',
      `„${task.title}" wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () =>
            remove
              .mutateAsync(task.id)
              .then(() => router.back())
              .catch((err: unknown) =>
                Alert.alert(
                  'Löschen fehlgeschlagen',
                  err instanceof Error ? err.message : 'Bitte versuche es erneut.'
                )
              ),
        },
      ]
    );

  const autoPaused = !task.enabled && task.pausedReason === 'auto_failures';
  const statusValue = task.enabled
    ? 'Läuft nach Zeitplan'
    : autoPaused
      ? 'Nach drei Fehlschlägen in Folge automatisch angehalten. Prüfe die Anleitung und aktiviere die Aufgabe wieder.'
      : 'Pausiert';

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xlarge }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: 'Wiederkehrende Aufgabe' }} />

      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {task.title}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {describeRecurrence(task.recurrence)} · {DELIVERY_LABEL[task.delivery]}
        </Text>
      </View>

      <FormSection title="Status">
        <ListRow
          icon={
            task.enabled
              ? 'play-circle-outline'
              : autoPaused
                ? 'warning-outline'
                : 'pause-circle-outline'
          }
          title="Aktiv"
          value={statusValue}
          valueLines={4}
          onPress={() => setEnabled(!task.enabled)}
          disabled={update.isPending}
          accessory={
            update.isPending ? (
              <ActivityIndicator color={theme.textGreen} />
            ) : (
              <RowSwitch value={task.enabled} onValueChange={setEnabled} label="Aktiv" />
            )
          }
        />
        <ListRow
          icon="calendar-outline"
          title="Nächste Ausführung"
          value={task.enabled ? formatDateTime(task.nextRunAt) : 'Pausiert'}
        />
        <ListRow
          icon="time-outline"
          title="Letzte Ausführung"
          value={task.lastRunAt ? formatDateTime(task.lastRunAt) : 'Noch nie'}
          last
        />
      </FormSection>

      <View style={styles.runBlock}>
        <Button onPress={startRun} loading={run.isBusy} disabled={run.isBusy}>
          Jetzt ausführen
        </Button>
        <RunNotice state={run.state} delivery={task.delivery} onDismiss={run.dismiss} />
      </View>

      <FormSection>
        {task.agentIdentifier ? (
          <ListRow
            icon="create-outline"
            title="Bearbeiten"
            value="Anleitung, Werkzeuge und Zeitplan"
            onPress={() =>
              router.push({
                pathname: '/(focused)/grueneratoren/agent-editor',
                params: { identifier: task.agentIdentifier ?? '', taskId: task.id },
              })
            }
          />
        ) : null}
        <ListRow
          icon="trash-outline"
          title="Löschen"
          onPress={confirmDelete}
          disabled={remove.isPending}
          {...(remove.isPending && { accessory: <ActivityIndicator color={colors.error[600]} /> })}
          destructive
          last
        />
      </FormSection>

      <RunHistory runsQ={run.runsQ} delivery={task.delivery} />
    </ScrollView>
  );
}

function RunNotice({
  state,
  delivery,
  onDismiss,
}: {
  state: RunNowState;
  delivery: RecurringTask['delivery'];
  onDismiss: () => void;
}) {
  const theme = useTheme();
  if (state.kind === 'idle') return null;

  let text: string;
  let action: { label: string; onPress: () => void } | null = null;
  if (state.kind === 'waiting') {
    text = 'Lauf gestartet — das Ergebnis kommt in wenigen Minuten.';
  } else if (state.kind === 'timeout') {
    text = 'Der Lauf dauert länger — du bekommst eine Benachrichtigung, sobald er fertig ist.';
  } else if (state.run.status === 'empty') {
    text = 'Der Lauf hat nichts Neues ergeben.';
  } else if (state.run.status === 'failed') {
    text = `Lauf fehlgeschlagen${state.run.error ? `: ${state.run.error}` : '.'}`;
  } else {
    text = 'Ergebnis fertig.';
    const url = state.run.resultUrl;
    if (url) {
      action = {
        label: delivery === 'thread' ? 'Chat öffnen' : 'Öffnen',
        onPress: () => router.push(actionUrlToRoute(url)),
      };
    }
  }

  return (
    <View
      style={[styles.notice, { backgroundColor: theme.backgroundAlt }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={[styles.noticeText, { color: theme.text }]}>{text}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[styles.noticeAction, { color: theme.textGreen }]}>{action.label}</Text>
        </Pressable>
      ) : null}
      {state.kind !== 'waiting' ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Hinweis schließen"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[styles.noticeAction, { color: theme.textSecondary }]}>OK</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.medium,
    gap: spacing.large,
  },
  padded: { padding: spacing.medium },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.large,
  },
  stateText: {
    ...typography.body,
    textAlign: 'center',
  },
  head: {
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
  },
  title: { ...typography.h3 },
  subtitle: { ...typography.bodySmall },
  runBlock: { gap: spacing.small },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.small,
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
  },
  noticeText: {
    ...typography.bodySmall,
    flex: 1,
  },
  noticeAction: {
    ...typography.buttonSmall,
  },
});
