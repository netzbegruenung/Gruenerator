import { AREA_COLOR, AREA_LABEL, AREA_ORDER, TEXT_CLASS } from './shared';

export function AreaLegend() {
  return (
    <ul
      aria-label="Legende Herkunft"
      className={`m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm ${TEXT_CLASS}`}
    >
      {AREA_ORDER.map((a) => (
        <li key={a} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: AREA_COLOR[a] }}
          />
          {AREA_LABEL[a]}
        </li>
      ))}
    </ul>
  );
}
