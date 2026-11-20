import { DOKU_URL } from '@gruenerator/shared/links';
import { type CSSProperties } from 'react';
import { type IconType } from 'react-icons';
import {
  PiArrowUpRight,
  PiBookOpenText,
  PiCode,
  PiEye,
  PiLeaf,
  PiPersonArmsSpread,
  PiPlugs,
  PiShieldCheck,
  PiSparkle,
} from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { ArbeitenSection } from './ArbeitenSections';

import './infoTiles.css';

type InfoTile = {
  title: string;
  icon: IconType;
  /** Keyframes from infoTiles.css, the tile's own hover motion. */
  animation: string;
  /** Rotation/scale origin, e.g. a leaf sways from its stem. */
  origin?: string;
  duration?: string;
} & ({ path: string } | { href: string });

const TILES: InfoTile[] = [
  { title: 'Dokumentation', icon: PiBookOpenText, animation: 'info-page', href: DOKU_URL },
  { title: 'KI-Transparenz', icon: PiSparkle, animation: 'info-twinkle', path: '/ki-transparenz' },
  { title: 'Transparenz', icon: PiEye, animation: 'info-blink', path: '/transparenz' },
  { title: 'MCP-Server', icon: PiPlugs, animation: 'info-plug', path: '/apps' },
  { title: 'Datenschutz', icon: PiShieldCheck, animation: 'info-shield', path: '/datenschutz' },
  {
    title: 'Nachhaltigkeit',
    icon: PiLeaf,
    animation: 'info-sway',
    origin: '20% 90%',
    href: `${DOKU_URL}/docs/basics/nachhaltigkeit`,
  },
  {
    title: 'Open Source',
    icon: PiCode,
    animation: 'info-turn',
    duration: '800ms',
    href: `${DOKU_URL}/docs/basics/open-source`,
  },
  {
    title: 'Barrierefreiheit',
    icon: PiPersonArmsSpread,
    animation: 'info-hop',
    origin: '50% 100%',
    href: `${DOKU_URL}/docs/basics/barrierefreiheit`,
  },
];

// Square green tiles: white text on #2F6B4F is 6.3:1 (WCAG AA for all text sizes).
const TILE =
  'info-tile group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl ' +
  'bg-[#2F6B4F] p-[12cqw] text-white no-underline transition-colors hover:bg-[#285C44] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 ' +
  'dark:bg-[#24533D] dark:hover:bg-[#2B6148]';

function TileBody({ tile, external }: { tile: InfoTile; external: boolean }) {
  const Icon = tile.icon;
  const style = {
    '--info-anim': tile.animation,
    '--info-dur': tile.duration,
    transformOrigin: tile.origin,
  } as CSSProperties;
  return (
    <>
      <span className="flex items-start justify-between">
        <Icon aria-hidden className="info-tile__icon size-[min(36px,24cqw)]" style={style} />
        {external && <PiArrowUpRight aria-hidden className="size-4 opacity-70" />}
      </span>
      <span className="text-[min(16px,11cqw)] font-bold leading-tight break-words">
        {tile.title}
        {external && <span className="sr-only"> (öffnet in neuem Tab)</span>}
      </span>
    </>
  );
}

/** Where the Grünerator explains itself: docs, transparency, MCP, privacy and co. */
export function InfoTilesSection() {
  return (
    <ArbeitenSection title="Transparenz, MCP & Co">
      {/* Phone: one swipeable row of squares that snaps and lets the next one peek in
          (eight squares in two columns were four rows of secondary links). From sm a
          grid of four, from xl all eight in one row. */}
      <ul
        lang="de"
        className="m-0 -mx-4 flex list-none snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:gap-4 xl:grid-cols-8"
      >
        {TILES.map((tile) => (
          // Container: padding, icon and title scale with the square, so the longest
          // title („Barrierefreiheit") stays on one line from 130 px to 160 px squares.
          <li key={tile.title} className="@container w-[40%] shrink-0 snap-start sm:w-auto">
            {'href' in tile ? (
              <a href={tile.href} target="_blank" rel="noopener noreferrer" className={TILE}>
                <TileBody tile={tile} external />
              </a>
            ) : (
              <Link to={tile.path} className={TILE}>
                <TileBody tile={tile} external={false} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </ArbeitenSection>
  );
}
