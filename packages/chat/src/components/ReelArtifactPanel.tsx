'use client';

import { useEffect, useState } from 'react';
import { findActiveSegment, parseStoredSubtitles } from '@gruenerator/shared/subtitle-editor';
import { Clapperboard, ExternalLink, X } from 'lucide-react';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useReelLiveStore, type ActiveReel } from '../stores/reelLiveStore';

/**
 * Docked right-rail artifact view of the reel (subtitler project) the user is
 * editing via chat: the project's video with a live DOM subtitle overlay
 * driven by the reel live store, so chat edits show up on the next playback
 * pass without re-rendering the video. Renders nothing while no reel is
 * active; hosts decide where (and at which breakpoint) to dock it.
 *
 * The overlay uses one fixed default style — style fidelity (presets,
 * position, fonts) lives in the Sub-Studio and the final ffmpeg burn-in.
 */
export function ReelArtifactPanel({ className }: { className?: string }) {
  const active = useReelLiveStore((s) => s.activeReel);
  if (!active) return null;
  // Key by project so playback/overlay state never leaks across reels.
  return <PanelInner key={active.projectId} active={active} className={className} />;
}

function PanelInner({ active, className }: { active: ActiveReel; className?: string }) {
  const entry = useReelLiveStore((s) => s.entries[active.projectId]);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoError, setVideoError] = useState(false);

  const { getReelVideoUrl, fetchReelProject, onOpenReelStudio } = useChatConfigStore();
  const videoUrl = getReelVideoUrl ? getReelVideoUrl(active.projectId) : null;

  // Rehydrate segments when the panel opens on a reel the stream hasn't
  // touched yet (picker selection, thread reload).
  const needsSegments = !entry || entry.segments == null;
  useEffect(() => {
    if (!needsSegments || !fetchReelProject) return;
    let cancelled = false;
    void fetchReelProject(active.projectId).then((project) => {
      if (cancelled || !project) return;
      const { segments } = parseStoredSubtitles(project.subtitles);
      useReelLiveStore.getState().upsertEntry(active.projectId, {
        title: project.title,
        segments,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [needsSegments, fetchReelProject, active.projectId]);

  const segments = entry?.segments ?? [];
  const activeSegment = findActiveSegment(segments, currentTime);
  const title = entry?.title ?? active.title;

  const close = () => useReelLiveStore.getState().setActiveReel(null);

  return (
    <aside
      className={
        className ??
        'flex w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt'
      }
      aria-label={`Aktives Reel: ${title}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
            <Clapperboard className="h-3 w-3" />
            Reel-Modus
          </span>
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
        </div>
        <button
          onClick={close}
          className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label="Reel-Modus beenden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {videoUrl && !videoError ? (
          <div className="relative mx-auto w-full max-w-[16rem] overflow-hidden rounded-lg border border-border bg-black">
            <video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full object-contain"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onError={() => setVideoError(true)}
            />
            {activeSegment && (
              <div className="pointer-events-none absolute inset-x-2 bottom-[20%] flex justify-center">
                <span
                  className="max-w-full whitespace-pre-wrap text-center text-sm font-bold text-white"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)' }}
                >
                  {activeSegment.text}
                </span>
              </div>
            )}
            {entry?.summary && (
              <span className="absolute left-2 top-2 max-w-[90%] truncate rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                {entry.summary}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
            Video-Vorschau ist nicht verfügbar.
          </div>
        )}

        {onOpenReelStudio && (
          <button
            onClick={() => onOpenReelStudio(active.projectId)}
            className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-primary hover:bg-primary/10"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Im Untertitel-Studio öffnen</span>
          </button>
        )}

        <p className="text-xs text-foreground-muted">
          Beschreibe Textänderungen einfach im Chat — z.B. „Korrigiere den Tippfehler in Segment
          2&quot;. Feinschliff und Export findest du im Untertitel-Studio.
        </p>
      </div>
    </aside>
  );
}
