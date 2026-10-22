import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  MARKETPLACE_QUERY_KEY,
  canReport,
  isLibraryFullError,
  useMarketplaceLike,
  useMarketplaceSave,
} from '@gruenerator/shared/marketplace';
import { toast } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { ReportDialog } from '../../components/common/ReportDialog';

const LIKE_FAILED = 'Gefällt mir konnte nicht gespeichert werden.';
const SAVE_FAILED = 'Merken konnte nicht gespeichert werden.';

export interface MarketplaceActions {
  toggleLike: (item: MarketplaceItem) => void;
  /** „Zu meinen Grüneratoren" for Agents/Rezepte, „Merken" for everything else. */
  toggleSave: (item: MarketplaceItem) => void;
  /** Opens the report dialog; a no-op for what cannot be reported (`canReport`). */
  report: (item: MarketplaceItem) => void;
}

/**
 * Like, Merken and Melden for every Marktplatz item. `dialogs` belongs once
 * into the tree of the calling view.
 */
export function useMarketplaceActions(): { actions: MarketplaceActions; dialogs: ReactNode } {
  const queryClient = useQueryClient();
  const { mutate: like } = useMarketplaceLike();
  const { mutate: save } = useMarketplaceSave();
  const [reporting, setReporting] = useState<MarketplaceItem | null>(null);

  const toggleLike = useCallback(
    (item: MarketplaceItem) => like(item, { onError: () => toast.error(LIKE_FAILED) }),
    [like]
  );
  const toggleSave = useCallback(
    (item: MarketplaceItem) =>
      save(item, {
        // A full „Meine Grüneratoren" says so in the server's own sentence.
        onError: (error) => toast.error(isLibraryFullError(error) ? error.message : SAVE_FAILED),
      }),
    [save]
  );
  const report = useCallback((item: MarketplaceItem) => {
    if (canReport(item)) setReporting(item);
  }, []);

  const actions = useMemo<MarketplaceActions>(
    () => ({ toggleLike, toggleSave, report }),
    [toggleLike, toggleSave, report]
  );

  const dialogs = reporting && canReport(reporting) && (
    <ReportDialog
      open
      onOpenChange={(open) => !open && setReporting(null)}
      kind={reporting.reportKind}
      targetId={reporting.ref}
      title={reporting.title}
      // A report can hide the item at once; the lists should not keep showing it.
      onReported={() => void queryClient.invalidateQueries({ queryKey: MARKETPLACE_QUERY_KEY })}
    />
  );

  return { actions, dialogs };
}
