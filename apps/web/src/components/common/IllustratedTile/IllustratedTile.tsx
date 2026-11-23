import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import './illustratedTile.css';

import { cn } from '@/utils/cn';

export type IllustratedTileProps = {
  title: string;
  /** One of `./illustrations`, or any SVG following their conventions. */
  illustration: ReactNode;
  className?: string;
} & ({ to: string } | { href: string });

/*
 * Sizes scale with the tile, which must sit in a `@container` (see
 * IllustratedTileGrid): measured on the 261 px design square, the title is
 * 30 px, the padding 26 px, the corner 24 px and the illustration 124 px.
 */
const TILE =
  'illustrated-tile relative flex aspect-square flex-col justify-between overflow-hidden ' +
  'rounded-[min(24px,9cqw)] p-[min(26px,10cqw)] no-underline ' +
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-primary-600 ' +
  'dark:focus-visible:outline-primary-400';

/**
 * A square link with its title at the top and an illustration at the bottom
 * right that plays on hover and keyboard focus. `to` stays in the app, `href`
 * opens in a new tab and says so to screen readers.
 */
export function IllustratedTile({
  title,
  illustration,
  className,
  ...target
}: IllustratedTileProps) {
  const body = (
    <>
      <span className="text-[min(30px,11.5cqw)] leading-[1.1] font-bold whitespace-nowrap">
        {title}
        {'href' in target && <span className="sr-only"> (öffnet in neuem Tab)</span>}
      </span>
      <span className="-mr-[min(6px,2.3cqw)] -mb-[min(6px,2.3cqw)] flex size-[min(124px,47.5cqw)] self-end">
        {illustration}
      </span>
    </>
  );

  return 'href' in target ? (
    <a href={target.href} target="_blank" rel="noopener noreferrer" className={cn(TILE, className)}>
      {body}
    </a>
  ) : (
    <Link to={target.to} className={cn(TILE, className)}>
      {body}
    </Link>
  );
}

/**
 * Lays tiles out as squares: on phones one swipeable row that snaps and lets
 * the next tile peek in, from `sm` a grid of `columns` (4 by default).
 */
export function IllustratedTileGrid({
  tiles,
  columns = 4,
}: {
  tiles: IllustratedTileProps[];
  columns?: 3 | 4 | 5;
}) {
  return (
    <ul
      className={cn(
        'm-0 -mx-4 -my-2 flex list-none snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-2 [scrollbar-width:none]',
        'sm:m-0 sm:grid sm:overflow-visible sm:p-0 lg:gap-5',
        { 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5' }[columns]
      )}
    >
      {tiles.map((tile) => (
        <li
          key={tile.title}
          className="@container w-[44%] max-w-52 shrink-0 snap-start sm:w-auto sm:max-w-none"
        >
          <IllustratedTile {...tile} />
        </li>
      ))}
    </ul>
  );
}
