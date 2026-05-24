import type { SVGProps } from 'react';

import {
  BAR_D,
  GEAR_BODY_D,
  GEAR_CENTER_DOT_D,
  GHI_COG_SPIN_S,
  GHI_DOT_CYCLE_S,
  GHI_DOT_RADIUS,
  GHI_DOT_STAGGER_S,
  GHI_DOT_X,
  GHI_DOT_Y,
  GHI_FADE_S,
  GHI_GEAR_CENTER,
  GHI_VIEWBOX,
} from './grueneratorHomeIconGeometry';

interface Props extends SVGProps<SVGSVGElement> {
  loading?: boolean;
}

const GEAR_CENTER = GHI_GEAR_CENTER;
const DOT_Y = GHI_DOT_Y;
const DOT_RADIUS = GHI_DOT_RADIUS;
const DOT_X = GHI_DOT_X;
const DOT_CYCLE_S = GHI_DOT_CYCLE_S;
const DOT_STAGGER_S = GHI_DOT_STAGGER_S;
const FADE_S = GHI_FADE_S;

const KEYFRAMES = `
@keyframes ghi-cog-spin { to { transform: rotate(360deg); } }
@keyframes ghi-dot-pulse {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-20px); }
}
`;

const GrueneratorHomeIconLoading = ({ loading = false, ...svgProps }: Props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={GHI_VIEWBOX}
    fill="currentColor"
    width="1em"
    height="1em"
    {...svgProps}
  >
    <defs>
      <clipPath id="ghi-loading-clip-circle">
        <path d="M 240 352 L 305 352 L 305 416 L 240 416 Z" />
      </clipPath>
      <clipPath id="ghi-loading-clip-gear">
        <path d="M 98.34 190.85 L 465.34 210.13 L 446.05 577.13 L 79.06 557.84 Z" />
      </clipPath>
    </defs>

    <style>{KEYFRAMES}</style>

    {/* Cog — slow continuous spin */}
    <g transform={`translate(${GEAR_CENTER.x} ${GEAR_CENTER.y})`}>
      <g
        style={
          loading
            ? {
                transformOrigin: '0 0',
                animation: `ghi-cog-spin ${GHI_COG_SPIN_S}s linear infinite`,
              }
            : undefined
        }
      >
        <g transform={`translate(${-GEAR_CENTER.x} ${-GEAR_CENTER.y})`}>
          <g clipPath="url(#ghi-loading-clip-circle)">
            <g clipPath="url(#ghi-loading-clip-gear)">
              <path d={GEAR_CENTER_DOT_D} />
            </g>
          </g>
          <g clipPath="url(#ghi-loading-clip-gear)">
            <path fillRule="evenodd" d={GEAR_BODY_D} />
          </g>
        </g>
      </g>
    </g>

    {/* Bar — fades out while loading */}
    <g
      transform="translate(538, 495)"
      style={{
        opacity: loading ? 0 : 1,
        transition: `opacity ${FADE_S}s ease`,
      }}
    >
      <path d={BAR_D} />
    </g>

    {/* Three dots — fade in and pulse while loading. Animation runs always
        (cheap on compositor); opacity gates visibility with a smooth fade. */}
    {DOT_X.map((x, i) => (
      <g key={x} transform={`translate(${x} ${DOT_Y})`}>
        <g
          style={{
            transformOrigin: '0 0',
            opacity: loading ? 1 : 0,
            animation: `ghi-dot-pulse ${DOT_CYCLE_S}s ease-in-out ${(i * DOT_STAGGER_S).toFixed(
              2
            )}s infinite`,
            transition: `opacity ${FADE_S}s ease`,
          }}
        >
          <circle cx={0} cy={0} r={DOT_RADIUS} />
        </g>
      </g>
    ))}
  </svg>
);

export default GrueneratorHomeIconLoading;
