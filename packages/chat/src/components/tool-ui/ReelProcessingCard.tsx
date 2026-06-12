import { memo, useEffect, useRef, useState } from 'react';
import { Clapperboard, CheckCircle2, AlertTriangle } from 'lucide-react';
import { parseStoredSubtitles } from '@gruenerator/shared/subtitle-editor';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useReelLiveStore } from '../../stores/reelLiveStore';
import type { ReelProcessingData } from '../../types/messageMetadata';

type CardState =
  | { phase: 'processing'; progress: number }
  | { phase: 'complete'; projectId: string | null }
  | { phase: 'error'; message: string }
  | { phase: 'expired' };

/**
 * Progress card for a chat-uploaded video being auto-transcribed. Polls
 * GET /subtitler/auto-progress/:uploadId (2s, 5s after 30s — same cadence as
 * the subtitler export store) and, on completion, seeds the reel live store
 * and activates the docked ReelArtifactPanel.
 */
export const ReelProcessingCard = memo(function ReelProcessingCard({
  data,
}: {
  data: ReelProcessingData;
}) {
  const [state, setState] = useState<CardState>({ phase: 'processing', progress: 0 });
  const doneRef = useRef(false);

  useEffect(() => {
    const { fetchReelAutoProgress } = useChatConfigStore.getState();
    if (!fetchReelAutoProgress) {
      setState({ phase: 'expired' });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const finishComplete = (projectId: string | null, subtitles: string | null) => {
      doneRef.current = true;
      if (projectId) {
        const { segments } = parseStoredSubtitles(subtitles);
        const store = useReelLiveStore.getState();
        store.upsertEntry(projectId, {
          title: data.filename,
          segments: segments.length > 0 ? segments : null,
          summary: null,
          changedIndices: null,
        });
        store.setActiveReel({ projectId, title: data.filename });
      }
      setState({ phase: 'complete', projectId });
    };

    const poll = async () => {
      const progress = await fetchReelAutoProgress(data.uploadId);
      if (cancelled || doneRef.current) return;

      if (!progress) {
        // Transient fetch error — keep polling.
      } else if (progress.status === 'complete') {
        finishComplete(progress.projectId, progress.subtitles);
        return;
      } else if (progress.status === 'error') {
        doneRef.current = true;
        setState({
          phase: 'error',
          message: progress.error ?? 'Die Verarbeitung ist fehlgeschlagen.',
        });
        return;
      } else if (progress.status === 'not_found') {
        doneRef.current = true;
        setState({ phase: 'expired' });
        return;
      } else {
        setState({ phase: 'processing', progress: progress.overallProgress });
      }

      const interval = Date.now() - startedAt > 30_000 ? 5_000 : 2_000;
      timer = setTimeout(() => void poll(), interval);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [data.uploadId, data.filename]);

  return (
    <div className="my-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-2 min-w-0">
        {state.phase === 'complete' ? (
          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
        ) : state.phase === 'processing' ? (
          <Clapperboard className="h-4 w-4 text-primary flex-shrink-0 animate-pulse" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{data.filename}</p>
          {state.phase === 'processing' && (
            <p className="text-xs text-foreground-muted">
              Untertitel werden erstellt… {state.progress > 0 ? `${state.progress}%` : ''}
            </p>
          )}
          {state.phase === 'complete' && (
            <p className="text-xs text-foreground-muted">
              Untertitel fertig — beschreibe Änderungen einfach im Chat.
            </p>
          )}
          {state.phase === 'error' && (
            <p className="text-xs text-foreground-muted">{state.message}</p>
          )}
          {state.phase === 'expired' && (
            <p className="text-xs text-foreground-muted">
              Der Verarbeitungsstatus ist nicht mehr verfügbar. Frag mich nach deinen Reels, um das
              Projekt auszuwählen.
            </p>
          )}
        </div>
      </div>
      {state.phase === 'processing' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.max(state.progress, 4)}%` }}
          />
        </div>
      )}
    </div>
  );
});
