import { type ConventionArea } from '@gruenerator/contracts';

import { AREA_COLOR, AREA_LABEL, AREA_ORDER, TEXT_CLASS } from './shared';

/** Kreis für kreisfreie Städte, Raute für Kreise, Quadrat ohne KV: die Form trägt, wo Farbe nicht reicht. */
export function AreaMark({ area, size = 12 }: { area: ConventionArea; size?: number }) {
  const fill = AREA_COLOR[area];
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 12 12" className="shrink-0">
      {area === 'kreisfreie_stadt' ? (
        <circle cx={6} cy={6} r={5.5} fill={fill} />
      ) : area === 'kreis' ? (
        <path d="M6 0.3 11.7 6 6 11.7 0.3 6Z" fill={fill} />
      ) : (
        <rect x={1} y={1} width={10} height={10} rx={1.5} fill={fill} />
      )}
    </svg>
  );
}

export function AreaLegend() {
  return (
    <ul
      aria-label="Legende Herkunft"
      className={`m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm ${TEXT_CLASS}`}
    >
      {AREA_ORDER.map((a) => (
        <li key={a} className="flex items-center gap-1.5">
          <AreaMark area={a} />
          {AREA_LABEL[a]}
        </li>
      ))}
    </ul>
  );
}
