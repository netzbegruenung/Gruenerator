/**
 * The JSONB shapes of `video_ai_projects`. Internal to the API (the page sees
 * VideoAiProjectDto), but persisted: change additively, and read old rows
 * tolerantly.
 */
import { type VideoAiEdl, type VideoAiInputRole } from '@gruenerator/contracts';

import { type FrameCell } from './describeFrames.js';
import { type ClipAnalysis } from './ffmpegAnalysis.js';
import { type TranscriptWord } from './transcriptUnits.js';

export interface StoredVideoAiInput {
  /** `c1` for clips, `a1` for everything else, in the order sent. */
  id: string;
  mediaId: string;
  role: VideoAiInputRole;
  title: string;
}

export interface StoredClipAnalysis {
  clipId: string;
  role: 'footage' | 'broll';
  /** The working copy (H.264, CFR 30, levelled sound) as a Mediathek video. */
  proxyMediaId: string;
  duration: number;
  /** Transcript units are rebuilt from these; the split is deterministic. */
  words: TranscriptWord[];
  detectors: ClipAnalysis;
  cells: FrameCell[];
}

export interface StoredAssetAnalysis {
  id: string;
  kind: 'image' | 'logo' | 'audio';
  description: string | null;
  durationSeconds: number | null;
}

export interface StoredVideoAiAnalysis {
  clips: StoredClipAnalysis[];
  assets: StoredAssetAnalysis[];
}

export interface StoredVideoAiVersion {
  version: number;
  edl: VideoAiEdl;
  /** Label in the version list ("Erster Schnitt", "Logo größer"). */
  summary: string;
  /** Unit id → reason, for the "Rausgeschnitten" list. */
  omitted: Record<string, string>;
  rationale: string | null;
  createdAt: string;
}

/** Clips get `c1…`, assets `a1…`, counted separately, in the order sent. */
export function assignInputIds<T extends { role: VideoAiInputRole }>(
  inputs: readonly T[]
): (T & { id: string })[] {
  let clips = 0;
  let assets = 0;
  return inputs.map((input) => ({
    ...input,
    id: input.role === 'footage' || input.role === 'broll' ? `c${++clips}` : `a${++assets}`,
  }));
}
