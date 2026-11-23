import { type CSSProperties, type ReactNode } from 'react';

/*
 * Line illustrations for IllustratedTile: 100 × 100 grid, round caps, drawn in
 * `currentColor` with the tile colour (`var(--tile)`) for knock-outs. Animated
 * parts carry `it-anim` plus the class whose `--it-anim` lives in
 * illustratedTile.css; `--it-delay` staggers parts that share one animation.
 */

const delay = (seconds: number) => ({ '--it-delay': `${seconds}s` }) as CSSProperties;

function Art({ children }: { children: ReactNode }) {
  return (
    <svg
      className="illustrated-tile__art size-full overflow-visible"
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const PAGE_RIGHT = 'M50 30C60 23 75 23 87 27V79C75 75 60 75 50 82Z';

/** An open book; a page turns and the lines write themselves. */
export function BookIllustration() {
  const lines = [
    { side: 'left', d: 'M22 41H40' },
    { side: 'left', d: 'M22 51H40' },
    { side: 'left', d: 'M22 61H34' },
    { side: 'right', d: 'M60 41H78' },
    { side: 'right', d: 'M60 51H78' },
    { side: 'right', d: 'M60 61H72' },
  ];
  return (
    <Art>
      <g strokeWidth={5.5}>
        <path d="M50 30C40 23 25 23 13 27V79C25 75 40 75 50 82Z" />
        <path d={PAGE_RIGHT} />
        {lines.map((line, i) => (
          <path
            key={line.d}
            className="it-anim it-book-line"
            data-side={line.side}
            style={delay((i % 3) * 0.08)}
            d={line.d}
          />
        ))}
        <path className="it-anim it-book-flip it-vb" d={PAGE_RIGHT} fill="var(--tile)" />
        <path d="M50 30V82" />
      </g>
    </Art>
  );
}

const BLADE = 'M48.4 33C46.6 24 47.6 13 50 5C52.4 13 53.4 24 51.6 33Z';

/** A wind turbine; the rotor spins up while gusts pass. */
export function WindTurbineIllustration() {
  return (
    <Art>
      <path className="it-anim it-wind-gust" style={delay(0)} d="M6 24H24" />
      <path className="it-anim it-wind-gust" style={delay(0.4)} d="M10 50H26" />
      <path className="it-anim it-wind-gust" style={delay(0.8)} d="M4 72H18" />
      <path d="M48.2 40L46 96H54L51.8 40Z" fill="currentColor" />
      <g className="it-anim it-wind-rotor it-vb">
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            d={BLADE}
            fill="currentColor"
            className="it-vb"
            style={{ transformOrigin: '0 0' }}
            transform={`rotate(${angle} 50 36)`}
          />
        ))}
      </g>
      <circle cx="50" cy="36" r="5" fill="currentColor" />
      <circle cx="50" cy="36" r="1.6" fill="var(--tile)" stroke="none" />
    </Art>
  );
}

/** Two arrows in opposite directions that trade places: an interface. */
export function ExchangeIllustration() {
  return (
    <Art>
      <g className="it-anim it-exchange-top" strokeWidth={8}>
        <path d="M22 36H72" />
        <path d="M61 25L73 36L61 47" />
      </g>
      <g className="it-anim it-exchange-bottom" strokeWidth={8}>
        <path d="M78 64H28" />
        <path d="M39 53L27 64L39 75" />
      </g>
    </Art>
  );
}

/** A padlock; the shackle opens and snaps shut. */
export function PadlockIllustration() {
  return (
    <Art>
      <g className="it-anim it-lock-body" strokeWidth={5.5}>
        <path className="it-anim it-lock-shackle" d="M37 46V34A13 13 0 0 1 63 34V46" />
        <rect x="26" y="46" width="48" height="40" rx="8" fill="var(--tile)" />
        <g className="it-anim it-lock-hole">
          <circle cx="50" cy="62" r="4.5" fill="currentColor" stroke="none" />
          <rect
            x="47.75"
            y="64"
            width="4.5"
            height="10"
            rx="2.25"
            fill="currentColor"
            stroke="none"
          />
        </g>
      </g>
    </Art>
  );
}
