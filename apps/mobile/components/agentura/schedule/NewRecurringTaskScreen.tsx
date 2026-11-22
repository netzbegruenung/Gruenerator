import { MAX_RECURRING_TASK_INSTRUCTION, type ScheduleFrequency } from '@gruenerator/contracts';
import {
  DELIVERY_LABEL,
  TIMEZONES,
  WEEKDAYS,
  scheduleToRecurrence,
  useCreateRecurringTask,
  useMyGroupsForSharing,
} from '@gruenerator/shared/grueneratoren';
import { useAuth } from '@gruenerator/shared/hooks';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../../theme';
import { Button, ChipGroup, ListRow } from '../../common';
import { SegmentedControl } from '../../common/SegmentedControl';
import { defaultScheduleFor } from '../editor/agentEditorLogic';
import { RowSwitch } from '../editor/EditorSubPage';
import { CharCount, FieldInput, FormSection } from '../recipe-editor/FormParts';

import { MonthDayStepper } from './MonthDayStepper';
import { TimeRow } from './TimeRow';

const FREQUENCIES = [
  { value: 'daily', label: 'Täglich', short: 'Täglich', disabled: false },
  { value: 'weekly', label: 'Wöchentlich', short: 'Wöchentlich', disabled: false },
  { value: 'monthly', label: 'Monatlich', short: 'Monatlich', disabled: false },
];
const WEEKDAY_OPTIONS = WEEKDAYS.map((label, day) => ({ id: String(day), label }));
const DELIVERIES = ['document', 'thread'] as const;

/**
 * Neue wiederkehrende Aufgabe ohne Agent (#5939): Titel, Anweisung, Takt,
 * Lieferung und optional ein Projekt (`?projekt=<id>` wählt es vor).
 */
export function NewRecurringTaskScreen() {
  const insets = useSafeAreaInsets();
  const { locale } = useAuth();
  const { projekt } = useLocalSearchParams<{ projekt?: string }>();
  const create = useCreateRecurringTask();
  const { data: projects = [] } = useMyGroupsForSharing(true);

  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [groupId, setGroupId] = useState<string | null>(projekt ?? null);
  const [schedule, setSchedule] = useState(() => defaultScheduleFor(locale));
  const patch = (p: Partial<typeof schedule>) => setSchedule((s) => ({ ...s, ...p }));

  const canSave = title.trim().length > 0 && instruction.trim().length > 0 && !create.isPending;

  const save = () => {
    create
      .mutateAsync({
        title: title.trim(),
        instruction: instruction.trim(),
        agentIdentifier: null,
        groupId,
        recurrence: scheduleToRecurrence(schedule),
        delivery: schedule.delivery,
        emailNotify: schedule.emailNotify,
        timezone: schedule.timezone,
        locale,
        enabled: true,
      })
      .then((task) =>
        router.replace({
          pathname: '/(focused)/grueneratoren/aufgabe/[id]',
          params: { id: task.id },
        })
      )
      .catch((err: unknown) =>
        Alert.alert(
          'Speichern fehlgeschlagen',
          err instanceof Error ? err.message : 'Bitte versuche es erneut.'
        )
      );
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen options={{ title: 'Neue wiederkehrende Aufgabe' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xlarge }]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <FormSection title="Titel">
          <FieldInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder="z. B. Wochenüberblick Kommunalpolitik"
            accessibilityLabel="Titel"
          />
        </FormSection>

        <FormSection title="Anweisung" footer="Was der Grünerator bei jedem Lauf tun soll.">
          <FieldInput
            value={instruction}
            onChangeText={setInstruction}
            multiline
            accessibilityLabel="Anweisung"
          />
          <CharCount value={instruction} max={MAX_RECURRING_TASK_INSTRUCTION} />
        </FormSection>

        <FormSection
          title="Projekt (optional)"
          footer="Mit Projekt gelten dessen Anweisungen, Dateien, Notebooks und Rezepte im Lauf, und ein Ergebnis im Chat landet im Projekt."
        >
          <ListRow
            dense
            title="Kein Projekt"
            selected={groupId === null}
            onPress={() => setGroupId(null)}
            last={projects.length === 0}
          />
          {projects.map((p, i) => (
            <ListRow
              key={p.id}
              dense
              title={p.name}
              selected={groupId === p.id}
              onPress={() => setGroupId(p.id)}
              last={i === projects.length - 1}
            />
          ))}
        </FormSection>

        <FormSection title="Häufigkeit">
          <View style={styles.padded}>
            <SegmentedControl
              options={FREQUENCIES}
              value={schedule.frequency}
              onChange={(v) => patch({ frequency: v as ScheduleFrequency })}
              accessibilityLabel="Häufigkeit"
            />
          </View>
        </FormSection>

        {schedule.frequency === 'weekly' ? (
          <FormSection title="Wochentage" footer="Mindestens ein Tag.">
            <View style={styles.padded}>
              <ChipGroup<string>
                options={WEEKDAY_OPTIONS}
                multiSelect
                selected={schedule.byweekday.map(String)}
                onSelect={(next) => {
                  const days = (Array.isArray(next) ? next : [next]).map(Number);
                  if (days.length === 0) return;
                  patch({ byweekday: days.sort((a, b) => a - b) });
                }}
              />
            </View>
          </FormSection>
        ) : null}

        {schedule.frequency === 'monthly' ? (
          <FormSection title="Tag im Monat">
            <MonthDayStepper
              value={schedule.bymonthday}
              onChange={(day) => patch({ bymonthday: day })}
            />
          </FormSection>
        ) : null}

        <FormSection title="Uhrzeit">
          <TimeRow
            hour={schedule.hour}
            minute={schedule.minute}
            onChange={(hour, minute) => patch({ hour, minute })}
            last
          />
        </FormSection>

        <FormSection title="Zeitzone">
          {TIMEZONES.map((tz, i) => (
            <ListRow
              key={tz.value}
              dense
              title={tz.label}
              selected={schedule.timezone === tz.value}
              onPress={() => patch({ timezone: tz.value })}
              last={i === TIMEZONES.length - 1}
            />
          ))}
        </FormSection>

        <FormSection title="Lieferung" footer="Wohin das Ergebnis eines Laufs kommt.">
          {DELIVERIES.map((d, i) => (
            <ListRow
              key={d}
              dense
              title={DELIVERY_LABEL[d]}
              selected={schedule.delivery === d}
              onPress={() => patch({ delivery: d })}
              last={i === DELIVERIES.length - 1}
            />
          ))}
        </FormSection>

        <FormSection footer="In der App wirst du immer benachrichtigt.">
          <ListRow
            dense
            title="Zusätzlich per E-Mail benachrichtigen"
            onPress={() => patch({ emailNotify: !schedule.emailNotify })}
            accessory={
              <RowSwitch
                value={schedule.emailNotify}
                onValueChange={(v) => patch({ emailNotify: v })}
                label="Zusätzlich per E-Mail benachrichtigen"
              />
            }
            last
          />
        </FormSection>

        <Button variant="primary" onPress={save} disabled={!canSave} loading={create.isPending}>
          Speichern
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.medium, gap: spacing.large },
  padded: { padding: spacing.small },
});
