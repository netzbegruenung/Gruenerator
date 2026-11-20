import { type ReactNode } from 'react';

/**
 * Hand-drawn icons for „Transparenz, MCP & Co". They are split into parts so each
 * one can tell its own short story on hover (see infoTiles.css): `it-part` plays a
 * keyframe animation, `it-move` travels to a second position while the tile is hovered.
 */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="info-tile__icon"
    >
      {children}
    </svg>
  );
}

const RIGHT_PAGE = 'M12 7c1.8-1.4 4.6-1.9 8-1.5v12c-3.4-.4-6.2.1-8 1.5';

/** Dokumentation: a leaf turns from the right page onto the left. */
export function BookIcon() {
  return (
    <Svg>
      <path d="M12 7C10.2 5.6 7.4 5.1 4 5.5v12c3.4-.4 6.2.1 8 1.5" />
      <path d={RIGHT_PAGE} />
      <path d="M12 7v12" />
      <path d="M6.6 9.4c1.2 0 2.2.2 3.1.6M6.6 12.4c1.2 0 2.2.2 3.1.6" />
      <path
        className="it-part it-book-lines"
        d="M17.4 9.4c-1.2 0-2.2.2-3.1.6M17.4 12.4c-1.2 0-2.2.2-3.1.6"
      />
      <path className="it-part it-book-leaf" d={RIGHT_PAGE} />
    </Svg>
  );
}

/** KI-Transparenz: the big star breathes, the two small ones twinkle after it. */
export function SparkleIcon() {
  return (
    <Svg>
      <path
        className="it-part it-spark-main"
        d="M10.5 5.5c.6 4 2.5 6 7 7-4.5 1-6.4 3-7 7-.6-4-2.5-6-7-7 4.5-1 6.4-3 7-7z"
      />
      <path
        className="it-part it-spark-a"
        fill="currentColor"
        strokeWidth={0.8}
        d="M18.5 3c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z"
      />
      <path
        className="it-part it-spark-b"
        fill="currentColor"
        strokeWidth={0.6}
        d="M19 16.4c.16 1 .6 1.44 1.6 1.6-1 .16-1.44.6-1.6 1.6-.16-1-.6-1.44-1.6-1.6 1-.16 1.44-.6 1.6-1.6z"
      />
    </Svg>
  );
}

/** Transparenz: the eye blinks once, then looks right and left. */
export function EyeIcon() {
  return (
    <Svg>
      <g className="it-part it-eye-lids">
        <path d="M2.5 12c2.4-4 5.6-6 9.5-6s7.1 2 9.5 6c-2.4 4-5.6 6-9.5 6s-7.1-2-9.5-6z" />
        <g className="it-part it-eye-iris">
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </g>
      </g>
    </Svg>
  );
}

/** MCP-Server: socket and plug meet while the tile is hovered, two sparks fly. */
export function PlugIcon() {
  return (
    <Svg>
      <g transform="rotate(-45 12 12)">
        <g className="it-move it-plug-socket">
          <path d="M2.5 12H6" />
          <rect x="6" y="8" width="4.5" height="8" rx="1.6" />
        </g>
        <g className="it-move it-plug-pins">
          <path d="M13.5 10h2.2M13.5 14h2.2M18.7 12h2.8" />
          <rect x="15.7" y="8" width="3" height="8" rx="1.4" />
        </g>
        <path className="it-part it-plug-spark" d="M12 5.6V3.8M12 18.4v1.8" />
      </g>
    </Svg>
  );
}

/** Datenschutz: the shield firms up and its check mark is drawn again. */
export function ShieldIcon() {
  return (
    <Svg>
      <path
        className="it-part it-shield-body"
        d="M12 3.2 5 5.8v5.4c0 4.4 2.8 8 7 9.6 4.2-1.6 7-5.2 7-9.6V5.8z"
      />
      <path className="it-part it-shield-check" pathLength={1} d="m8.8 12.2 2.3 2.3 4.2-4.6" />
    </Svg>
  );
}
