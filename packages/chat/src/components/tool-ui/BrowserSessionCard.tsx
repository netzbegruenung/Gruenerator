'use client';

import { useAuiState } from '@assistant-ui/react';
import { ArrowRight, Check, Globe, Loader2, TriangleAlert } from 'lucide-react';
import { memo } from 'react';

import { useArtifactLiveStore } from '../../stores/artifactLiveStore';

import type { ChatMessageMetadata } from '../../types/messageMetadata';
import type { BrowserSessionMeta, BrowserSessionStatus } from '@gruenerator/contracts';

interface ToolResultShape {
  summary?: unknown;
  screenshots?: unknown;
  schritte?: unknown;
  abgebrochen?: unknown;
  error?: unknown;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function sessionFromTool(args: Record<string, unknown>, result: unknown): BrowserSessionMeta {
  const r = (result != null && typeof result === 'object' ? result : {}) as ToolResultShape;
  const failed = r.error != null || r.abgebrochen === true;
  const status: BrowserSessionStatus =
    result === undefined ? 'running' : failed ? 'failed' : 'done';
  return {
    id: '',
    startUrl: typeof args.url === 'string' ? args.url : '',
    status,
    steps: [],
    screenshots: Array.isArray(r.screenshots)
      ? (r.screenshots as BrowserSessionMeta['screenshots'])
      : [],
    summary: typeof r.summary === 'string' ? r.summary : '',
  };
}

interface BrowserSessionCardProps {
  session: BrowserSessionMeta;
  /** True while this very session streams in this tab; only then "running" is real. */
  live: boolean;
  stepCount?: number;
}

export const BrowserSessionCard = memo(function BrowserSessionCard({
  session,
  live,
  stepCount,
}: BrowserSessionCardProps) {
  const panelMounted = useArtifactLiveStore((s) => s.panelMounted);
  // A persisted "running" with nobody streaming it is a run that died with the page.
  const status: BrowserSessionStatus =
    session.status === 'running' && !live ? 'failed' : session.status;
  const aborted = session.status === 'running' && !live;
  const host = hostOf(session.startUrl);
  const steps = stepCount ?? session.steps.length;

  const open = () =>
    useArtifactLiveStore.getState().setActiveArtifact({
      id: session.id,
      type: 'browser_session',
      title: host,
      startUrl: session.startUrl,
      status,
      steps: session.steps,
      screenshots: session.screenshots,
      summary: session.summary === '' ? null : session.summary,
    });

  return (
    <div className="my-3 max-w-md rounded-xl border border-border bg-background px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{host}</p>
            <p className="flex items-center gap-1.5 text-xs text-foreground-muted">
              {status === 'running' ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : status === 'failed' ? (
                <TriangleAlert className="h-3 w-3 text-amber-500" aria-hidden="true" />
              ) : (
                <Check className="h-3 w-3 text-primary" aria-hidden="true" />
              )}
              <span>
                {status === 'running'
                  ? 'Erkundet …'
                  : aborted
                    ? 'abgebrochen'
                    : status === 'failed'
                      ? 'fehlgeschlagen'
                      : 'Erkundet'}
                {steps > 0 ? ` · ${steps} ${steps === 1 ? 'Schritt' : 'Schritte'}` : ''}
              </span>
            </p>
          </div>
        </div>
        {panelMounted && session.id !== '' && (
          <button
            type="button"
            onClick={open}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary/90"
          >
            Ansehen
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {session.screenshots.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {session.screenshots.map((shot) => (
            <li key={shot.name}>
              <a href={shot.url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={shot.url}
                  alt={`Screenshot ${shot.name}`}
                  className="block aspect-video w-full rounded-md border border-border object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/** assistant-ui render: persisted `custom.browserSession` wins, the tool call fills the gap. */
export function BrowserSessionToolRender({
  args,
  result,
}: {
  args: Record<string, unknown>;
  result?: unknown;
}) {
  const persisted = useAuiState(
    (s) => (s.message.metadata?.custom as ChatMessageMetadata | undefined)?.browserSession ?? null
  );
  const liveId = useArtifactLiveStore((s) =>
    s.activeArtifact?.type === 'browser_session' && s.activeArtifact.status === 'running'
      ? s.activeArtifact.id
      : null
  );
  const fromTool = sessionFromTool(args, result);
  const session = persisted ?? fromTool;
  const live = session.status === 'running' && (persisted == null || liveId === persisted.id);
  return <BrowserSessionCard session={session} live={live && result === undefined} />;
}
