/**
 * „Immer erlaubte Werkzeuge" — die dauerhaften Freigaben, die im Chat über
 * „Immer erlauben" entstanden sind. Erteilt wird hier nichts; nur widerrufen.
 *
 * Werkzeuge selbst verbundener Server (`mcp:`) stehen NICHT hier: sie haben
 * ihre Stufen-Auswahl in der jeweiligen Konnektor-Zeile (McpToolStages).
 */
import { Button } from '@gruenerator/ui';
import { memo } from 'react';
import { FiShield, FiTrash2 } from 'react-icons/fi';

import { useRevokeToolApproval, useToolApprovals } from '../hooks/useToolApprovals';
import { approvalDisplayLabel } from '../lib/toolApprovalsApi';

import { SettingsList, SettingsListRow } from '@/features/settings/components/SettingsListRow';
import SettingsSection from '@/features/settings/components/SettingsSection';

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
    <SettingsSection
      title="Immer erlaubte Werkzeuge"
      description="Diese Werkzeuge laufen im Chat ohne Rückfrage. Entfernst du eines, fragt der Chat vor der nächsten Ausführung wieder nach."
    >
      <SettingsList>
        {approvals.map((approval) => {
          const label = approvalDisplayLabel(approval);
          return (
            <SettingsListRow
              key={approval.scopeKey}
              mark={<FiShield size={14} />}
              name={label}
              actions={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(approval.scopeKey, label)}
                  disabled={revoke.isPending}
                >
                  <FiTrash2 />
                  Entfernen
                </Button>
              }
            />
          );
        })}
      </SettingsList>
    </SettingsSection>
  );
});

export default ToolApprovalsSection;
