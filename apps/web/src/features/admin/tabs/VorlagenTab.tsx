import {
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

import { cn } from '../../../utils/cn';
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
      <div className="grid grid-cols-3 gap-md mb-xl">
        {STATUS_TABS.map(({ key, label }) => (
          <div
            key={key}
            className={cn(
              'text-center p-md rounded-md border transition-colors',
              status === key
                ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                : 'border-grey-200 dark:border-grey-700 bg-background'
            )}
          >
            <p className="text-2xl font-bold text-foreground-heading m-0">{statCounts[key]}</p>
            <p className="text-sm text-grey-500 dark:text-grey-400 m-0 mt-xs">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-lg">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            aria-pressed={status === key}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md border-none cursor-pointer transition-colors',
              status === key
                ? 'bg-grey-200 dark:bg-grey-700 text-foreground'
                : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
            )}
          >
            {label} ({statCounts[key]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <CardGrid columns="3">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="rounded-md border border-grey-200 dark:border-grey-700 overflow-hidden"
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
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          {EMPTY_MESSAGE[status]}
        </p>
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
            <button
              type="button"
              onClick={() => setApproveTarget(null)}
              className="px-md py-xs rounded-md text-sm font-medium bg-transparent border border-grey-200 dark:border-grey-700 text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 cursor-pointer transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleApproveConfirm}
              disabled={approveMutation.isPending}
              className="px-md py-xs rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
            >
              {approveMutation.isPending ? 'Wird freigegeben...' : 'Freigeben'}
            </button>
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
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="px-md py-xs rounded-md text-sm font-medium bg-transparent border border-grey-200 dark:border-grey-700 text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 cursor-pointer transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
              className="px-md py-xs rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
            >
              {rejectMutation.isPending ? 'Wird abgelehnt...' : 'Ablehnen'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
