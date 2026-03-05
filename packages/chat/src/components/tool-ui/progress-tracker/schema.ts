import { z } from 'zod';

export const progressStepSchema = z.object({
  stage: z.string(),
  label: z.string(),
  status: z.enum(['pending', 'in-progress', 'completed', 'failed']),
  completedAt: z.number().optional(),
});

export const progressTrackerPropsSchema = z.object({
  steps: z.array(progressStepSchema),
  agentColor: z.string().optional(),
  totalTimeMs: z.number().optional(),
});

export type ProgressTrackerProps = z.infer<typeof progressTrackerPropsSchema>;

export function safeParseProgressTracker(data: unknown): ProgressTrackerProps | null {
  const result = progressTrackerPropsSchema.safeParse(data);
  return result.success ? result.data : null;
}
