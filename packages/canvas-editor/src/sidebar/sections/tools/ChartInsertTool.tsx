import { PiChartBar, PiChartLine, PiChartPie } from 'react-icons/pi';

import type { ChartType } from '../../../utils/chartUtils';
import type { IconType } from 'react-icons';

export interface ChartInsertToolProps {
  onInsertChart: (chartType: ChartType) => void;
}

const OPTIONS: { id: ChartType; label: string; icon: IconType }[] = [
  { id: 'bar', label: 'Balkendiagramm', icon: PiChartBar },
  { id: 'line', label: 'Liniendiagramm', icon: PiChartLine },
  { id: 'pie', label: 'Kreisdiagramm', icon: PiChartPie },
];

export function ChartInsertTool({ onInsertChart }: ChartInsertToolProps) {
  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      <p className="text-xs text-foreground-muted">
        Diagramm einfügen, dann anklicken um Daten & Typ zu bearbeiten.
      </p>
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onInsertChart(opt.id)}
            className="flex items-center gap-3 rounded-lg border border-grey-300 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-primary-500 hover:bg-primary-500/5 dark:border-grey-600"
          >
            <Icon size={22} className="text-primary-600 dark:text-primary-300" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
