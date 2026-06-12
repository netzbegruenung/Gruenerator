/**
 * Pure op validation/application for the chat reel-edit branch (no heavy
 * imports — unit-testable without pulling in Postgres/ffmpeg modules).
 */
import type { SubtitleSegment } from '@gruenerator/shared/subtitle-editor';

export interface ValidatedReelOps {
  /** segmentIndex → newText, duplicates collapsed (last wins). */
  byIndex: Map<number, string>;
  rejected: string[];
}

export function validateReelOps(
  operations: Array<{ segmentIndex: number; newText: string }>,
  segmentCount: number
): ValidatedReelOps {
  const byIndex = new Map<number, string>();
  const rejected: string[] = [];
  for (const op of operations) {
    const text = op.newText.trim();
    if (
      !Number.isInteger(op.segmentIndex) ||
      op.segmentIndex < 0 ||
      op.segmentIndex >= segmentCount
    ) {
      rejected.push(`Segment ${op.segmentIndex} existiert nicht`);
      continue;
    }
    if (text.length === 0) {
      rejected.push(`Leerer Text für Segment ${op.segmentIndex}`);
      continue;
    }
    byIndex.set(op.segmentIndex, text);
  }
  return { byIndex, rejected };
}

/** Apply validated text ops; timestamps untouched by construction. */
export function applyReelOps(
  segments: SubtitleSegment[],
  byIndex: Map<number, string>
): { segments: SubtitleSegment[]; changedIndices: number[] } {
  const changedIndices: number[] = [];
  const next = segments.map((segment, index) => {
    const newText = byIndex.get(index);
    if (newText == null || newText === segment.text) return segment;
    changedIndices.push(index);
    return { ...segment, text: newText };
  });
  return { segments: next, changedIndices };
}
