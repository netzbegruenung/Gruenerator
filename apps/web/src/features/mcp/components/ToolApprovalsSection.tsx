/**
 * „Immer erlaubte Werkzeuge" — die dauerhaften Freigaben, die im Chat über
 * „Immer erlauben" entstanden sind. Erteilt wird hier nichts; nur widerrufen.
 *
 * Werkzeuge selbst verbundener Server (`mcp:`) stehen NICHT hier: sie haben
 * ihre Stufen-Auswahl in der jeweiligen Konnektor-Zeile (McpToolStages).
 */
import { memo } from 'react';
import { FiTrash2 } from 'react-icons/fi';

import { useRevokeToolApproval, useToolApprovals } from '../hooks/useToolApprovals';
import { approvalDisplayLabel } from '../lib/toolApprovalsApi';

interface ToolApprovalsSectionProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const ToolApprovalsSection = memo(function ToolApprovalsSection({
  onSuccess,
  onError,
}: ToolApprovalsSectionProps) {
  const { data: allApprovals, isLoading } = useToolApprovals();
  const approvals = allApprovals?.filter((a) => !a.scopeKey.startsWith('mcp:'));
  const revoke = useRevokeToolApproval();

  const handleRevoke = (scopeKey: string, label: string): void => {
    revoke.mutate(scopeKey, {
      onSuccess: () => onSuccess(`${label} fragt wieder nach.`),
      onError: (err: unknown) =>
        onError(err instanceof Error ? err.message : 'Widerruf fehlgeschlagen'),
    });
  };

  // Ohne je erteilte Freigabe wäre der Abschnitt eine leere Behauptung — er
  // erscheint erst, wenn es etwas zu verwalten gibt.
  if (isLoading || !approvals || approvals.length === 0) return null;

  return (
    <section>
      <h3 className="mt-0 mb-sm text-sm font-semibold text-foreground-heading">
        Immer erlaubte Werkzeuge
      </h3>
      <p className="m-0 max-w-xl text-sm leading-relaxed text-grey-500">
        Diese Werkzeuge laufen im Chat ohne Rückfrage. Entfernst du eines, fragt der Chat vor der
        nächsten Ausführung wieder nach.
      </p>

      <ul className="mt-md list-none space-y-2 p-0">
        {approvals.map((approval) => {
          const label = approvalDisplayLabel(approval);
          return (
            <li
              key={approval.scopeKey}
              className="flex items-center gap-md rounded-xl border border-grey-200 px-md py-2.5 dark:border-grey-700"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground-heading">
                {label}
              </span>
              <button
                type="button"
                onClick={() => handleRevoke(approval.scopeKey, label)}
                disabled={revoke.isPending}
                className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-xs font-medium text-grey-500 transition-colors hover:text-foreground disabled:opacity-50"
              >
                <FiTrash2 className="h-3.5 w-3.5" />
                Entfernen
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

export default ToolApprovalsSection;
