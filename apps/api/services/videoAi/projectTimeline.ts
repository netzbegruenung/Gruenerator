/**
 * One version of a project, compiled for the editor: the source pieces to play
 * back to back, every caption word in output time (with the person's
 * corrections), and where each clip and asset streams from. The editor turns
 * this into its own overlays; nothing about its format leaks in here.
 */
import { type VideoAiTimeline } from '@gruenerator/contracts';

import { planContext } from './projectContext.js';
import { type ProjectRow } from './projectRepository.js';
import { type StoredVideoAiAnalysis, type StoredVideoAiVersion } from './projectTypes.js';
import { buildTimeline } from './timeline.js';

export function compileTimeline(
  row: ProjectRow,
  analysis: StoredVideoAiAnalysis,
  version: StoredVideoAiVersion,
  assetShareTokens: ReadonlyMap<string, string>
): VideoAiTimeline {
  const ctx = planContext(row, analysis);
  const edl = version.edl;
  const timeline = buildTimeline({
    unitIds: edl.segments.map((s) => s.unitId),
    units: ctx.units,
    clipDurations: new Map(analysis.clips.map((c) => [c.clipId, c.duration])),
  });
  const fixes = edl.captionFixes ?? [];
  const fixed = (unitId: string, start: number, text: string) =>
    fixes.find((f) => f.unitId === unitId && Math.abs(f.start - start) < 0.01)?.text ?? text;
  const inputById = new Map(row.inputs.map((i) => [i.id, i]));

  return {
    projectId: row.id,
    version: version.version,
    locale: row.locale,
    edl,
    duration: timeline.duration,
    pieces: timeline.pieces,
    words: timeline.words.map((w) => ({
      text: fixed(edl.segments[w.segmentIndex].unitId, w.start, w.word),
      outStart: w.outStart,
      outEnd: w.outEnd,
      segmentIndex: w.segmentIndex,
    })),
    clips: analysis.clips.map((c) => ({
      id: c.clipId,
      role: c.role,
      shareToken: c.proxyShareToken,
      duration: c.duration,
      width: c.width ?? null,
      height: c.height ?? null,
    })),
    assets: analysis.assets.map((a) => {
      const input = inputById.get(a.id);
      return {
        id: a.id,
        kind: a.kind,
        title: input?.title ?? a.id,
        shareToken: input ? (assetShareTokens.get(input.mediaId) ?? null) : null,
        durationSeconds: a.durationSeconds,
      };
    }),
    person: row.brief.person ? { name: row.brief.person.name, role: row.brief.person.role } : null,
  };
}
