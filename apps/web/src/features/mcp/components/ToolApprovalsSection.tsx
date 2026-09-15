/**
 * „Immer erlaubte Werkzeuge" — die dauerhaften Freigaben, die im Chat über
 * „Immer erlauben" entstanden sind. Erteilt wird hier nichts; nur widerrufen.
 */
import { memo } from 'react';
import { FiShield, FiTrash2 } from 'react-icons/fi';

import { useRevokeToolApproval, useToolApprovals } from '../hooks/useToolApprovals';
import { toolNameFromScopeKey } from '../lib/toolApprovalsApi';

interface ToolApprovalsSectionProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const ToolApprovalsSection = memo(function ToolApprovalsSection({
  onSuccess,
  onError,
}: ToolApprovalsSectionProps) {
  const { data: approvals, isLoading } = useToolApprovals();
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
      <div className="flex items-center gap-md">
        <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] border border-primary-100 bg-primary-50 text-primary dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-400">
          <FiShield className="h-6 w-6" />
        </div>
        <h2 className="m-0 text-2xl font-semibold tracking-tight text-foreground-heading">
          Immer erlaubte Werkzeuge
        </h2>
      </div>
      <p className="mt-sm max-w-xl text-sm leading-relaxed text-grey-500">
        Diese Werkzeuge laufen im Chat ohne Rückfrage. Entfernst du eines, fragt der Chat vor der
        nächsten Ausführung wieder nach.
      </p>

      <ul className="mt-md list-none space-y-2 p-0">
        {approvals.map((approval) => {
          const label = approval.toolLabel ?? toolNameFromScopeKey(approval.scopeKey);
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
