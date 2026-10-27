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

export type CardStatus = 'running' | 'done' | 'failed' | 'aborted';

export interface CardStatusInput {
  /** `custom.browserSession.status`, when metadata exists. */
  persisted: BrowserSessionStatus | null;
  /** The tool call's result, when it has one. */
  result: unknown;
  /** Is THIS message still streaming? The only truth about liveness. */
  messageRunning: boolean;
}

function asResult(result: unknown): ToolResultShape | null {
  return result != null && typeof result === 'object' ? (result as ToolResultShape) : null;
}

/**
 * Persisted/result status wins; a "running" that nobody streams any more died
 * with the page (reload, Stop) and reads as aborted. A user abort
 * (`abgebrochen`) is aborted, any other failure is failed.
 */
export function deriveCardStatus({
  persisted,
  result,
  messageRunning,
}: CardStatusInput): CardStatus {
  const r = asResult(result);
  if (r?.abgebrochen === true) return 'aborted';
  if (r?.error != null) return 'failed';
  if (persisted === 'done' || persisted === 'failed') {
    return persisted === 'done' ? 'done' : 'failed';
  }
  if (r != null) return 'done';
  return messageRunning ? 'running' : 'aborted';
}

const STATUS_LABEL: Record<CardStatus, string> = {
  running: 'Erkundet …',
  done: 'Erkundet',
  failed: 'fehlgeschlagen',
  aborted: 'abgebrochen',
};

interface BrowserSessionCardProps {
  session: BrowserSessionMeta;
  status: CardStatus;
  errorText?: string | null;
  stepCount?: number;
}

export const BrowserSessionCard = memo(function BrowserSessionCard({
  session,
  status,
  errorText = null,
  stepCount,
}: BrowserSessionCardProps) {
  const panelMounted = useArtifactLiveStore((s) => s.panelMounted);
  const host = hostOf(session.startUrl);
  const steps = stepCount ?? session.steps.length;
  const text = errorText ?? (session.summary !== '' ? session.summary : null);

  const open = () => {
    const store = useArtifactLiveStore.getState();
    const active = store.activeArtifact;
    // The live store is fresher than the persisted snapshot: keep it.
    if (active?.type === 'browser_session' && active.id === session.id) return;
    store.setActiveArtifact({
      id: session.id,
      type: 'browser_session',
      title: host,
      startUrl: session.startUrl,
      status: status === 'running' ? 'running' : status === 'done' ? 'done' : 'failed',
      steps: session.steps,
      screenshots: session.screenshots,
      summary: session.summary === '' ? null : session.summary,
    });
  };

  return (
    <div className="my-3 max-w-md rounded-xl border border-border bg-background px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{host}</p>
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-1.5 text-xs text-foreground-muted"
            >
              {status === 'running' ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : status === 'done' ? (
                <Check className="h-3 w-3 text-primary" aria-hidden="true" />
              ) : (
                <TriangleAlert className="h-3 w-3 text-amber-500" aria-hidden="true" />
              )}
              <span>
                {STATUS_LABEL[status]}
                {steps > 0 ? ` · ${steps} ${steps === 1 ? 'Schritt' : 'Schritte'}` : ''}
              </span>
            </p>
          </div>
        </div>
        {panelMounted && session.id !== '' && (
          <button
            type="button"
            onClick={open}
            aria-label={`Ansehen: ${host}`}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary/90"
          >
            Ansehen
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {text != null && <p className="mt-2 text-foreground-muted">{text}</p>}
      {session.screenshots.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {session.screenshots.map((shot, i) => (
            <li key={`${shot.name}-${i}`}>
              <a href={shot.url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={shot.url}
                  alt={`Screenshot ${shot.name}`}
                  loading="lazy"
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
  const messageRunning = useAuiState((s) => s.message.status?.type === 'running');
  const r = asResult(result);
  const session: BrowserSessionMeta = persisted ?? {
    id: '',
    startUrl: typeof args.url === 'string' ? args.url : '',
    status: 'running',
    steps: [],
    screenshots: Array.isArray(r?.screenshots)
      ? (r.screenshots as BrowserSessionMeta['screenshots'])
      : [],
    summary: typeof r?.summary === 'string' ? r.summary : '',
  };
  const status = deriveCardStatus({
    persisted: persisted?.status ?? null,
    result,
    messageRunning,
  });
  const errorText = typeof r?.error === 'string' ? r.error : null;
  return <BrowserSessionCard session={session} status={status} errorText={errorText} />;
}
