'use client';

import { KeyRound, Check, X } from 'lucide-react';
import { memo, useState } from 'react';

import {
  TOOL_GRANT_OPTIONS,
  answerToolGrant,
  toolGrantResolvedLabel,
  toolGrantSubtitle,
  toolGrantTitle,
  toolGrantTools,
  type McpToolGrant,
  type McpToolGrantScope,
} from '../../lib/toolGrant';
import { field, inkButton, mono, paper } from '../assistant-ui/elements/surfaces';

/**
 * Freigabe-Karte für neue oder geänderte Werkzeuge eines verbundenen Servers.
 * Aufbau nach assistant-ui PermissionGrant (Kopf, Reichweite, drei Umfänge,
 * danach eine Plakette), auf den Elements-Tokens wie `ToolApprovalCard` —
 * hier passt die Vorlage, weil die Reichweite die Werkzeugnamen sind.
 *
 * Kein Approval-Gate: der Zug lief schon ohne diese Werkzeuge weiter. Die
 * Antwort wirkt ab der nächsten Nachricht.
 */
export const ToolGrantCard = memo(function ToolGrantCard({ grant }: { grant: McpToolGrant }) {
  const [resolved, setResolved] = useState<McpToolGrantScope | null>(grant.resolved ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tools = toolGrantTools(grant);

  if (resolved) {
    const Icon = resolved === 'denied' ? X : Check;
    return (
      <div className="my-2 text-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1">
          <Icon
            className={`h-3.5 w-3.5 ${resolved === 'denied' ? 'text-foreground-muted' : 'text-primary'}`}
          />
          <span className="font-medium text-foreground">{grant.serverName}</span>
          <span className="text-foreground-muted">&middot;</span>
          <span className="text-foreground-muted">{toolGrantResolvedLabel(resolved)}</span>
        </div>
      </div>
    );
  }

  const answer = async (scope: McpToolGrantScope): Promise<void> => {
    if (!grant.threadId) return;
    setBusy(true);
    setError(null);
    const outcome = await answerToolGrant(grant, grant.threadId, scope);
    setBusy(false);
    if (outcome.status === 'resolved') setResolved(outcome.scope);
    else setError(outcome.message);
  };

  return (
    <div className={`my-5 rounded-[20px] px-4 py-3.5 ${paper}`}>
      <div className="mb-2 flex items-start gap-2.5">
        <span className="bg-foreground/[0.05] flex size-7 shrink-0 items-center justify-center rounded-lg text-primary">
          <KeyRound className="size-3.5" />
        </span>
        <div>
          <p className="text-[13.5px] font-medium text-foreground">{toolGrantTitle(grant)}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">{toolGrantSubtitle(grant)}</p>
        </div>
      </div>
      <ul className={`mb-3 ms-[38px] flex list-none flex-wrap gap-1.5 rounded-xl p-2 ${field}`}>
        {tools.map((tool) => (
          <li key={tool} className={`${mono} text-foreground`}>
            {tool}
          </li>
        ))}
      </ul>
      <div className="ms-[38px] flex flex-wrap items-center gap-2">
        {TOOL_GRANT_OPTIONS.map((option) => {
          const isPrimary = option.scope === 'session';
          return (
            <button
              key={option.scope}
              type="button"
              onClick={() => void answer(option.scope)}
              disabled={busy || !grant.threadId}
              className={
                isPrimary
                  ? `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${inkButton}`
                  : 'text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 cursor-pointer rounded-full px-3 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60'
              }
            >
              {isPrimary && <Check className="h-3.5 w-3.5" />}
              {option.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="ms-[38px] mt-2 text-xs text-[var(--error-red)]">
          {error}
        </p>
      )}
    </div>
  );
});
