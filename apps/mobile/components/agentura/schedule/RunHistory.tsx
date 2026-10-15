import { type RecurringTaskDelivery, type RecurringTaskRun } from '@gruenerator/contracts';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { colors, spacing, typography } from '../../../theme';
import { actionUrlToRoute } from '../../../utils/actionUrl';
import { ListRow, SkeletonRows, useSurfaceStyles } from '../../common';
import { FormSection } from '../recipe-editor/FormParts';

const STATUS_META: Record<
  RecurringTaskRun['status'],
  { label: string; icon: IoniconsIconName; color: string | null }
> = {
  running: { label: 'Läuft …', icon: 'sync', color: colors.primary[600] },
  completed: { label: 'Erledigt', icon: 'checkmark-circle', color: colors.primary[600] },
  // Ein leerer Lauf ist kein Fehler — „nur bei Neuem" kann die Absicht sein.
  empty: { label: 'Nichts Neues', icon: 'remove-circle-outline', color: null },
  failed: { label: 'Fehlgeschlagen', icon: 'alert-circle', color: colors.error[600] },
};

function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function resultLinkLabel(delivery: RecurringTaskDelivery): string {
  return delivery === 'thread' ? 'Chat öffnen' : 'Dokument öffnen';
}

function runDetail(run: RecurringTaskRun, delivery: RecurringTaskDelivery): string {
  const parts: string[] = [STATUS_META[run.status].label];
  if (run.status === 'completed' && run.resultUrl) parts.push(resultLinkLabel(delivery));
  else if (run.status === 'completed' && run.resultsSummary) parts.push(run.resultsSummary);
  if (run.status === 'empty') parts.push('Es wurde nichts zugestellt.');
  if (run.status === 'failed' && run.error) parts.push(run.error);
  // Das Verdikt ist ein Messwert, kein Fehler: das Ergebnis wurde trotzdem zugestellt.
  if (run.verdict && !run.verdict.ok) {
    parts.push(
      `Selbstprüfung: ${run.verdict.hint ?? 'Das Ergebnis passt möglicherweise nicht zur Anweisung.'}`
    );
  }
  return parts.join(' · ');
}

function StatusBadge({ status }: { status: RecurringTaskRun['status'] }) {
  const theme = useTheme();
  const { badge } = useSurfaceStyles();
  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, badge]}>
      <Ionicons name={meta.icon} size={22} color={meta.color ?? theme.textSecondary} />
    </View>
  );
}

/** Verlauf einer wiederkehrenden Aufgabe: was der Agent tat, während niemand zusah. */
export function RunHistory({
  runsQ,
  delivery,
}: {
  runsQ: {
    data?: RecurringTaskRun[];
    isPending: boolean;
    isError: boolean;
    refetch: () => unknown;
  };
  delivery: RecurringTaskDelivery;
}) {
  const theme = useTheme();

  if (runsQ.isPending) {
    return (
      <View style={styles.section}>
        <SkeletonRows count={3} leading={44} />
      </View>
    );
  }
  if (runsQ.isError) {
    return (
      <FormSection title="Verlauf">
        <ListRow
          icon="refresh"
          title="Verlauf nicht verfügbar"
          value="Erneut versuchen"
          onPress={() => void runsQ.refetch()}
          last
        />
      </FormSection>
    );
  }
  const runs = runsQ.data ?? [];
  if (runs.length === 0) {
    return (
      <FormSection title="Verlauf">
        <Text style={[styles.empty, { color: theme.textSecondary }]}>Noch kein Lauf.</Text>
      </FormSection>
    );
  }
  return (
    <FormSection title="Verlauf">
      {runs.map((run, i) => {
        const url = run.status === 'completed' ? run.resultUrl : null;
        const duration = formatDuration(run.durationMs);
        return (
          <ListRow
            key={run.id}
            leading={<StatusBadge status={run.status} />}
            title={[formatDateTime(run.createdAt), duration].filter(Boolean).join(' · ')}
            value={runDetail(run, delivery)}
            valueLines={3}
            {...(url && { onPress: () => router.push(actionUrlToRoute(url)) })}
            last={i === runs.length - 1}
          />
        );
      })}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xsmall },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    ...typography.bodySmall,
    padding: spacing.small,
  },
});
