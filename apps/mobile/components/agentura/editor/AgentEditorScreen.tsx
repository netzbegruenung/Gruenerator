import { type RecurringTask } from '@gruenerator/contracts';
import { type Agent, USER_SELECTABLE_TOOLS } from '@gruenerator/shared/agents';
import {
  EMPTY_FORM,
  describeRecurrence,
  DELIVERY_LABEL,
  formToPayload,
  hydrateFormState,
  recurrenceToSchedule,
  scheduleToRecurrence,
  useCreateRecurringTask,
  useCreateUserAgent,
  useDeleteUserAgent,
  useRecurringTasks,
  useUpdateRecurringTask,
  useUpdateUserAgent,
  useUserAgent,
} from '@gruenerator/shared/grueneratoren';
import { useAuth } from '@gruenerator/shared/hooks';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../hooks/useTheme';
import {
  useAgentEditorHydrated,
  useAgentEditorStore,
  type AgentEditorSession,
  type StartSessionInput,
} from '../../../stores/agentEditorStore';
import { BODY_FONT, borderRadius, colors, spacing, typography } from '../../../theme';
import { Button, ListRow, SkeletonRows } from '../../common';
import { AgentGlyph } from '../AgentGlyph';
import { CharCount, FieldInput, FormSection } from '../recipe-editor/FormParts';

import {
  countLabel,
  currentModelId,
  defaultScheduleFor,
  duplicateAgentInput,
  MAX_DESCRIPTION,
  MAX_TASK_INSTRUCTION,
  MAX_TITLE,
  missingForSave,
  MODEL_OPTIONS,
  newAgentIdentifier,
  taskInstructionTooLong,
} from './agentEditorLogic';
import { useNotebookChoices, useRecipeChoices } from './useEditorChoices';

const SUB = '/(focused)/grueneratoren/agent-editor';

type Params = { identifier?: string; mode?: string; taskId?: string };

const nonEmpty = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** Sitzung aus einem gespeicherten Agent samt seiner Aufgabe (falls es eine gibt). */
function sessionFromAgent(
  a: Agent,
  tasks: readonly RecurringTask[] | undefined,
  taskId: string | null,
  variant: AgentEditorSession['variant'],
  locale: Parameters<typeof defaultScheduleFor>[0]
): StartSessionInput {
  const list = tasks ?? [];
  const task =
    (taskId ? list.find((t) => t.id === taskId) : null) ??
    list.find((t) => t.agentIdentifier === a.identifier) ??
    null;
  return {
    identifier: a.identifier,
    variant,
    taskId: task?.id ?? null,
    form: hydrateFormState(a),
    schedule: task ? recurrenceToSchedule(task) : defaultScheduleFor(locale),
    dirty: false,
  };
}

function taskFields(s: AgentEditorSession) {
  return {
    title: s.form.title.trim(),
    instruction: s.form.systemRole.trim(),
    recurrence: scheduleToRecurrence(s.schedule),
    delivery: s.schedule.delivery,
    emailNotify: s.schedule.emailNotify,
    timezone: s.schedule.timezone,
  };
}

/**
 * Agent-Editor für Anlegen und Bearbeiten — eine gruppierte Formularseite, die
 * Unterseiten (Werkzeuge, Wissen, Rezept, Zeitplan …) schreiben in dieselbe
 * Sitzung (`agentEditorStore`). Gespeichert wird nur über „Speichern"; die
 * Sitzung liegt bis dahin auf dem Gerät.
 */
export function AgentEditorScreen() {
  const params = useLocalSearchParams<Params>();
  const identifier = nonEmpty(params.identifier);
  const paramVariant = params.mode === 'recurring' ? 'recurring' : 'agent';
  const paramTaskId = nonEmpty(params.taskId);
  const { locale } = useAuth();
  const hydrated = useAgentEditorHydrated();

  const agentQ = useUserAgent(identifier ?? undefined);
  const tasksQ = useRecurringTasks(identifier !== null);

  const session = useAgentEditorStore();
  const ready = session.active && session.identifier === identifier;
  // Ungespeicherte Arbeit an genau diesem Agent, die beim Öffnen schon auf dem Gerät lag.
  const [restoredAtOpen] = useState(() => {
    const s = useAgentEditorStore.getState();
    return identifier !== null && s.active && s.identifier === identifier && s.dirty;
  });
  const [restoredDismissed, setRestoredDismissed] = useState(false);
  const restored = restoredAtOpen && !restoredDismissed;
  const leavingRef = useRef(false);

  // Sitzung beginnen: beim Anlegen bringt die Startseite sie mit; beim
  // Bearbeiten aus dem Agent — außer es liegt ungespeicherte Arbeit an genau
  // diesem Agent auf dem Gerät.
  const agent = agentQ.data;
  const tasksSettled = !tasksQ.isPending;
  const tasks = tasksQ.data;
  useEffect(() => {
    if (!hydrated || leavingRef.current) return;
    const s = useAgentEditorStore.getState();
    if (identifier === null) {
      if (s.active && s.identifier === null) return;
      s.start({
        identifier: null,
        variant: paramVariant,
        taskId: null,
        form: { ...EMPTY_FORM, locale },
        schedule: defaultScheduleFor(locale),
        dirty: false,
      });
      return;
    }
    if (!agent || !tasksSettled) return;
    if (s.active && s.identifier === identifier && s.dirty) return;
    s.start(sessionFromAgent(agent, tasks, paramTaskId, paramVariant, locale));
  }, [hydrated, identifier, agent, tasksSettled, tasks, paramTaskId, paramVariant, locale]);

  if (identifier !== null && !ready) {
    if (agentQ.isError) {
      return (
        <Shell title="Agent bearbeiten">
          <StateMessage
            text="Der Agent konnte nicht geladen werden."
            action="Erneut versuchen"
            onAction={() => void agentQ.refetch()}
          />
        </Shell>
      );
    }
    if (agentQ.isSuccess && agent === null) {
      return (
        <Shell title="Agent bearbeiten">
          <StateMessage text="Diesen Agent gibt es nicht mehr." />
        </Shell>
      );
    }
    return (
      <Shell title="Agent bearbeiten">
        <View style={styles.loading}>
          <SkeletonRows count={5} leading={44} />
        </View>
      </Shell>
    );
  }
  if (!ready) {
    return (
      <Shell title="Neuer Agent">
        <View style={styles.loading}>
          <SkeletonRows count={5} leading={44} />
        </View>
      </Shell>
    );
  }

  return (
    <EditorForm
      session={session}
      savedAgent={agent ?? null}
      restored={restored}
      onDiscardRestored={() => {
        setRestoredDismissed(true);
        if (agent)
          useAgentEditorStore
            .getState()
            .start(sessionFromAgent(agent, tasks, paramTaskId, paramVariant, locale));
      }}
      leavingRef={leavingRef}
    />
  );
}

function EditorForm({
  session,
  savedAgent,
  restored,
  onDiscardRestored,
  leavingRef,
}: {
  session: AgentEditorSession;
  savedAgent: Agent | null;
  restored: boolean;
  onDiscardRestored: () => void;
  leavingRef: { current: boolean };
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const patch = useAgentEditorStore((s) => s.patch);
  const reset = useAgentEditorStore((s) => s.reset);

  const { form, schedule, identifier, variant, taskId } = session;
  const isEdit = identifier !== null;
  const showSchedule = variant === 'recurring' || taskId !== null;
  const writesTask = showSchedule;

  const createMut = useCreateUserAgent();
  const updateMut = useUpdateUserAgent(identifier ?? '');
  const deleteMut = useDeleteUserAgent();
  const createTaskMut = useCreateRecurringTask();
  const updateTaskMut = useUpdateRecurringTask();
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const notebooks = useNotebookChoices(form.defaultNotebookIds);
  const recipes = useRecipeChoices();

  const missing = missingForSave(form);
  const canSave = missing === null && !saving && !deleteMut.isPending;

  // Ungespeicherte Änderungen: vor dem Verlassen nachfragen.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current || !useAgentEditorStore.getState().dirty) return;
      e.preventDefault();
      Alert.alert(
        'Ungespeicherte Änderungen',
        'Dein Entwurf bleibt auf diesem Gerät, bis du ihn speicherst oder verwirfst.',
        [
          { text: 'Weiter bearbeiten', style: 'cancel' },
          {
            text: 'Entwurf behalten',
            onPress: () => {
              leavingRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
          {
            text: 'Verwerfen',
            style: 'destructive',
            onPress: () => {
              leavingRef.current = true;
              useAgentEditorStore.getState().reset();
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });
  }, [navigation, leavingRef]);

  const leave = (go: () => void) => {
    leavingRef.current = true;
    reset();
    go();
  };

  const handleSave = () => {
    const s = useAgentEditorStore.getState();
    const blocker = missingForSave(s.form);
    if (blocker) {
      Alert.alert('Noch nicht speicherbar', blocker);
      return;
    }
    if (writesTask && taskInstructionTooLong(s.form)) {
      Alert.alert(
        'Anleitung zu lang',
        `Die Anleitung ist zu lang für eine wiederkehrende Aufgabe (max. ${MAX_TASK_INSTRUCTION.toLocaleString('de-DE')} Zeichen). Bitte kürze sie.`
      );
      return;
    }
    setSaving(true);
    void saveSession(s, {
      createAgent: createMut.mutateAsync,
      updateAgent: updateMut.mutateAsync,
      createTask: createTaskMut.mutateAsync,
      updateTask: updateTaskMut.mutateAsync,
      author: user?.display_name || 'Eigener Agent',
    }).then((outcome) => {
      setSaving(false);
      switch (outcome.kind) {
        case 'failed':
          return Alert.alert(outcome.title, outcome.message);
        case 'task':
          return leave(() =>
            router.replace({
              pathname: '/(focused)/grueneratoren/aufgabe/[id]',
              params: { id: outcome.taskId },
            })
          );
        case 'agent':
          return leave(() =>
            router.replace({
              pathname: '/(focused)/grueneratoren/agent/[slug]',
              params: { slug: outcome.slug },
            })
          );
        case 'updated':
          return leave(() => router.back());
      }
    });
  };

  const handleDuplicate = () => {
    if (!savedAgent) return;
    Alert.alert(
      'Agent duplizieren?',
      session.dirty
        ? 'Kopiert wird der gespeicherte Stand. Deine ungespeicherten Änderungen hier gehen verloren.'
        : `Es entsteht „${savedAgent.title} (Kopie)", die du danach bearbeitest.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Duplizieren',
          onPress: () => {
            setDuplicating(true);
            createMut
              .mutateAsync(duplicateAgentInput(savedAgent))
              .then((copy) =>
                leave(() =>
                  router.replace({ pathname: SUB, params: { identifier: copy.identifier } })
                )
              )
              .catch((err: unknown) =>
                Alert.alert(
                  'Duplizieren fehlgeschlagen',
                  err instanceof Error ? err.message : 'Bitte versuche es erneut.'
                )
              )
              .finally(() => setDuplicating(false));
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!identifier) return;
    Alert.alert(`„${form.title || 'Agent'}" löschen?`, 'Liegt danach 30 Tage im Papierkorb.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          deleteMut
            .mutateAsync(identifier)
            .then(() => leave(() => router.dismissTo('/(focused)/agents')))
            .catch((err: unknown) =>
              Alert.alert(
                'Löschen fehlgeschlagen',
                err instanceof Error ? err.message : 'Bitte versuche es erneut.'
              )
            );
        },
      },
    ]);
  };

  const { toolCount, toolPreview, notebookPreview, greetingPreview, advancedPreview } = rowPreviews(
    form,
    notebooks.titleFor
  );
  const schedulePreview = `${describeRecurrence(scheduleToRecurrence(schedule))} · ${DELIVERY_LABEL[schedule.delivery]}`;

  const title = isEdit
    ? 'Agent bearbeiten'
    : variant === 'recurring'
      ? 'Neue wiederkehrende Aufgabe'
      : 'Neuer Agent';

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            saving ? (
              <ActivityIndicator color={theme.textGreen} accessibilityLabel="Wird gespeichert" />
            ) : (
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Speichern"
                accessibilityState={{ disabled: !canSave }}
                style={({ pressed }) => ({ opacity: !canSave ? 0.4 : pressed ? 0.6 : 1 })}
              >
                <Text style={[styles.headerAction, { color: theme.textGreen }]}>Speichern</Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xlarge }]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {restored ? (
          <View style={[styles.notice, { backgroundColor: theme.backgroundAlt }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              Ungespeicherte Änderungen von vorhin wiederhergestellt.
            </Text>
            <Pressable
              onPress={onDiscardRestored}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.noticeAction, { color: theme.textGreen }]}>Verwerfen</Text>
            </Pressable>
          </View>
        ) : null}

        <FormSection title="Name">
          <View style={styles.headRow}>
            <Pressable
              onPress={() => router.push(`${SUB}/icon`)}
              accessibilityRole="button"
              accessibilityLabel="Symbol ändern"
              style={({ pressed }) => [styles.iconSquare, { opacity: pressed ? 0.6 : 1 }]}
            >
              <AgentGlyph iconKey={form.iconKey} size={28} color={colors.white} />
            </Pressable>
            <FieldInput
              value={form.title}
              onChangeText={(t) => patch({ title: t })}
              maxLength={MAX_TITLE}
              placeholder="Gib deinem Agent einen Namen"
              accessibilityLabel="Name"
              style={styles.flex}
              returnKeyType="next"
            />
          </View>
        </FormSection>

        <FormSection title="Beschreibung">
          <FieldInput
            value={form.description}
            onChangeText={(t) => patch({ description: t })}
            maxLength={MAX_DESCRIPTION}
            placeholder="Beschreibe deinen Agent und wie er funktioniert"
            accessibilityLabel="Beschreibung"
            multiline
            style={styles.shortMultiline}
          />
        </FormSection>

        <FormSection
          title="Anleitung"
          footer={
            writesTask
              ? 'Die Anleitung ist zugleich die Anweisung der wiederkehrenden Aufgabe.'
              : 'Wie sich der Agent verhalten soll — Rolle, Ton, Vorgehen. Mindestens 10 Zeichen.'
          }
        >
          <FieldInput
            value={form.systemRole}
            onChangeText={(t) => patch({ systemRole: t })}
            placeholder="Du bist ein*e …"
            accessibilityLabel="Anleitung"
            multiline
            style={styles.longMultiline}
          />
          {writesTask ? <CharCount value={form.systemRole} max={MAX_TASK_INSTRUCTION} /> : null}
        </FormSection>

        <FormSection title="Fähigkeiten">
          <ListRow
            icon="construct-outline"
            title={countLabel('Werkzeuge', toolCount)}
            value={toolPreview}
            onPress={() => router.push(`${SUB}/werkzeuge`)}
          />
          <ListRow
            icon="library-outline"
            title={countLabel('Wissen', form.defaultNotebookIds.length)}
            value={notebookPreview}
            onPress={() => router.push(`${SUB}/wissen`)}
          />
          <ListRow
            icon="reader-outline"
            title="Standard-Rezept"
            value={recipes.titleFor(form) ?? 'Keins'}
            onPress={() => router.push(`${SUB}/rezept`)}
          />
          <ListRow
            icon="chatbubble-ellipses-outline"
            title="Begrüßung & Startfragen"
            value={greetingPreview}
            onPress={() => router.push(`${SUB}/begruessung`)}
          />
          <ListRow
            icon="options-outline"
            title="Erweitert"
            value={advancedPreview}
            onPress={() => router.push(`${SUB}/erweitert`)}
            last={!showSchedule}
          />
          {showSchedule ? (
            <ListRow
              icon="time-outline"
              title="Zeitplan"
              value={schedulePreview}
              onPress={() => router.push(`${SUB}/zeitplan`)}
              last
            />
          ) : null}
        </FormSection>

        {missing ? (
          <Text
            style={[styles.hint, { color: theme.textSecondary }]}
            accessibilityLiveRegion="polite"
          >
            Zum Speichern fehlt noch etwas: {missing}
          </Text>
        ) : null}

        {isEdit ? (
          <FormSection>
            <ListRow
              icon="copy-outline"
              title="Duplizieren"
              onPress={handleDuplicate}
              disabled={!savedAgent || duplicating || saving}
              {...(duplicating && { accessory: <ActivityIndicator color={theme.textGreen} /> })}
            />
            <ListRow
              icon="trash-outline"
              title="Löschen"
              onPress={handleDelete}
              disabled={deleteMut.isPending || saving}
              {...(deleteMut.isPending && {
                accessory: <ActivityIndicator color={colors.error[600]} />,
              })}
              destructive
              last
            />
          </FormSection>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      {children}
    </>
  );
}

function StateMessage({
  text,
  action,
  onAction,
}: {
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <Text style={[styles.stateText, { color: theme.textSecondary }]}>{text}</Text>
      {action && onAction ? (
        <Button variant="outline" onPress={onAction}>
          {action}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: spacing.medium,
    gap: spacing.large,
  },
  loading: { padding: spacing.medium },
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
  headerAction: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    fontWeight: '600',
  },
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
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.small,
  },
  iconSquare: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary[600],
  },
  shortMultiline: { minHeight: 72 },
  longMultiline: { minHeight: 220 },
  hint: {
    ...typography.caption,
    paddingHorizontal: spacing.xsmall,
  },
});

type SaveOutcome =
  | { kind: 'task'; taskId: string }
  | { kind: 'agent'; slug: string }
  | { kind: 'updated' }
  | { kind: 'failed'; title: string; message: string };

interface SaveDeps {
  createAgent: ReturnType<typeof useCreateUserAgent>['mutateAsync'];
  updateAgent: ReturnType<typeof useUpdateUserAgent>['mutateAsync'];
  createTask: ReturnType<typeof useCreateRecurringTask>['mutateAsync'];
  updateTask: ReturnType<typeof useUpdateRecurringTask>['mutateAsync'];
  author: string;
}

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : 'Speichern fehlgeschlagen.';

/**
 * Speichert die Sitzung: Agent anlegen oder ändern, dann die Aufgabe. Steht
 * außerhalb der Komponente, weil der React Compiler `try` mit bedingten
 * Ausdrücken nicht übersetzt (`test/reactCompilerCoverage.vitest.ts`).
 *
 * Die ID eines schon angelegten Agents bleibt in der Sitzung — scheitert danach
 * nur die Aufgabe, legt ein zweiter Versuch keinen zweiten Agent an.
 */
async function saveSession(
  s: AgentEditorSession & { setCreatedIdentifier: (identifier: string) => void },
  deps: SaveDeps
): Promise<SaveOutcome> {
  const payload = formToPayload(s.form);
  try {
    if (s.identifier === null) {
      let agentId = s.createdIdentifier;
      if (!agentId) {
        const created = await deps.createAgent({
          identifier: newAgentIdentifier(s.form.title),
          author: deps.author,
          ...payload,
        });
        agentId = created.identifier;
        s.setCreatedIdentifier(agentId);
      }
      if (s.variant !== 'recurring') return { kind: 'agent', slug: agentId };
      try {
        const task = await deps.createTask({
          ...taskFields(s),
          agentIdentifier: agentId,
          locale: s.form.locale,
          enabled: true,
        });
        return { kind: 'task', taskId: task.id };
      } catch (err) {
        return {
          kind: 'failed',
          title: 'Zeitplan nicht gespeichert',
          message: `Der Agent ist angelegt, aber der Zeitplan konnte nicht gespeichert werden. Bitte erneut speichern.\n\n${errorText(err)}`,
        };
      }
    }

    await deps.updateAgent(payload);
    if (s.taskId) {
      await deps.updateTask({ id: s.taskId, patch: taskFields(s) });
    } else if (s.variant === 'recurring') {
      await deps.createTask({
        ...taskFields(s),
        agentIdentifier: s.identifier,
        locale: s.form.locale,
        enabled: true,
      });
    }
    return { kind: 'updated' };
  } catch (err) {
    return { kind: 'failed', title: 'Speichern fehlgeschlagen', message: errorText(err) };
  }
}

/**
 * Die Wert-Vorschauen der Unterseiten-Zeilen. Außerhalb der Komponente, weil der
 * React Compiler Ternäre in `… || 'Keine'`-Ketten nicht übersetzt.
 */
function rowPreviews(
  form: AgentEditorSession['form'],
  notebookTitle: (id: string) => string | null
) {
  const toolCount = form.enabledTools.length + (form.inlineSourceLinks ? 1 : 0);
  const toolPreview =
    USER_SELECTABLE_TOOLS.filter((t) => form.enabledTools.includes(t.key))
      .map((t) => t.label)
      .concat(form.inlineSourceLinks ? ['Quell-Links'] : [])
      .join(', ') || 'Keine';
  const notebookPreview =
    form.defaultNotebookIds
      .map(notebookTitle)
      .filter((t): t is string => t !== null)
      .join(', ') ||
    (form.defaultNotebookIds.length ? `${form.defaultNotebookIds.length} gewählt` : 'Keins');
  const questionCount = form.openingQuestions.split('\n').filter((q) => q.trim()).length;
  const greetingPreview =
    [
      form.openingMessage.trim() ? form.openingMessage.trim().split('\n')[0] : null,
      questionCount ? `${questionCount} Startfrage${questionCount === 1 ? '' : 'n'}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Keine';
  const modelName = MODEL_OPTIONS.find((m) => m.id === currentModelId(form))?.name ?? form.model;
  const tagCount = form.tags.split(',').filter((t) => t.trim()).length;
  const advancedPreview = [
    form.locale === 'de-AT' ? 'Österreich' : 'Deutschland',
    modelName,
    tagCount ? `${tagCount} Tag${tagCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { toolCount, toolPreview, notebookPreview, greetingPreview, advancedPreview };
}
