import { type ResearchLogStep, useArtifactLiveStore } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { borderRadius, chatType, colors, spacing } from '../../theme';

import type { Theme } from '../../theme/colors';

/**
 * Native twin of web's `ResearchLogView`: plan and step list of a running Deep
 * Research turn (`research_log_start`/`research_log_update`). Web docks it in
 * the ArtifactPanel; the app has no panel, so it sits under the status line of
 * the streaming answer (#3997). The store holds the last log after its run, so
 * only a `running` one renders — the finished report arrives as its own card,
 * and a log the parser closed as `failed` belongs to an earlier turn.
 */

function statusLabel(status: ResearchLogStep['status']): string {
  if (status === 'done') return 'abgeschlossen';
  if (status === 'failed') return 'fehlgeschlagen';
  return 'läuft';
}

function StepIcon({ status, theme }: { status: ResearchLogStep['status']; theme: Theme }) {
  if (status === 'done') return <Ionicons name="checkmark" size={14} color={colors.primary[600]} />;
  if (status === 'failed') return <Ionicons name="close" size={14} color={theme.textSecondary} />;
  return <ActivityIndicator size="small" color={theme.textSecondary} style={styles.spinner} />;
}

export function ResearchLogCard({ theme }: { theme: Theme }) {
  const artifact = useArtifactLiveStore((s) =>
    s.activeArtifact?.type === 'research_log' && s.activeArtifact.status === 'running'
      ? s.activeArtifact
      : null
  );
  if (!artifact) return null;

  const { plan, steps } = artifact;
  const donePlanSteps = plan.filter((s) => s.status === 'done').length;

  return (
    <View
      testID="research-log-card"
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
    >
      {plan.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.heading, { color: theme.textSecondary }]}>
            Plan ({donePlanSteps}/{plan.length})
          </Text>
          {plan.map((step) => (
            <View
              key={step.id}
              style={styles.row}
              accessible
              accessibilityLabel={`${step.label} — ${statusLabel(step.status)}`}
            >
              <Ionicons
                name={step.status === 'done' ? 'checkmark' : 'ellipse-outline'}
                size={14}
                color={step.status === 'done' ? colors.primary[600] : theme.textSecondary}
              />
              <Text
                style={[
                  styles.label,
                  { color: step.status === 'done' ? theme.textSecondary : theme.text },
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {steps.length > 0 && (
        <View style={styles.section} accessibilityLiveRegion="polite">
          <Text style={[styles.heading, { color: theme.textSecondary }]}>Schritte</Text>
          {steps.map((step) => (
            <View
              key={step.id}
              style={styles.row}
              accessible
              accessibilityLabel={`${step.label} — ${statusLabel(step.status)}`}
            >
              <StepIcon status={step.status} theme={theme} />
              <Text
                style={[
                  styles.label,
                  { color: step.status === 'running' ? theme.text : theme.textSecondary },
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {plan.length === 0 && steps.length === 0 && (
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          Der Agent plant die Recherche…
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xsmall,
    padding: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    gap: spacing.small,
  },
  section: {
    gap: spacing.xxsmall,
  },
  heading: {
    ...chatType.chatMicro,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xsmall,
  },
  label: {
    ...chatType.chatSecondary,
    flex: 1,
  },
  meta: {
    ...chatType.chatMeta,
  },
  spinner: {
    transform: [{ scale: 0.7 }],
    width: 14,
    height: 14,
  },
});
