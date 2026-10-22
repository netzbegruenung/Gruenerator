import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  CardActionsMenu,
  ShowcaseCard,
  ShowcaseCardIcons,
  ShowcaseCardImage,
  ScrollArea,
  ScrollBar,
  ShowcaseCardPoster,
  type ShowcaseTone,
} from '@gruenerator/ui';
import { useEffect, useState, type JSX, type ReactNode } from 'react';

import { metaLine, viewOf } from './kindViews';
import { MarketplaceMenuItems } from './MarketplaceCard';
import { type MarketplaceActions } from './useMarketplaceActions';

/** Headline face of the Marktplatz front page, the same in both countries. */
export const DISPLAY_FONT = "'Raleway', 'PT Sans', sans-serif";

/** The tints take turns along a row, as on the collection cards. */
export const SHOWCASE_TONES: readonly ShowcaseTone[] = ['tanne', 'klee', 'sand'];

/**
 * The card grid of the collection and Landesverband pages: four columns once
 * they fit, and fewer entries leave the row short instead of widening the
 * cards — every card on a page keeps one width.
 */
export const SHOWCASE_GRID = 'grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

/**
 * A front-page shelf on a phone: one card at a time with the next peeking in,
 * swiped sideways instead of stacked four screens deep. From `sm` (`md` for
 * the collections) it is the grid again. Literal per breakpoint for Tailwind.
 */
export const SWIPE_ON_PHONE =
  'max-sm:-mx-4 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-px-4 max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-1 max-sm:[scrollbar-width:none] max-sm:[&>*]:w-[82%] max-sm:[&>*]:shrink-0 max-sm:[&>*]:snap-start';
export const SWIPE_BELOW_MD =
  'max-md:-mx-4 max-md:flex max-md:snap-x max-md:snap-mandatory max-md:scroll-px-4 max-md:overflow-x-auto max-md:px-4 max-md:pb-1 max-md:[scrollbar-width:none] max-md:[&>*]:w-[82%] max-md:[&>*]:shrink-0 max-md:[&>*]:snap-start sm:max-md:[&>*]:w-[46%]';

export const showcaseToneAt = (index: number): ShowcaseTone =>
  SHOWCASE_TONES[index % SHOWCASE_TONES.length]!;

/** „Neu" and the opened collection: the collection card's calm frame, with the kind's icon as one ghost mark. */
export function MarketplaceShowcaseCard({
  item,
  tone,
  actions,
  onSelect,
}: {
  item: MarketplaceItem;
  tone: ShowcaseTone;
  actions: MarketplaceActions;
  onSelect: () => void;
}): JSX.Element {
  return (
    <ShowcaseCard
      label={item.title}
      onActivate={onSelect}
      tone={tone}
      media={
        <ShowcaseCardIcons
          tone={tone}
          variant="ghost"
          size="compact"
          icons={[{ key: item.key, icon: viewOf(item).visual(item).icon }]}
        />
      }
      meta={metaLine(item)}
      title={item.title}
      description={item.description}
      titleFont={DISPLAY_FONT}
      size="compact"
      actions={
        actions && (
          <CardActionsMenu>
            <MarketplaceMenuItems item={item} actions={actions} />
          </CardActionsMenu>
        )
      }
    />
  );
}

/** Vorlagen, Sticker, Hintergründe: the preview fills the picture area; a sticker keeps its outline. */
export function MarketplaceVisualCard({
  item,
  tone,
  broken,
  actions,
  onSelect,
}: {
  item: MarketplaceItem;
  tone: ShowcaseTone;
  /** Its preview did not load; a Vorlage is then drawn as a mock sheet. */
  broken: boolean;
  /** `null` for a sample entry, which nobody can like, save or report. */
  actions: MarketplaceActions | null;
  onSelect: () => void;
}): JSX.Element {
  const visual = viewOf(item).visual(item);
  return (
    <ShowcaseCard
      label={item.title}
      onActivate={onSelect}
      tone={tone}
      media={
        item.kind === 'template' && (broken || visual.type !== 'image' || !visual.src) ? (
          <ShowcaseCardPoster title={item.title} titleFont={DISPLAY_FONT} />
        ) : visual.type === 'image' && visual.src ? (
          <ShowcaseCardImage src={visual.src} alt="" fit={visual.cutout ? 'contain' : 'cover'} />
        ) : null
      }
      meta={metaLine(item)}
      title={item.title}
      titleFont={DISPLAY_FONT}
      size="compact"
      mediaClassName="aspect-[4/3]"
      actions={
        actions && (
          <CardActionsMenu>
            <MarketplaceMenuItems item={item} actions={actions} />
          </CardActionsMenu>
        )
      }
    />
  );
}

/**
 * Keys of items whose preview does not load: a sticker or background leaves
 * the row instead of standing there with an icon, a Vorlage becomes a sheet.
 */
export function useBrokenPreviews(items: readonly MarketplaceItem[]): ReadonlySet<string> {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const probes = items.flatMap((item) => {
      const visual = viewOf(item).visual(item);
      if (visual.type !== 'image' || !visual.src) return [];
      const probe = new Image();
      probe.onerror = () =>
        setBroken((prev) => (prev.has(item.key) ? prev : new Set(prev).add(item.key)));
      probe.src = visual.src;
      return [probe];
    });
    return () => {
      for (const probe of probes) probe.onerror = null;
    };
  }, [items]);
  return broken;
}

/** A sideways row with the repo's thin scrollbar, below the cards instead of over them. */
export function ScrollRow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <ScrollArea className="-mx-1">
      <ul className="m-0 flex w-max list-none gap-md px-1 pt-1 pb-4">{children}</ul>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
