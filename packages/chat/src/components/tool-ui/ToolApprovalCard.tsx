'use client';

import { ShieldQuestion, Check, X, Clock } from 'lucide-react';
import { memo, useState } from 'react';

import {
  TOOL_APPROVAL_OPTIONS,
  approvalDecidedLabel,
  isApprovalDecided,
  type ToolApprovalState,
} from '../../lib/toolApproval';
import { formatNamespacedToolLabel } from '../../lib/toolMappings';
import { field, inkButton, mono, paper } from '../assistant-ui/elements/surfaces';

export { type ToolApprovalState };

/**
 * Presentation follows the Elements surface tokens (`paper`, `field`,
 * `inkButton`, `mono`) rather than vendoring `elements-permission-grant`
 * verbatim. Upstream's PermissionGrant is built around a `reach: string[]`
 * ("this grants …") and a session/always/denied `GrantScope` — we have neither:
 * our gate carries three options of its own (allow-once / allow-always /
 * reject-once) and no capability-reach data. Taking the component would have
 * meant inventing a reach list to fill it, so we take the token layer, which is
 * the part that actually makes it look like the rest of the Elements.
 */

interface ToolApprovalCardProps {
  toolName: string;
  args: Record<string, unknown>;
  approval: ToolApprovalState;
  title?: string;
  serverName?: string;
  respondToApproval: (response: { approved: boolean; optionId?: string; reason?: string }) => void;
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
  const decided = isApprovalDecided(approval);

  if (decided) {
    const denied = approval.approved === false || approval.resolution !== undefined;
    const Icon = approval.resolution ? Clock : denied ? X : Check;
    return (
      <div className="my-2 text-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1">
          <Icon className={`h-3.5 w-3.5 ${denied ? 'text-foreground-muted' : 'text-primary'}`} />
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-foreground-muted">&middot;</span>
          <span className="text-foreground-muted">{approvalDecidedLabel(approval)}</span>
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
    <div className={`my-5 rounded-[20px] px-4 py-3.5 ${paper}`}>
      <div className="mb-2 flex items-start gap-2.5">
        <span className="bg-foreground/[0.05] flex size-7 shrink-0 items-center justify-center rounded-lg text-primary">
          <ShieldQuestion className="size-3.5" />
        </span>
        <div>
          <p className="text-[13.5px] font-medium text-foreground">{label} ausführen?</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {serverName
              ? `${serverName} ist ein verbundener Dienst — der Aufruf verlässt den Grünerator.`
              : 'Dieses Werkzeug wirkt über die Antwort hinaus.'}
          </p>
        </div>
      </div>

      {argEntries.length > 0 && (
        <details className="mb-3 ms-[38px]">
          <summary className={`cursor-pointer ${mono} text-foreground/40 hover:text-foreground/70`}>
            Übergabewerte anzeigen
          </summary>
          <pre
            className={`mt-1.5 max-h-48 overflow-auto rounded-xl p-2 text-xs text-foreground ${field}`}
          >
            {JSON.stringify(args, null, 2)}
          </pre>
        </details>
      )}

      <div className="ms-[38px] flex flex-wrap items-center gap-2">
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
    </div>
  );
});
