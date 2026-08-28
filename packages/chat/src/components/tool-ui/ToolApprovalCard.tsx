'use client';

import { ShieldQuestion, Check, X, Clock } from 'lucide-react';
import { memo, useState } from 'react';

import { TOOL_APPROVAL_OPTIONS } from '../../lib/toolApproval';
import { formatNamespacedToolLabel } from '../../lib/toolMappings';

export interface ToolApprovalState {
  id: string;
  approved?: boolean;
  reason?: string;
  optionId?: string;
  resolution?: 'cancelled' | 'expired';
}

interface ToolApprovalCardProps {
  toolName: string;
  args: Record<string, unknown>;
  approval: ToolApprovalState;
  title?: string;
  serverName?: string;
  respondToApproval: (response: { approved: boolean; optionId?: string; reason?: string }) => void;
}

function decidedLabel(approval: ToolApprovalState): string {
  if (approval.resolution === 'expired') return 'Abgelaufen';
  if (approval.resolution === 'cancelled') return 'Abgebrochen';
  if (approval.approved === false) return 'Abgelehnt';
  return approval.optionId === 'allow-always' ? 'Immer erlaubt' : 'Erlaubt';
}

export const ToolApprovalCard = memo(function ToolApprovalCard({
  toolName,
  args,
  approval,
  title,
  serverName,
  respondToApproval,
}: ToolApprovalCardProps) {
  const [busy, setBusy] = useState(false);
  const label = title ?? formatNamespacedToolLabel(toolName, serverName);
  const decided = approval.approved !== undefined || approval.resolution !== undefined;

  if (decided) {
    const denied = approval.approved === false || approval.resolution !== undefined;
    const Icon = approval.resolution ? Clock : denied ? X : Check;
    return (
      <div className="my-2 text-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1">
          <Icon className={`h-3.5 w-3.5 ${denied ? 'text-foreground-muted' : 'text-primary'}`} />
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-foreground-muted">&middot;</span>
          <span className="text-foreground-muted">{decidedLabel(approval)}</span>
        </div>
      </div>
    );
  }

  const respond = (approved: boolean, optionId: string): void => {
    setBusy(true);
    respondToApproval({ approved, optionId });
  };

  const argEntries = Object.entries(args ?? {});

  return (
    <div className="my-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="mb-2 flex items-start gap-2">
        <ShieldQuestion className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">{label} ausführen?</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {serverName
              ? `${serverName} ist ein verbundener Dienst — der Aufruf verlässt den Grünerator.`
              : 'Dieses Werkzeug wirkt über die Antwort hinaus.'}
          </p>
        </div>
      </div>

      {argEntries.length > 0 && (
        <details className="mb-3 ml-6">
          <summary className="cursor-pointer text-xs text-foreground-muted hover:text-foreground">
            Übergabewerte anzeigen
          </summary>
          <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-background/60 p-2 text-xs text-foreground">
            {JSON.stringify(args, null, 2)}
          </pre>
        </details>
      )}

      <div className="ml-6 flex flex-wrap items-center gap-2">
        {TOOL_APPROVAL_OPTIONS.map((option) => {
          const isPrimary = option.id === 'allow-once';
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => respond(option.kind !== 'reject-once', option.id)}
              disabled={busy}
              title={'description' in option ? option.description : undefined}
              className={
                isPrimary
                  ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60'
                  : 'cursor-pointer rounded-full border border-grey-300 bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-grey-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-grey-600 dark:hover:bg-grey-800'
              }
            >
              {isPrimary && <Check className="h-3.5 w-3.5" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
