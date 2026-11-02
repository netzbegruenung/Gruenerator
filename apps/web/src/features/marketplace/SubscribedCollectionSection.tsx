import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  marketplaceHref,
  useCollectionSubscriptions,
  useMarketplaceFrontpage,
  useSubscribedContents,
} from '@gruenerator/shared/marketplace';
import { type CollectionContents } from '@gruenerator/shared/marketplace/frontpage';
import { Button } from '@gruenerator/ui';
import { type JSX, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useUserLibrary } from '../agentura/hooks/useUserLibrary';

import {
  agentTile,
  LaunchpadTiles,
  useLaunchpadTiles,
  type LaunchpadTile,
} from './CollectionLaunchpad';
import { DISPLAY_FONT } from './MarketplaceShowcaseCard';

import { useAuthStore } from '@/stores/authStore';

type Show = 'assets' | 'vorlagen' | 'agents';

const TITLE_CLASS = 'm-0 text-xl font-semibold text-foreground-heading';

function Frame({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-sm">
        <h2 className={TITLE_CLASS} style={{ fontFamily: DISPLAY_FONT }}>
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

function Actions({ contents }: { contents: CollectionContents }): JSX.Element {
  const { unsubscribe } = useCollectionSubscriptions();
  const { id } = contents.collection;
  return (
    <div className="flex items-center gap-sm">
      <Button asChild variant="ghost" size="sm">
        <Link to={marketplaceHref({ collection: id })}>Zur Kollektion</Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => unsubscribe(id).catch(() => toast.error('Abbestellen fehlgeschlagen.'))}
      >
        Kollektion abbestellen
      </Button>
    </div>
  );
}

/** Stickers, frames and backgrounds of one subscription, or its Vorlagen. */
function CollectionBody({
  contents,
  show,
}: {
  contents: CollectionContents;
  show: 'assets' | 'vorlagen';
}): JSX.Element | null {
  const tiles = useLaunchpadTiles(contents);
  const shown: LaunchpadTile[] = tiles.filter((t) => t.group === show);
  if (show === 'assets') {
    const frames: LaunchpadTile[] = contents.frames.map((frame) => ({
      key: `frame:${frame.id}`,
      group: 'assets',
      label: frame.label,
      target: { type: 'profilbild', frameId: frame.id },
      visual: <img src={frame.src} alt="" className="size-full object-contain" />,
    }));
    shown.unshift(...frames);
  }
  if (shown.length === 0) return null;
  const title = `Aus ${contents.collection.title}`;
  return (
    <Frame title={title} actions={<Actions contents={contents} />}>
      <LaunchpadTiles tiles={shown} label={title} />
    </Frame>
  );
}

/** The agents and recipes of every subscription, minus what the person already has. */
function AgentsBody({ contents }: { contents: readonly CollectionContents[] }): JSX.Element | null {
  const library = useUserLibrary();
  const page = useMarketplaceFrontpage();
  const items = useMemo<MarketplaceItem[]>(
    () => page.data?.collections.flatMap((c) => c.items) ?? [],
    [page.data]
  );
  const own = new Set(library.items.map((i) => `${i.kind}:${i.ref}`));
  const seen = new Set<string>();
  const tiles: LaunchpadTile[] = [];
  for (const { agents } of contents) {
    for (const agent of agents) {
      const key = `${agent.kind}:${agent.ref}`;
      if (own.has(key) || seen.has(key)) continue;
      seen.add(key);
      tiles.push(agentTile(agent, items));
    }
  }
  if (tiles.length === 0) return null;
  // One collection names itself and can be cancelled here; several are one „Aus Kollektionen".
  const [only] = contents;
  const single = contents.length === 1 && only ? only : null;
  const title = single ? `Aus ${single.collection.title}` : 'Aus Kollektionen';
  return (
    <Frame title={title} actions={single ? <Actions contents={single} /> : undefined}>
      <LaunchpadTiles tiles={tiles} label={title} />
    </Frame>
  );
}

/**
 * „Aus <Kollektion>" for the lists of what a person owns: one section per
 * subscription with its stickers, backgrounds or Vorlagen, or — for agents —
 * one section over all of them. Nothing without a subscription.
 */
export function SubscribedCollectionSection({ show }: { show: Show }): JSX.Element | null {
  const locale = useAuthStore((s) => s.locale);
  const subscribed = useSubscribedContents(locale === 'de-AT' ? 'de-AT' : 'de-DE');
  if (subscribed.length === 0) return null;
  if (show === 'agents') return <AgentsBody contents={subscribed} />;
  return (
    <>
      {subscribed.map((contents) => (
        <CollectionBody key={contents.collection.id} contents={contents} show={show} />
      ))}
    </>
  );
}
