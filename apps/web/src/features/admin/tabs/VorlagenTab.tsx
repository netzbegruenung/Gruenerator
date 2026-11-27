import {
  Button,
  CardGrid,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@gruenerator/ui';
import { useState } from 'react';

import SegmentedControl from '../../settings/components/SegmentedControl';
import { AdminEmptyState } from '../components/adminUi';
import VorlagenReviewCard from '../components/VorlagenReviewCard';
import {
  useAdminVorlagen,
  useVorlagenStats,
  useApproveVorlage,
  useRejectVorlage,
} from '../hooks/useAdminVorlagen';

type StatusTab = 'pending_review' | 'published' | 'rejected';

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'pending_review', label: 'Ausstehend' },
  { key: 'published', label: 'Freigegeben' },
  { key: 'rejected', label: 'Abgelehnt' },
];

const EMPTY_MESSAGE: Record<StatusTab, string> = {
  pending_review: 'Keine ausstehenden Vorlagen.',
  published: 'Noch keine freigegebenen Vorlagen.',
  rejected: 'Keine abgelehnten Vorlagen.',
};

/**
 * Die Prüfschlange für eingereichte Vorlagen. Der Reiter erscheint nur auf
 * Instanzen, die das Vorlagen-Werkzeug überhaupt anbieten — sonst prüfte hier
 * jemand Einreichungen für eine Fläche, die es auf der Instanz nicht gibt.
 */
export default function VorlagenTab() {
  const [status, setStatus] = useState<StatusTab>('pending_review');
  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [approveMessage, setApproveMessage] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: stats } = useVorlagenStats(true);
  const { data: vorlagen, isLoading } = useAdminVorlagen(status, true);
  const approveMutation = useApproveVorlage();
  const rejectMutation = useRejectVorlage();

  const statCounts: Record<StatusTab, number> = {
    pending_review: stats?.pending ?? 0,
    published: stats?.published ?? 0,
    rejected: stats?.rejected ?? 0,
  };

  const handleApproveConfirm = () => {
    if (!approveTarget) return;
    const trimmed = approveMessage.trim();
    approveMutation.mutate(
      { id: approveTarget, ...(trimmed ? { message: trimmed } : {}) },
      { onSuccess: () => setApproveTarget(null) }
    );
  };

  const handleRejectConfirm = () => {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    rejectMutation.mutate(
      { id: rejectTarget, ...(trimmed ? { reason: trimmed } : {}) },
      { onSuccess: () => setRejectTarget(null) }
    );
  };

  return (
    <>
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          options={STATUS_TABS.map(({ key, label }) => ({
            value: key,
            label: key === 'pending_review' ? `${label} · ${statCounts[key]}` : label,
            title: `${label}: ${statCounts[key]}`,
          }))}
          aria-label="Status der Vorlagen"
        />
        {!isLoading && vorlagen ? (
          <span className="text-sm text-grey-600 dark:text-grey-400" aria-live="polite">
            {vorlagen.length} {vorlagen.length === 1 ? 'Vorlage' : 'Vorlagen'}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <CardGrid columns="3">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-grey-200 dark:border-grey-800"
            >
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="p-md">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2 mt-1.5" />
              </div>
            </div>
          ))}
        </CardGrid>
      ) : !vorlagen || vorlagen.length === 0 ? (
        <AdminEmptyState>{EMPTY_MESSAGE[status]}</AdminEmptyState>
      ) : (
        <CardGrid columns="3">
          {vorlagen.map((v) => (
            <VorlagenReviewCard
              key={v.id}
              vorlage={v}
              onApprove={(id) => {
                setApproveTarget(id);
                setApproveMessage('');
              }}
              onReject={(id) => {
                setRejectTarget(id);
                setRejectReason('');
              }}
              isApproving={approveMutation.isPending && approveMutation.variables?.id === v.id}
              isRejecting={rejectMutation.isPending && rejectMutation.variables?.id === v.id}
            />
          ))}
        </CardGrid>
      )}

      <Dialog open={approveTarget !== null} onOpenChange={() => setApproveTarget(null)}>
        <DialogContent className="bg-background-pure">
          <DialogHeader>
            <DialogTitle>Vorlage freigeben</DialogTitle>
            <DialogDescription>
              Gib optional eine Nachricht an die einreichende Person mit.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={approveMessage}
            onChange={(e) => setApproveMessage(e.target.value)}
            placeholder="Nachricht (optional)..."
            aria-label="Nachricht an die einreichende Person"
            rows={3}
            className="w-full px-md py-sm border border-grey-200 dark:border-grey-700 rounded-md bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveTarget(null)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={handleApproveConfirm}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? 'Wird freigegeben...' : 'Freigeben'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectTarget !== null} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent className="bg-background-pure">
          <DialogHeader>
            <DialogTitle>Vorlage ablehnen</DialogTitle>
            <DialogDescription>Gib optional einen Grund für die Ablehnung an.</DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ablehnungsgrund (optional)..."
            aria-label="Ablehnungsgrund"
            rows={3}
            className="w-full px-md py-sm border border-grey-200 dark:border-grey-700 rounded-md bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="brand-danger"
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Wird abgelehnt...' : 'Ablehnen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
