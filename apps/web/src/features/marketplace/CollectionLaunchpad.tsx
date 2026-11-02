import {
  printVorlageThumbPath,
  sharepicVorlageThumbPath,
  type MarketplaceItem,
} from '@gruenerator/contracts';
import { type CollectionContents } from '@gruenerator/shared/marketplace/frontpage';
import { profilbildCatalogParams } from '@gruenerator/shared/profilbild';
import { cn } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { type JSX, type ReactNode } from 'react';
import { PiFileText, PiSparkle, PiUserCircle } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { flatCss } from '../studio-tools/utils/profilbildBackgrounds';
import { printVorlagenQuery, sharepicVorlagenQuery } from '../vorlagen/hooks/useSharepicVorlagen';

import { DISPLAY_FONT } from './MarketplaceShowcaseCard';

import { resolveApiAssetUrl } from '@/utils/platform';

/** Where a tile of a collection leads; the lists of a subscription link the same way. */
export type LaunchpadTarget =
  | { type: 'profilbild'; frameId: string | null }
  | { type: 'sharepic'; id: string }
  | { type: 'print'; id: string }
  | { type: 'sticker'; id: string }
  | { type: 'background'; id: string }
  | { type: 'agent'; ref: string }
  | { type: 'recipe'; ref: string };

const profilbildHref = (params: Record<string, string>): string => {
  const query = new URLSearchParams(params).toString();
  return query ? `/studio/profilbild?${query}` : '/studio/profilbild';
};

export function launchpadHref(target: LaunchpadTarget): string {
  switch (target.type) {
    case 'profilbild':
      return profilbildHref(
        target.frameId ? profilbildCatalogParams({ kind: 'frame', id: target.frameId }) : {}
      );
    case 'sharepic':
      return `/studio/vorlage/${encodeURIComponent(target.id)}`;
    case 'print':
      return `/studio/druck/${encodeURIComponent(target.id)}`;
    case 'sticker':
    case 'background':
      return profilbildHref(profilbildCatalogParams({ kind: target.type, id: target.id }));
    case 'agent':
      return `/agents/${encodeURIComponent(target.ref)}`;
    case 'recipe':
      return `/agentura/rezept/${encodeURIComponent(target.ref)}`;
  }
}

interface Tile {
  key: string;
  label: string;
  target: LaunchpadTarget;
  visual: ReactNode;
}

const FRAME = 'size-full object-contain';

const iconVisual = (icon: ReactNode) => (
  <span className="grid size-full place-items-center text-4xl text-foreground-muted">{icon}</span>
);

/**
 * „Los geht's" under the header of a subscribed collection: one tile per thing
 * to start with — the Profilbild, then Vorlagen, stickers, backgrounds and
 * agents. A Vorlage the catalogue does not know (other country, retired) has
 * no tile; nothing is shown when no tile is left.
 */
export function CollectionLaunchpad({
  contents,
  items = [],
}: {
  contents: CollectionContents;
  /** The collection's items, for the names of its agents and recipes. */
  items?: readonly MarketplaceItem[];
}): JSX.Element | null {
  const sharepics = useQuery({
    ...sharepicVorlagenQuery(),
    enabled: contents.sharepicVorlagen.length > 0,
  });
  const prints = useQuery({ ...printVorlagenQuery(), enabled: contents.printVorlagen.length > 0 });

  const tiles: Tile[] = [];
  const [frame] = contents.frames;
  if (frame || contents.stickers.length > 0 || contents.backgrounds.length > 0) {
    tiles.push({
      key: 'profilbild',
      label: 'Profilbild gestalten',
      target: { type: 'profilbild', frameId: frame?.id ?? null },
      visual: frame ? (
        <img src={frame.src} alt="" className={FRAME} />
      ) : (
        iconVisual(<PiUserCircle aria-hidden />)
      ),
    });
  }
  for (const id of contents.sharepicVorlagen) {
    const vorlage = sharepics.data?.find((v) => v.id === id);
    if (!vorlage) continue;
    tiles.push({
      key: `sharepic:${id}`,
      label: vorlage.titel,
      target: { type: 'sharepic', id },
      visual: (
        <img
          src={resolveApiAssetUrl(sharepicVorlageThumbPath(id, 1, vorlage.thumbVersion))}
          alt=""
          loading="lazy"
          className="h-full w-auto max-w-none"
        />
      ),
    });
  }
  for (const id of contents.printVorlagen) {
    const vorlage = prints.data?.find((v) => v.id === id);
    if (!vorlage) continue;
    tiles.push({
      key: `print:${id}`,
      label: vorlage.titel,
      target: { type: 'print', id },
      visual: (
        <img
          src={resolveApiAssetUrl(printVorlageThumbPath(id, 1, vorlage.thumbVersion))}
          alt=""
          loading="lazy"
          className="h-full w-auto max-w-none"
        />
      ),
    });
  }
  for (const sticker of contents.stickers) {
    tiles.push({
      key: `sticker:${sticker.id}`,
      label: sticker.label,
      target: { type: 'sticker', id: sticker.id },
      visual: <img src={sticker.src} alt="" loading="lazy" className={cn(FRAME, 'p-4')} />,
    });
  }
  for (const design of contents.backgrounds) {
    tiles.push({
      key: `background:${design.id}`,
      label: design.label,
      target: { type: 'background', id: design.id },
      visual: (
        <span className="relative block size-full" style={{ background: flatCss(design.base) }}>
          {design.overlays.map((o) => (
            <img key={o.src} src={o.src} alt="" className="absolute inset-0 size-full" />
          ))}
        </span>
      ),
    });
  }
  for (const agent of contents.agents) {
    const item = items.find((i) => i.kind === agent.kind && i.ref === agent.ref);
    tiles.push({
      key: `${agent.kind}:${agent.ref}`,
      label: item?.title ?? agent.ref,
      target:
        agent.kind === 'recipe'
          ? { type: 'recipe', ref: agent.ref }
          : { type: 'agent', ref: agent.ref },
      visual: iconVisual(
        agent.kind === 'recipe' ? <PiFileText aria-hidden /> : <PiSparkle aria-hidden />
      ),
    });
  }

  if (tiles.length === 0) return null;

  return (
    <section aria-labelledby="kollektion-startrampe" className="flex min-w-0 flex-col gap-4">
      <h2
        id="kollektion-startrampe"
        className="m-0 text-xl font-semibold text-foreground-heading"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Los geht’s
      </h2>
      <ul className="m-0 flex list-none snap-x gap-5 overflow-x-auto p-0 pb-2">
        {tiles.map((tile) => (
          <li key={tile.key} className="flex w-[160px] shrink-0 snap-start flex-col gap-2.5">
            <Link
              to={launchpadHref(tile.target)}
              aria-label={tile.label}
              className="block h-[160px] overflow-hidden rounded-[22px] bg-background-alt transition-transform duration-200 ease-out active:scale-[0.97]"
            >
              {tile.visual}
            </Link>
            <strong className="text-[0.9375rem] leading-[1.3] text-foreground-heading">
              {tile.label}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
