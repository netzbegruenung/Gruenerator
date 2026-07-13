import { eur } from '../utils/format';

export function BreakdownRow({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-md border-b border-border py-sm text-sm last:border-b-0">
      <span className="flex items-center gap-sm">
        <span className="text-base">{emoji}</span>
        {label}
      </span>
      <span className="font-semibold tabular-nums">{eur(value)}</span>
    </div>
  );
}
