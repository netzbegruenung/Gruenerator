import { DOKU_URL } from '@gruenerator/shared/links';
import { type ReactNode } from 'react';
import { PiArrowUpRight } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { ArbeitenSection } from './ArbeitenSections';
import { BookIcon, EyeIcon, PlugIcon, ShieldIcon, SparkleIcon } from './InfoTileIcons';

import './infoTiles.css';

type InfoTile = {
  title: string;
  icon: ReactNode;
  /** Gradient pair from infoTiles.css; the hue walks from moss to eucalyptus along the row. */
  tone: 'moss' | 'fern' | 'sage' | 'mint' | 'eucalyptus';
} & ({ path: string } | { href: string });

const TILES: InfoTile[] = [
  { title: 'Dokumentation', icon: <BookIcon />, tone: 'moss', href: DOKU_URL },
  { title: 'KI-Transparenz', icon: <SparkleIcon />, tone: 'fern', path: '/ki-transparenz' },
  { title: 'Transparenz', icon: <EyeIcon />, tone: 'sage', path: '/transparenz' },
  { title: 'MCP-Server', icon: <PlugIcon />, tone: 'mint', path: '/apps' },
  { title: 'Datenschutz', icon: <ShieldIcon />, tone: 'eucalyptus', path: '/datenschutz' },
];

// Colours, depth and motion live in infoTiles.css; padding, icon and title scale with the
// square (cqw of the li), so the longest title stays on one line at every tile size.
const TILE =
  'info-tile relative flex aspect-square flex-col justify-between rounded-[min(22px,14cqw)] ' +
  'p-[min(20px,9cqw)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-primary-600 dark:focus-visible:outline-primary-400';

function TileBody({ tile, external }: { tile: InfoTile; external: boolean }) {
  return (
    <>
      <span className="flex items-start justify-between">
        <span className="info-tile__chip grid size-[min(60px,32cqw)] place-items-center rounded-[30%]">
          {tile.icon}
        </span>
        {external && (
          <PiArrowUpRight aria-hidden className="info-tile__arrow size-[min(18px,12cqw)]" />
        )}
      </span>
      <span className="text-[min(18px,11.5cqw)] leading-tight font-bold tracking-[-0.005em] whitespace-nowrap">
        {tile.title}
        {external && <span className="sr-only"> (öffnet in neuem Tab)</span>}
      </span>
    </>
  );
}

/** Where the Grünerator explains itself: docs, transparency, MCP and privacy. */
export function InfoTilesSection() {
  return (
    <ArbeitenSection title="Transparenz, MCP & Co">
      {/* Phone: one swipeable row of squares that snaps and lets the next one peek in
          (five squares in two columns were three rows of secondary links at the page's
          end). From sm all five in one row, on the page grid's five columns from lg. */}
      <ul className="m-0 -mx-4 -my-2 flex list-none snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:m-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:p-0 lg:gap-4">
        {TILES.map((tile) => (
          <li
            key={tile.title}
            className="@container w-[40%] max-w-44 shrink-0 snap-start sm:w-auto sm:max-w-none"
          >
            {'href' in tile ? (
              <a
                href={tile.href}
                target="_blank"
                rel="noopener noreferrer"
                className={TILE}
                data-tone={tile.tone}
              >
                <TileBody tile={tile} external />
              </a>
            ) : (
              <Link to={tile.path} className={TILE} data-tone={tile.tone}>
                <TileBody tile={tile} external={false} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </ArbeitenSection>
  );
}
