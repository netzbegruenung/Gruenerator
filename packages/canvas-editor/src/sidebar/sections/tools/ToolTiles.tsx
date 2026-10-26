import { useId } from 'react';

import './toolTiles.css';

import type { ReactNode } from 'react';

// Each tile previews what its tool produces (checkerboard = transparency, text on
// a curve, a breathing blob). Motion lives entirely in toolTiles.css and only
// plays while the surrounding `.tool-tile-trigger` is hovered or focused.

export type ToolTileId =
  | 'remove-bg'
  | 'ai-create'
  | 'ai-edit'
  | 'alt-text'
  | 'unsplash'
  | 'qr-code'
  | 'gradient-text'
  | 'blob'
  | 'text-path';

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 72 72" width="76" height="76" className="block" aria-hidden="true">
      {children}
    </svg>
  );
}

function RemoveBgTile() {
  const id = useId();
  return (
    <Frame>
      <defs>
        <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#fff" />
          <rect width="4" height="4" className="tt-f100" />
          <rect x="4" y="4" width="4" height="4" className="tt-f100" />
        </pattern>
      </defs>
      <rect width="72" height="72" fill={`url(#${id})`} />
      <g className="tt-wipe">
        <rect x="36" width="36" height="72" className="tt-f300" />
        <circle cx="58" cy="14" r="5" fill="#fff" opacity=".8" />
        <line
          x1="36"
          y1="0"
          x2="36"
          y2="72"
          className="tt-k700"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </g>
      <circle cx="36" cy="32" r="10" className="tt-f700" />
      <path d="M17 72c0-12 8-21 19-21s19 9 19 21z" className="tt-f700" />
    </Frame>
  );
}

function AiCreateTile() {
  const id = useId();
  return (
    <Frame>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="tt-s100" />
          <stop offset="1" className="tt-s400" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" fill={`url(#${id})`} />
      <circle cx="52" cy="24" r="7" fill="#fff" opacity=".9" className="tt-sun" />
      <path d="M0 50Q18 36 36 46T72 42V72H0z" className="tt-f500" />
      <path d="M0 60Q24 48 48 58T72 56V72H0z" className="tt-f700" />
      <path
        d="M20 10C21 17 22 18 29 19C22 20 21 21 20 28C19 21 18 20 11 19C18 18 19 17 20 10Z"
        fill="#fff"
        className="tt-own tt-twinkle"
      />
      <path
        d="M33 26C33.5 29 34 29.5 37 30C34 30.5 33.5 31 33 34C32.5 31 32 30.5 29 30C32 29.5 32.5 29 33 26Z"
        fill="#fff"
        className="tt-own tt-twinkle-2"
      />
    </Frame>
  );
}

function AiEditTile() {
  const id = useId();
  return (
    <Frame>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="tt-s400" />
          <stop offset="1" className="tt-s700" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" className="tt-f100" />
      <circle cx="20" cy="22" r="6" fill="#fff" opacity=".9" />
      <path d="M0 48Q18 36 36 44T72 40V72H0z" className="tt-f400" />
      <path d="M0 58Q24 48 48 56T72 54V72H0z" className="tt-f500" />
      <g className="tt-wand">
        <rect
          x="31"
          y="34"
          width="8"
          height="40"
          rx="4"
          className="tt-f700"
          transform="rotate(-40 35 54)"
        />
        <rect x="31" y="34" width="8" height="9" rx="3" fill="#fff" transform="rotate(-40 35 54)" />
      </g>
      <path
        d="M34 14C35.4 22 36 22.6 44 24C36 25.4 35.4 26 34 34C32.6 26 32 25.4 24 24C32 22.6 32.6 22 34 14Z"
        fill={`url(#${id})`}
        className="tt-own tt-spark"
      />
      <path
        d="M52 12C52.6 15.4 53 15.8 56 16.4C53 17 52.6 17.4 52 20.8C51.4 17.4 51 17 48 16.4C51 15.8 51.4 15.4 52 12Z"
        fill="#fff"
        className="tt-own tt-spark-2"
      />
      <path
        d="M56 32C56.5 34.5 56.8 34.8 59 35.2C56.8 35.6 56.5 35.9 56 38.4C55.5 35.9 55.2 35.6 53 35.2C55.2 34.8 55.5 34.5 56 32Z"
        fill="#fff"
        className="tt-own tt-spark-3"
      />
    </Frame>
  );
}

function AltTextTile() {
  return (
    <Frame>
      <rect width="72" height="72" fill="#fff" />
      <rect x="12" y="10" width="48" height="30" rx="5" className="tt-f300" />
      <path d="M12 34Q26 24 38 32T60 30V35a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z" className="tt-f500" />
      <g className="tt-own tt-tag">
        <rect x="16" y="14" width="20" height="10" rx="3" className="tt-f700" />
        <text
          x="26"
          y="21.6"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill="#fff"
          fontFamily="PT Sans, sans-serif"
        >
          ALT
        </text>
      </g>
      <rect x="12" y="48" width="40" height="4" rx="2" className="tt-f700 tt-own-left tt-type" />
      <rect x="12" y="56" width="28" height="4" rx="2" className="tt-f200 tt-own-left tt-type-2" />
    </Frame>
  );
}

function UnsplashTile() {
  return (
    <Frame>
      <rect width="72" height="72" className="tt-f50" />
      <rect x="18" y="16" width="36" height="42" rx="4" className="tt-f200 tt-fan-l" />
      <rect x="18" y="16" width="36" height="42" rx="4" className="tt-f300 tt-fan-r" />
      <g className="tt-lift">
        <rect x="18" y="14" width="36" height="44" rx="4" fill="#fff" />
        <rect x="21" y="17" width="30" height="30" rx="2" className="tt-f500" />
        <circle cx="44" cy="24" r="3.5" className="tt-f100" />
        <path d="M21 40l9-9 8 8 4-4 9 9v3H21z" className="tt-f700" />
      </g>
    </Frame>
  );
}

const QR_DOTS: ReadonlyArray<readonly [number, number]> = [
  [32, 13],
  [37, 19],
  [32, 23],
  [13, 32],
  [19, 37],
  [47, 32],
  [54, 37],
  [46, 46],
  [54, 54],
  [47, 55],
  [55, 46],
  [37, 49],
  [32, 55],
];

function QrCodeTile() {
  const id = useId();
  return (
    <Frame>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="tt-s400" stopOpacity="0" />
          <stop offset="1" className="tt-s400" stopOpacity=".45" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" fill="#fff" />
      <g fill="none" className="tt-k700" strokeWidth="3">
        <rect x="13.5" y="13.5" width="13" height="13" rx="2" />
        <rect x="45.5" y="13.5" width="13" height="13" rx="2" />
        <rect x="13.5" y="45.5" width="13" height="13" rx="2" />
      </g>
      <g className="tt-f700">
        <rect x="17" y="17" width="6" height="6" rx="1" />
        <rect x="49" y="17" width="6" height="6" rx="1" />
        <rect x="17" y="49" width="6" height="6" rx="1" />
        {QR_DOTS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" />
        ))}
      </g>
      <rect
        x="29"
        y="29"
        width="14"
        height="14"
        rx="4"
        className="tt-f500"
        stroke="#fff"
        strokeWidth="2"
      />
      <g className="tt-scan">
        <rect x="6" y="-10" width="60" height="10" fill={`url(#${id})`} />
        <rect x="6" y="-1.5" width="60" height="1.5" rx=".75" className="tt-f400" />
      </g>
    </Frame>
  );
}

function GradientTextTile() {
  const id = useId();
  const gradientId = `${id}g`;
  const clipId = `${id}c`;
  const letters = (
    <text
      x="36"
      y="48"
      textAnchor="middle"
      fontSize="34"
      fontWeight="800"
      fontStyle="italic"
      fontFamily="Raleway, sans-serif"
    >
      Aa
    </text>
  );
  return (
    <Frame>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="tt-s400" />
          <stop offset="1" className="tt-s700" />
        </linearGradient>
        <clipPath id={clipId}>{letters}</clipPath>
      </defs>
      <rect width="72" height="72" fill="#fff" />
      <g fill={`url(#${gradientId})`}>{letters}</g>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="10" width="10" height="50" fill="#fff" opacity=".65" className="tt-shine" />
      </g>
    </Frame>
  );
}

function BlobTile() {
  const id = useId();
  return (
    <Frame>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="tt-s400" />
          <stop offset="1" className="tt-s700" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" className="tt-f50" />
      <path
        d="M40 13C51 13 60 20 59 32C58 43 52 50 42 56C32 62 19 60 14 50C9 40 14 31 21 23C27 16 32 13 40 13Z"
        fill={`url(#${id})`}
        className="tt-own tt-blob"
      />
    </Frame>
  );
}

function TextPathTile() {
  const id = useId();
  return (
    <Frame>
      <rect width="72" height="72" fill="#fff" />
      <path
        id={id}
        d="M10 52Q36 10 62 52"
        fill="none"
        className="tt-k200 tt-dash"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <text
        fontSize="10.5"
        fontWeight="700"
        className="tt-f700 tt-spread"
        fontFamily="Raleway, sans-serif"
        letterSpacing="1.2"
      >
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
          PFADTEXT
        </textPath>
      </text>
      <circle cx="10" cy="52" r="3.2" fill="#fff" className="tt-k500" strokeWidth="1.8" />
      <circle cx="62" cy="52" r="3.2" fill="#fff" className="tt-k500" strokeWidth="1.8" />
    </Frame>
  );
}

const TILES: Record<ToolTileId, () => ReactNode> = {
  'remove-bg': RemoveBgTile,
  'ai-create': AiCreateTile,
  'ai-edit': AiEditTile,
  'alt-text': AltTextTile,
  unsplash: UnsplashTile,
  'qr-code': QrCodeTile,
  'gradient-text': GradientTextTile,
  blob: BlobTile,
  'text-path': TextPathTile,
};

export function ToolTile({ id }: { id: ToolTileId }) {
  const Tile = TILES[id];
  return (
    <div className="size-[76px] shrink-0 overflow-hidden rounded-[20px] [contain:paint] shadow-[inset_0_0_0_1px_rgba(0,0,0,.06),0_1px_3px_rgba(0,0,0,.08)]">
      <Tile />
    </div>
  );
}
