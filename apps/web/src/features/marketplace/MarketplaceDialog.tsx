import { MARKETPLACE_KINDS, type MarketplaceKind } from '@gruenerator/contracts';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  marketplaceHref,
  type MarketplaceFilters,
  type MarketplaceTabSlug,
} from '@gruenerator/shared/marketplace';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@gruenerator/ui';
import { useState, type JSX } from 'react';
import { PiArrowSquareOut, PiX } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { type MarketplaceAssetItem } from './kindViews';
import { MarketplaceBrowser, MarketplaceToolbar, shownTab } from './MarketplaceBrowser';

export interface MarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What this popup offers — Agents and Rezepte on `/grueneratoren`, Sticker and Hintergründe in the studio. */
  kinds?: readonly MarketplaceKind[];
  initialTab?: MarketplaceTabSlug;
  initialQuery?: string;
  /** Picker mode: choosing a sticker or background hands it over and closes the popup. */
  onPick?: (item: MarketplaceAssetItem) => void;
  title?: string;
}

/**
 * The Marktplatz as a popup over the page it was opened from, limited to the
 * kinds that page is about. Filters stay local; „Im Marktplatz öffnen" carries
 * them over to `/marktplatz`.
 */
export function MarketplaceDialog({
  open,
  onOpenChange,
  kinds = MARKETPLACE_KINDS,
  initialTab,
  initialQuery = '',
  onPick,
  title = 'Marktplatz',
}: MarketplaceDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Blurred rather than only dimmed: the page below stays recognisable as context. */}
      <DialogContent
        showCloseButton={false}
        overlayProps={{ className: 'bg-black/30 backdrop-blur-md' }}
        className="flex h-[min(88dvh,960px)] w-full flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-[min(1200px,calc(100%-3rem))]"
      >
        {open && (
          <DialogBody
            kinds={kinds}
            initialTab={initialTab}
            initialQuery={initialQuery}
            onPick={
              onPick
                ? (item) => {
                    onOpenChange(false);
                    onPick(item);
                  }
                : undefined
            }
            title={title}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({
  kinds,
  initialTab,
  initialQuery,
  onPick,
  title,
}: {
  kinds: readonly MarketplaceKind[];
  initialTab: MarketplaceTabSlug | undefined;
  initialQuery: string;
  onPick: ((item: MarketplaceAssetItem) => void) | undefined;
  title: string;
}) {
  const [filters, setFilters] = useState<MarketplaceFilters>(() => ({
    ...DEFAULT_MARKETPLACE_FILTERS,
    tab: shownTab(initialTab ?? DEFAULT_MARKETPLACE_FILTERS.tab, kinds),
    q: initialQuery,
  }));

  return (
    <>
      <div className="flex flex-col gap-sm border-b border-grey-200 px-lg pt-lg pb-md dark:border-grey-700">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-md">
          <DialogTitle className="m-0 text-[clamp(1.375rem,3vw,1.75rem)] leading-tight font-bold text-foreground-heading">
            {title}
          </DialogTitle>
          {/* Close sits in the same row as search and sort — one row of controls, not two levels. */}
          <div className="relative flex shrink-0 items-center gap-1 text-grey-500">
            <MarketplaceToolbar filters={filters} onChange={setFilters} kinds={kinds} />
            <Button asChild variant="ghost" size="icon">
              <Link
                to={marketplaceHref({ ...filters, tab: shownTab(filters.tab, kinds) })}
                aria-label="Im Marktplatz öffnen"
                title="Im Marktplatz öffnen"
              >
                <PiArrowSquareOut aria-hidden className="size-[18px]" />
              </Link>
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Schließen" title="Schließen">
                <PiX aria-hidden className="size-[18px]" />
              </Button>
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="m-0 max-w-[40rem] text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
          {onPick
            ? 'Was andere öffentlich teilen. Tippe ein Bild an, um es zu verwenden.'
            : kinds.some((kind) => kind === 'agent' || kind === 'recipe')
              ? 'Offizielle Inhalte, die deines Landesverbands und was andere öffentlich teilen.'
              : 'Was andere öffentlich teilen.'}
        </DialogDescription>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-lg">
        <MarketplaceBrowser filters={filters} onChange={setFilters} kinds={kinds} onPick={onPick} />
      </div>
    </>
  );
}
