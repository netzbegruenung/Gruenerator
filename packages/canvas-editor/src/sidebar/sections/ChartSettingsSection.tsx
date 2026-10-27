import { CustomColorSwatch } from '@ggraphic/editor/components/CustomColorSwatch';
import {
  addChartRow,
  addChartSeries,
  chartColors,
  chartLegendPosition,
  chartSeries,
  isRoundChartType,
  removeChartRow,
  removeChartSeries,
  renameChartSeries,
  setChartValue,
  type ChartInstance,
  type ChartLegendPosition,
  type ChartType,
} from '@ggraphic/editor/utils/chartUtils';
import { Switch } from '@gruenerator/ui';
import { FaTrash, FaPlus } from 'react-icons/fa';
import {
  PiChartBar,
  PiChartBarHorizontal,
  PiChartDonut,
  PiChartLine,
  PiChartLineUp,
  PiChartPie,
} from 'react-icons/pi';

import { MOBILE_INPUT_TEXT } from '../sidebarStyles';

import type { IconType } from 'react-icons';

export interface ChartSettingsSectionProps {
  selectedChart: ChartInstance | null;
  onUpdateChart: (id: string, partial: Partial<ChartInstance>) => void;
  onRemoveChart: (id: string) => void;
  /** The swatches: the page's country palette. */
  palette?: readonly string[];
}

const TYPE_OPTIONS: { id: ChartType; label: string; icon: IconType }[] = [
  { id: 'bar', label: 'Säulen', icon: PiChartBar },
  { id: 'bar-horizontal', label: 'Balken', icon: PiChartBarHorizontal },
  { id: 'line', label: 'Linie', icon: PiChartLine },
  { id: 'area', label: 'Fläche', icon: PiChartLineUp },
  { id: 'pie', label: 'Torte', icon: PiChartPie },
  { id: 'donut', label: 'Donut', icon: PiChartDonut },
];

const LEGEND_OPTIONS: { id: ChartLegendPosition; label: string }[] = [
  { id: 'right', label: 'Rechts' },
  { id: 'bottom', label: 'Unten' },
];

/** More series than colours in a palette would repeat a colour. */
const MAX_SERIES = 5;

const CELL = `rounded-md border border-editor-border-strong bg-background px-2 py-1 text-sm ${MOBILE_INPUT_TEXT} text-foreground outline-none focus:border-primary-500`;

export function ChartSettingsSection({
  selectedChart,
  onUpdateChart,
  onRemoveChart,
  palette = chartColors(),
}: ChartSettingsSectionProps) {
  const chart = selectedChart;
  if (!chart) return null;
  const update = (partial: Partial<ChartInstance>) => onUpdateChart(chart.id, partial);

  const round = isRoundChartType(chart.chartType);
  // Pies show the first series only; the table shows what the chart draws.
  const series = chartSeries(chart);
  const columns = series ?? [{ name: '', values: chart.data.map((d) => d.value) }];

  const setName = (index: number, name: string) =>
    update({ data: chart.data.map((d, i) => (i === index ? { ...d, name } : d)) });

  const addRow = () => {
    const nextLabel = String.fromCharCode(65 + chart.data.length); // A, B, C…
    update(addChartRow(chart, nextLabel));
  };

  const removeRow = (index: number) => {
    if (chart.data.length <= 1) return;
    update(removeChartRow(chart, index));
  };

  const addSeries = () =>
    update({ ...addChartSeries(chart), ...(series ? {} : { showLegend: true }) });

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
                onClick={() => {
                  const partial: Partial<ChartInstance> = { chartType: opt.id };
                  if (isRoundChartType(opt.id) !== isRoundChartType(chart.chartType)) {
                    partial.showLegend = isRoundChartType(opt.id);
                    partial.showGrid = !isRoundChartType(opt.id);
                  }
                  update(partial);
                }}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                  active
                    ? 'border-[var(--editor-accent)] bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]'
                    : 'border-[var(--editor-border-strong)] text-[var(--editor-text-muted)] hover:border-[var(--editor-accent)]'
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
          className={`rounded-md border border-editor-border-strong bg-background px-sm py-xs text-sm ${MOBILE_INPUT_TEXT} text-foreground outline-none focus:border-primary-500`}
        />
      </label>

      {/* Data table: one column per series */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Daten
        </span>
        <div className="flex flex-col gap-1.5">
          {series ? (
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1" />
              {series.map((s, si) => (
                <div key={si} className="flex w-16 shrink-0 items-center">
                  <input
                    type="text"
                    value={s.name}
                    aria-label={`Name der Reihe ${si + 1}`}
                    onChange={(e) => update(renameChartSeries(chart, si, e.target.value))}
                    className={`min-w-0 flex-1 ${CELL} px-1 text-xs`}
                  />
                </div>
              ))}
              <span className="w-[27px] shrink-0" />
            </div>
          ) : null}
          {chart.data.map((point, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={point.name}
                aria-label={`Bezeichnung ${i + 1}`}
                onChange={(e) => setName(i, e.target.value)}
                className={`min-w-0 flex-1 ${CELL}`}
              />
              {columns.map((s, si) => (
                <input
                  key={si}
                  type="number"
                  value={s.values[i] ?? 0}
                  aria-label={
                    series ? `${s.name || `Reihe ${si + 1}`}: ${point.name}` : `Wert ${point.name}`
                  }
                  onChange={(e) => update(setChartValue(chart, i, si, Number(e.target.value) || 0))}
                  className={`w-16 shrink-0 ${CELL}`}
                />
              ))}
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
          {series ? (
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1" />
              {series.map((s, si) => (
                <button
                  key={si}
                  type="button"
                  onClick={() => update(removeChartSeries(chart, si))}
                  className="flex w-16 shrink-0 justify-center rounded-md p-1 text-foreground-muted hover:text-red-600"
                  title={`${s.name || `Reihe ${si + 1}`} entfernen`}
                >
                  <FaTrash size={11} />
                </button>
              ))}
              <span className="w-[27px] shrink-0" />
            </div>
          ) : null}
        </div>
        <div className="mt-1 flex gap-1.5">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-editor-border-strong px-2 py-1.5 text-xs text-foreground-muted hover:border-primary-500 hover:text-foreground"
          >
            <FaPlus size={10} /> Zeile
          </button>
          {round ? null : (
            <button
              type="button"
              onClick={addSeries}
              disabled={columns.length >= MAX_SERIES}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-editor-border-strong px-2 py-1.5 text-xs text-foreground-muted hover:border-primary-500 hover:text-foreground disabled:opacity-40"
            >
              <FaPlus size={10} /> Datenreihe
            </button>
          )}
        </div>
      </div>

      {/* Colors */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Farbe
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update({ colors: [c, ...palette.filter((x) => x !== c)] })}
              title={c}
              className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline: chart.colors[0] === c ? '2px solid var(--editor-accent, #005538)' : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
          <CustomColorSwatch
            value={chart.colors[0]}
            presets={palette}
            onPick={(color) => update({ colors: [color, ...palette] })}
            className="size-6"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2">
        {(
          [
            // A single series needs no legend; pies draw no grid.
            ...(round || series ? [['showLegend', 'Legende'] as const] : []),
            ...(round ? [] : [['showGrid', 'Gitternetz'] as const]),
            ['showValues', 'Werte anzeigen'] as const,
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-foreground">{label}</span>
            <Switch
              aria-label={label}
              checked={!!chart[key]}
              onCheckedChange={(v) => update({ [key]: v })}
            />
          </div>
        ))}
        {(round || series) && chart.showLegend ? (
          <div
            className="flex items-center justify-between"
            role="group"
            aria-label="Position der Legende"
          >
            <span className="text-xs text-foreground">Position der Legende</span>
            <div className="flex gap-1">
              {LEGEND_OPTIONS.map((opt) => {
                const active = chartLegendPosition(chart) === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ legendPosition: opt.id })}
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                      active
                        ? 'border-[var(--editor-accent)] bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]'
                        : 'border-[var(--editor-border-strong)] text-[var(--editor-text-muted)] hover:border-[var(--editor-accent)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
