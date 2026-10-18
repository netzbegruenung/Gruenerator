import { type MarketplaceItem } from '@gruenerator/contracts';
import { canReport } from '@gruenerator/shared/marketplace';
import { Button } from '@gruenerator/ui';
import { type JSX } from 'react';
import { PiArrowLeft, PiCheck, PiFlag, PiHeart, PiHeartFill, PiPlus } from 'react-icons/pi';

import { VisualImage, metaLine, viewOf } from './kindViews';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * An item opened in the Marktplatz — the Agentura's detail for every kind:
 * what it is, save it („Zu meinen Grüneratoren" or „Merken"), the kind's own
 * ways on (chat, product page, Vorlage, Profilbild), like and report.
 */
export function MarketplaceItemDetail({
  item,
  actions,
  onBack,
}: {
  item: MarketplaceItem;
  actions: MarketplaceActions;
  onBack: () => void;
}): JSX.Element {
  const view = viewOf(item);
  const visual = view.visual(item);
  const { PrimaryActions } = view;

  return (
    <div className="flex flex-col gap-lg">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-xs text-sm font-semibold text-foreground-muted transition-colors hover:text-primary-700 dark:hover:text-primary-300"
      >
        <PiArrowLeft aria-hidden className="h-4 w-4" />
        Zurück zum Marktplatz
      </button>

      {visual.type === 'image' && (
        <VisualImage
          visual={visual}
          className="max-w-md rounded-xl border border-grey-200 dark:border-grey-700"
        />
      )}

      <header className="flex items-center gap-md">
        {visual.type === 'icon' && (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background-alt text-3xl text-foreground-heading">
            {visual.icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="m-0 text-2xl leading-tight font-bold tracking-tight text-foreground-heading">
            {item.title}
          </h3>
          <p className="m-0 mt-1 text-sm text-foreground-muted">{metaLine(item)}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-sm">
        {!item.isOwn && (
          <Button
            variant={item.saved ? 'outline' : 'brand'}
            aria-pressed={item.saved}
            onClick={() => actions.toggleSave(item)}
          >
            {item.saved ? <PiCheck aria-hidden /> : <PiPlus aria-hidden />}
            {item.saved ? view.saveLabel.added : view.saveLabel.add}
          </Button>
        )}
        <PrimaryActions item={item} />
        <Button
          variant="ghost"
          aria-pressed={item.liked}
          aria-label={`Gefällt mir (${item.likesCount})`}
          title="Gefällt mir"
          onClick={() => actions.toggleLike(item)}
        >
          {item.liked ? (
            <PiHeartFill aria-hidden className="text-primary-600 dark:text-primary-400" />
          ) : (
            <PiHeart aria-hidden />
          )}
          <span aria-hidden className="tabular-nums">
            {item.likesCount}
          </span>
        </Button>
        {canReport(item) && (
          <Button variant="ghost" onClick={() => actions.report(item)}>
            <PiFlag aria-hidden />
            Melden
          </Button>
        )}
      </div>

      {item.description && (
        <p className="m-0 max-w-[60ch] text-base leading-relaxed text-foreground">
          {item.description}
        </p>
      )}
    </div>
  );
}
