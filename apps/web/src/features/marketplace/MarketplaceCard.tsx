import { type MarketplaceItem } from '@gruenerator/contracts';
import { canReport } from '@gruenerator/shared/marketplace';
import { DropdownMenuItem, DropdownMenuSeparator } from '@gruenerator/ui';
import { type JSX } from 'react';
import {
  PiBookmarkSimple,
  PiBookmarkSimpleFill,
  PiFlag,
  PiHeart,
  PiHeartFill,
} from 'react-icons/pi';

import { MarketCard } from '../agentura/components/MarketCard';

import { VisualImage, metaLine, viewOf } from './kindViews';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * One Marktplatz tile — the Agentura's `MarketCard` for every kind. Agents and
 * Rezepte carry their icon, Vorlagen, Sticker and Hintergründe their image;
 * frame, title, meta line and menu are the same.
 */
/** Like, save and report — the menu every Marktplatz card offers. */
export function MarketplaceMenuItems({
  item,
  actions,
}: {
  item: MarketplaceItem;
  actions: MarketplaceActions;
}): JSX.Element {
  const view = viewOf(item);
  return (
    <>
      <DropdownMenuItem onClick={() => actions.toggleLike(item)}>
        {item.liked ? <PiHeartFill /> : <PiHeart />}
        {item.liked ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
      </DropdownMenuItem>
      {!item.isOwn && (
        <DropdownMenuItem onClick={() => actions.toggleSave(item)}>
          {item.saved ? <PiBookmarkSimpleFill /> : <PiBookmarkSimple />}
          {item.saved ? view.saveLabel.remove : view.saveLabel.add}
        </DropdownMenuItem>
      )}
      {canReport(item) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => actions.report(item)}>
            <PiFlag />
            Melden
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

export function MarketplaceCard({
  item,
  actions,
  onSelect,
}: {
  item: MarketplaceItem;
  actions: MarketplaceActions;
  onSelect: () => void;
}): JSX.Element {
  const view = viewOf(item);
  const visual = view.visual(item);
  return (
    <MarketCard
      icon={visual.type === 'icon' ? visual.icon : undefined}
      media={visual.type === 'image' ? <VisualImage visual={visual} /> : undefined}
      title={item.title}
      meta={metaLine(item)}
      description={item.description ?? ''}
      onSelect={onSelect}
      headingLevel={3}
      menuItems={<MarketplaceMenuItems item={item} actions={actions} />}
    />
  );
}
