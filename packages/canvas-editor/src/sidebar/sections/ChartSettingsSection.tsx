import { Switch } from '@gruenerator/ui';
import { FaTrash, FaPlus } from 'react-icons/fa';
import { PiChartBar, PiChartLine, PiChartPie } from 'react-icons/pi';

import { CHART_COLORS, type ChartInstance, type ChartType } from '../../utils/chartUtils';

import type { IconType } from 'react-icons';

export interface ChartSettingsSectionProps {
  selectedChart: ChartInstance | null;
  onUpdateChart: (id: string, partial: Partial<ChartInstance>) => void;
  onRemoveChart: (id: string) => void;
}

const TYPE_OPTIONS: { id: ChartType; label: string; icon: IconType }[] = [
  { id: 'bar', label: 'Balken', icon: PiChartBar },
  { id: 'line', label: 'Linie', icon: PiChartLine },
  { id: 'pie', label: 'Kreis', icon: PiChartPie },
];

export function ChartSettingsSection({
  selectedChart,
  onUpdateChart,
  onRemoveChart,
}: ChartSettingsSectionProps) {
  const chart = selectedChart;
  if (!chart) return null;
  const update = (partial: Partial<ChartInstance>) => onUpdateChart(chart.id, partial);

  const setDataPoint = (index: number, key: 'name' | 'value', value: string) => {
    const data = chart.data.map((d, i) =>
      i === index ? { ...d, [key]: key === 'value' ? Number(value) || 0 : value } : d
    );
    update({ data });
  };

  const addRow = () => {
    const nextLabel = String.fromCharCode(65 + chart.data.length); // A, B, C…
    update({ data: [...chart.data, { name: nextLabel, value: 0 }] });
  };

  const removeRow = (index: number) => {
    if (chart.data.length <= 1) return;
    update({ data: chart.data.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex flex-col gap-4 p-md w-full min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Diagramm</span>
        <button
          type="button"
          onClick={() => onRemoveChart(chart.id)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
          title="Diagramm löschen"
        >
          <FaTrash size={12} /> Löschen
        </button>
      </div>

      {/* Chart type */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Typ
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = chart.chartType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => update({ chartType: opt.id })}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                  active
                    ? 'border-primary-500 bg-primary-500/10 text-foreground'
                    : 'border-grey-300 text-foreground-muted hover:border-primary-500 dark:border-grey-600'
                }`}
              >
                <Icon size={18} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Title */}
      <label className="flex flex-col gap-1.5 text-xs">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Titel
        </span>
        <input
          type="text"
          value={chart.title ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Optional…"
          className="rounded-md border border-grey-300 bg-background px-sm py-xs text-sm text-foreground outline-none focus:border-primary-500 dark:border-grey-600"
        />
      </label>

      {/* Data table */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Daten
        </span>
        <div className="flex flex-col gap-1.5">
          {chart.data.map((point, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={point.name}
                onChange={(e) => setDataPoint(i, 'name', e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-grey-300 bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary-500 dark:border-grey-600"
              />
              <input
                type="number"
                value={point.value}
                onChange={(e) => setDataPoint(i, 'value', e.target.value)}
                className="w-16 rounded-md border border-grey-300 bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary-500 dark:border-grey-600"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={chart.data.length <= 1}
                className="shrink-0 rounded-md p-1.5 text-foreground-muted hover:text-red-600 disabled:opacity-30"
                title="Zeile entfernen"
              >
                <FaTrash size={11} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-grey-300 px-2 py-1.5 text-xs text-foreground-muted hover:border-primary-500 hover:text-foreground dark:border-grey-600"
        >
          <FaPlus size={10} /> Zeile hinzufügen
        </button>
      </div>

      {/* Colors */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Farbe
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {CHART_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update({ colors: [c, ...CHART_COLORS.filter((x) => x !== c)] })}
              title={c}
              className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline: chart.colors[0] === c ? '2px solid var(--editor-accent, #005538)' : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2">
        {(
          [
            ['showLegend', 'Legende'],
            ['showGrid', 'Gitternetz'],
            ['showValues', 'Werte anzeigen'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-foreground">{label}</span>
            <Switch checked={!!chart[key]} onCheckedChange={(v) => update({ [key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}
