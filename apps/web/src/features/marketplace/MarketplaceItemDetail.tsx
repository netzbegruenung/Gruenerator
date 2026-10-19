import { type MarketplaceItem } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { type JSX } from 'react';
import { PiArrowLeft, PiCheck, PiPlus } from 'react-icons/pi';

import { VisualImage, metaLine, viewOf } from './kindViews';
import { MarketplaceDiscussion } from './MarketplaceDiscussion';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * An item opened in the Marktplatz — the Agentura's detail for every kind:
 * what it is, save it („Zu meinen Grüneratoren" or „Merken"), the kind's own
 * ways on (chat, product page, Vorlage, Profilbild), and the interaction block
 * every kind shares (like, link, report, reactions, comments).
 */
export function MarketplaceItemDetail({
  item,
  actions,
  onBack,
  shareHref,
  headingLevel,
  backLabel = 'Zurück zum Marktplatz',
}: {
  item: MarketplaceItem;
  actions: MarketplaceActions;
  onBack: () => void;
  /** Where „Link kopieren" points: the Marktplatz with this item open. */
  shareHref: string;
  /** The title's level: 2 under the page's `h1`, 3 under a dialog's title. */
  headingLevel: 2 | 3;
  /** The back link's text; a page inside the Marktplatz names where it leads. */
  backLabel?: string;
}): JSX.Element {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const view = viewOf(item);
  const visual = view.visual(item);
  const { PrimaryActions, DetailExtras } = view;

  return (
    <div className="flex flex-col gap-lg">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-xs text-sm font-semibold text-foreground-muted transition-colors hover:text-primary-700 dark:hover:text-primary-300"
      >
        <PiArrowLeft aria-hidden className="h-4 w-4" />
        {backLabel}
      </button>

      {DetailExtras ? (
        <DetailExtras item={item} />
      ) : (
        visual.type === 'image' && (
          <VisualImage
            visual={visual}
            className="max-w-md rounded-xl border border-grey-200 dark:border-grey-700"
          />
        )
      )}

      <header className="flex items-center gap-md">
        {visual.type === 'icon' && (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background-alt text-3xl text-foreground-heading">
            {visual.icon}
          </span>
        )}
        <div className="min-w-0">
          <Heading className="m-0 text-2xl leading-tight font-bold tracking-tight text-foreground-heading">
            {item.title}
          </Heading>
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
      </div>

      {item.description && (
        <p className="m-0 max-w-[60ch] text-base leading-relaxed text-foreground">
          {item.description}
        </p>
      )}

      <MarketplaceDiscussion
        target={{ kind: item.kind, ref: item.ref }}
        item={item}
        canModerate={item.isOwn}
        shareHref={shareHref}
        headingLevel={headingLevel === 3 ? 4 : 3}
      />
    </div>
  );
}
