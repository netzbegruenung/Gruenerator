import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { PROCESSING_STAGES } from '../../hooks/useReelProcessing';

interface ProcessingProgressProps {
  currentStage: 1 | 2 | 3 | 4;
  stageName: string;
  stageProgress: number;
  overallProgress: number;
  onCancel: () => void;
}

export function ProcessingProgress({
  currentStage,
  stageName,
  stageProgress,
  overallProgress,
  onCancel,
}: ProcessingProgressProps) {
  const stages = [1, 2, 3, 4] as const;

  const getStageStatus = (stage: number): 'completed' | 'active' | 'pending' => {
    if (stage < currentStage) return 'completed';
    if (stage === currentStage) return 'active';
    return 'pending';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="videocam" size={48} color={colors.primary[600]} />
        <Text style={styles.title}>Dein Reel wird erstellt</Text>
        <Text style={styles.subtitle}>Dies kann einige Minuten dauern</Text>
      </View>

      <View style={styles.stagesContainer}>
        {stages.map((stage, index) => {
          const status = getStageStatus(stage);
          const stageInfo = PROCESSING_STAGES[stage];
          const isLast = index === stages.length - 1;

          return (
            <View key={stage} style={styles.stageRow}>
              <View style={styles.stageIndicatorColumn}>
                <View
                  style={[
                    styles.stageCircle,
                    status === 'completed' && styles.stageCircleCompleted,
                    status === 'active' && styles.stageCircleActive,
                    status === 'pending' && styles.stageCirclePending,
                  ]}
                >
                  {status === 'completed' ? (
                    <Ionicons name="checkmark" size={16} color={colors.white} />
                  ) : status === 'active' ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.stageNumber}>{stage}</Text>
                  )}
                </View>
                {!isLast && (
                  <View
                    style={[
                      styles.stageLine,
                      status === 'completed' && styles.stageLineCompleted,
                    ]}
                  />
                )}
              </View>

              <View style={styles.stageContent}>
                <View style={styles.stageHeader}>
                  <Ionicons
                    name={stageInfo.icon}
                    size={20}
                    color={status === 'pending' ? colors.grey[400] : colors.primary[600]}
                  />
                  <Text
                    style={[
                      styles.stageName,
                      status === 'pending' && styles.stageNamePending,
                      status === 'active' && styles.stageNameActive,
                    ]}
                  >
                    {stageInfo.name}
                  </Text>
                </View>

                {status === 'active' && (
                  <View style={styles.stageProgressContainer}>
                    <View style={styles.stageProgressBar}>
                      <View
                        style={[styles.stageProgressFill, { width: `${stageProgress}%` }]}
                      />
                    </View>
                    <Text style={styles.stageProgressText}>{Math.round(stageProgress)}%</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.overallProgress}>
        <Text style={styles.overallLabel}>Gesamtfortschritt</Text>
        <View style={styles.overallProgressBar}>
          <View style={[styles.overallProgressFill, { width: `${overallProgress}%` }]} />
        </View>
        <Text style={styles.overallProgressText}>{Math.round(overallProgress)}%</Text>
      </View>

      <Pressable style={styles.cancelButton} onPress={onCancel}>
        <Ionicons name="close-circle-outline" size={20} color={colors.grey[600]} />
        <Text style={styles.cancelText}>Abbrechen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.large,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xlarge,
  },
  title: {
    ...typography.h2,
    color: colors.grey[800],
    marginTop: spacing.medium,
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
    color: colors.grey[500],
  },
  stagesContainer: {
    backgroundColor: colors.grey[50],
    borderRadius: borderRadius.large,
    padding: spacing.large,
    marginBottom: spacing.xlarge,
  },
  stageRow: {
    flexDirection: 'row',
  },
  stageIndicatorColumn: {
    alignItems: 'center',
    marginRight: spacing.medium,
  },
  stageCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageCircleCompleted: {
    backgroundColor: colors.primary[600],
  },
  stageCircleActive: {
    backgroundColor: colors.primary[500],
  },
  stageCirclePending: {
    backgroundColor: colors.grey[300],
  },
  stageNumber: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  stageLine: {
    width: 2,
    flex: 1,
    minHeight: 32,
    backgroundColor: colors.grey[300],
    marginVertical: spacing.xxsmall,
  },
  stageLineCompleted: {
    backgroundColor: colors.primary[600],
  },
  stageContent: {
    flex: 1,
    paddingBottom: spacing.medium,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginBottom: spacing.xsmall,
  },
  stageName: {
    ...typography.body,
    color: colors.grey[700],
  },
  stageNamePending: {
    color: colors.grey[400],
  },
  stageNameActive: {
    fontWeight: '600',
    color: colors.primary[700],
  },
  stageProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginTop: spacing.xsmall,
  },
  stageProgressBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.grey[200],
    borderRadius: borderRadius.small,
    overflow: 'hidden',
  },
  stageProgressFill: {
    height: '100%',
    backgroundColor: colors.primary[500],
  },
  stageProgressText: {
    ...typography.caption,
    color: colors.grey[500],
    width: 36,
    textAlign: 'right',
  },
  overallProgress: {
    alignItems: 'center',
    gap: spacing.small,
  },
  overallLabel: {
    ...typography.caption,
    color: colors.grey[600],
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  overallProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.grey[200],
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.medium,
  },
  overallProgressText: {
    ...typography.h3,
    color: colors.primary[600],
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    marginTop: spacing.xlarge,
    padding: spacing.medium,
  },
  cancelText: {
    ...typography.body,
    color: colors.grey[600],
  },
});
