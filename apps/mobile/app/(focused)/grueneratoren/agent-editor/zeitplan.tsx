import { type ScheduleFrequency } from '@gruenerator/contracts';
import { DELIVERY_LABEL, TIMEZONES, WEEKDAYS } from '@gruenerator/shared/grueneratoren';
import { StyleSheet, View } from 'react-native';

import { EditorSubPage, RowSwitch } from '../../../../components/agentura/editor/EditorSubPage';
import { FormSection } from '../../../../components/agentura/recipe-editor/FormParts';
import { MonthDayStepper } from '../../../../components/agentura/schedule/MonthDayStepper';
import { TimeRow } from '../../../../components/agentura/schedule/TimeRow';
import { ChipGroup, ListRow } from '../../../../components/common';
import { SegmentedControl } from '../../../../components/common/SegmentedControl';
import { useAgentEditorStore } from '../../../../stores/agentEditorStore';
import { spacing } from '../../../../theme';

const FREQUENCIES = [
  { value: 'daily', label: 'Täglich', short: 'Täglich', disabled: false },
  { value: 'weekly', label: 'Wöchentlich', short: 'Wöchentlich', disabled: false },
  { value: 'monthly', label: 'Monatlich', short: 'Monatlich', disabled: false },
];

const WEEKDAY_OPTIONS = WEEKDAYS.map((label, day) => ({ id: String(day), label }));

/** Lieferarten, die der Editor anbietet; `summary` ist Altbestand. */
const DELIVERIES = ['document', 'thread'] as const;

export default function AgentSchedulePage() {
  const schedule = useAgentEditorStore((s) => s.schedule);
  const patchSchedule = useAgentEditorStore((s) => s.patchSchedule);

  return (
    <EditorSubPage title="Zeitplan">
      <FormSection
        title="Häufigkeit"
        footer="Wann und wie oft der Agent automatisch läuft. Ausgeführt wird dabei die Anleitung des Agents."
      >
        <View style={styles.padded}>
          <SegmentedControl
            options={FREQUENCIES}
            value={schedule.frequency}
            onChange={(v) => patchSchedule({ frequency: v as ScheduleFrequency })}
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
                patchSchedule({ byweekday: days.sort((a, b) => a - b) });
              }}
            />
          </View>
        </FormSection>
      ) : null}

      {schedule.frequency === 'monthly' ? (
        <FormSection title="Tag im Monat">
          <MonthDayStepper
            value={schedule.bymonthday}
            onChange={(day) => patchSchedule({ bymonthday: day })}
          />
        </FormSection>
      ) : null}

      <FormSection title="Uhrzeit">
        <TimeRow
          hour={schedule.hour}
          minute={schedule.minute}
          onChange={(hour, minute) => patchSchedule({ hour, minute })}
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
            onPress={() => patchSchedule({ timezone: tz.value })}
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
            onPress={() => patchSchedule({ delivery: d })}
            last={i === DELIVERIES.length - 1}
          />
        ))}
      </FormSection>

      <FormSection footer="In der App wirst du immer benachrichtigt.">
        <ListRow
          dense
          title="Zusätzlich per E-Mail benachrichtigen"
          onPress={() => patchSchedule({ emailNotify: !schedule.emailNotify })}
          accessory={
            <RowSwitch
              value={schedule.emailNotify}
              onValueChange={(v) => patchSchedule({ emailNotify: v })}
              label="Zusätzlich per E-Mail benachrichtigen"
            />
          }
          last
        />
      </FormSection>
    </EditorSubPage>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing.small },
});
