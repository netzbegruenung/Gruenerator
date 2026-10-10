import {
  type BarsBlock,
  type CalloutBlock,
  type CompareBlock,
  type StatsBlock,
  type StepsBlock,
  type TableBlock,
  type TimelineBlock,
  type VisualBlock as VisualBlockData,
  type VisualTone,
  barDisplay,
  barScale,
  calloutLabel,
} from '@gruenerator/contracts';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Info,
  Lightbulb,
  Loader2,
  OctagonAlert,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Suspense, type ReactNode } from 'react';

import { cn } from '../../lib/utils';
import {
  DataTable,
  type DataTableColumn,
  type DataTableFormat,
} from '../assistant-ui/elements/data-table';
import { field, paper } from '../assistant-ui/elements/surfaces';

import { LazyChatChart } from './LazyChatChart';

/**
 * Renders a parsed visual block (```bars, ```stats, … — see
 * `chatVisualBlocks.ts` in contracts). Every kind sits in the same paper card
 * as the vendored assistant-ui Elements, so a chart, a table and a callout in
 * one answer read as one family.
 *
 * Bars, steps, timelines and comparisons are real lists: the drawn parts are
 * decorative (`aria-hidden`), the text carries the content.
 */
export function VisualBlock({ visual }: { visual: VisualBlockData }) {
  switch (visual.kind) {
    case 'chart':
      return (
        <Suspense fallback={<VisualBlockPlaceholder />}>
          <LazyChatChart data={visual.block} />
        </Suspense>
      );
    case 'bars':
      return <Bars block={visual.block} />;
    case 'stats':
      return <Stats block={visual.block} />;
    case 'callout':
      return <Callout block={visual.block} />;
    case 'timeline':
      return <Timeline block={visual.block} />;
    case 'steps':
      return <Steps block={visual.block} />;
    case 'compare':
      return <Compare block={visual.block} />;
    case 'table':
      return <Table block={visual.block} />;
  }
}

/** Shown while the fence is still streaming in, instead of half-written JSON. */
export function VisualBlockPlaceholder() {
  return (
    <div
      className={cn(paper, 'my-3 flex min-h-24 items-center justify-center rounded-2xl')}
      role="status"
    >
      <Loader2 className="h-4 w-4 animate-spin text-foreground-muted" aria-hidden />
      <span className="sr-only">Darstellung wird erstellt</span>
    </div>
  );
}

function Frame({
  title,
  note,
  children,
  className,
}: {
  title?: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn(paper, 'my-3 flex flex-col gap-3 rounded-2xl p-4', className)}>
      {title ? (
        <figcaption className="text-sm font-semibold text-foreground">{title}</figcaption>
      ) : null}
      {children}
      {note ? <p className="text-xs leading-relaxed text-foreground-muted">{note}</p> : null}
    </figure>
  );
}

const TONE_FILL: Record<VisualTone, string> = {
  primary: 'bg-primary-600 dark:bg-primary-400',
  secondary: 'bg-secondary-500 dark:bg-secondary-300',
  accent: 'bg-amber-600 dark:bg-amber-400',
  warning: 'bg-orange-600 dark:bg-orange-400',
  danger: 'bg-red-600 dark:bg-red-400',
  neutral: 'bg-foreground/35',
};

function Bars({ block }: { block: BarsBlock }) {
  const geometry = barScale(block);

  return (
    <Frame title={block.title} note={block.note}>
      <ul className="flex flex-col gap-4">
        {block.items.map((item, i) => {
          const { start, end, open } = geometry(item);
          // One colour by default: bars in a list are one series, and a colour
          // per row reads as a meaning nobody gave it. `tone` marks the exceptions.
          const tone = item.tone ?? 'primary';
          return (
            <li key={`${i}-${item.label}`} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="shrink-0 text-foreground tabular-nums">
                  {barDisplay(item, block.unit)}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
                aria-hidden
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    TONE_FILL[tone],
                    // An open range has no end: it fades out at the track's edge.
                    open &&
                      'rounded-r-none [mask-image:linear-gradient(to_right,black_40%,transparent)]'
                  )}
                  style={{ marginLeft: `${start}%`, width: `${end - start}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

const SENTIMENT_TEXT = {
  positive: 'text-primary-700 dark:text-primary-300',
  negative: 'text-red-700 dark:text-red-400',
  neutral: 'text-foreground-muted',
} as const;

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

function Sparkline({ points }: { points: number[] }) {
  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / range) * 26}`)
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="h-7 w-full text-primary-600 dark:text-primary-400"
      aria-hidden
    >
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Stats({ block }: { block: StatsBlock }) {
  return (
    <Frame title={block.title} note={block.note}>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
        {block.items.map((item, i) => {
          const TrendIcon = item.trend ? TREND_ICON[item.trend] : null;
          return (
            <div
              key={`${i}-${item.label}`}
              className={cn(field, 'flex flex-col gap-1 rounded-xl p-3')}
            >
              <dt className="text-xs text-foreground-muted">{item.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums text-foreground">{item.value}</dd>
              {item.change ? (
                <dd
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    SENTIMENT_TEXT[item.sentiment ?? 'neutral']
                  )}
                >
                  {TrendIcon ? <TrendIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  {item.change}
                </dd>
              ) : null}
              {item.points ? (
                <dd>
                  <Sparkline points={item.points} />
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </Frame>
  );
}

const CALLOUT_STYLE: Record<
  CalloutBlock['variant'],
  { icon: typeof Info; box: string; icon_: string }
> = {
  info: {
    icon: Info,
    box: 'border-secondary-500/40 bg-secondary-500/[0.07]',
    icon_: 'text-secondary-700 dark:text-secondary-300',
  },
  tip: {
    icon: Lightbulb,
    box: 'border-primary-600/40 bg-primary-600/[0.07]',
    icon_: 'text-primary-700 dark:text-primary-300',
  },
  important: {
    icon: OctagonAlert,
    box: 'border-amber-500/50 bg-amber-500/[0.08]',
    icon_: 'text-amber-700 dark:text-amber-300',
  },
  warning: {
    icon: TriangleAlert,
    box: 'border-red-600/40 bg-red-600/[0.07]',
    icon_: 'text-red-700 dark:text-red-400',
  },
};

function Callout({ block }: { block: CalloutBlock }) {
  const style = CALLOUT_STYLE[block.variant];
  const Icon = style.icon;
  return (
    <aside
      className={cn('my-3 flex gap-3 rounded-2xl border p-4', style.box)}
      aria-label={block.title ?? calloutLabel(block.variant)}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon_)} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1 text-sm leading-relaxed text-foreground">
        <p className="font-semibold">{block.title ?? calloutLabel(block.variant)}</p>
        <p className="whitespace-pre-line">{block.text}</p>
      </div>
    </aside>
  );
}

function Timeline({ block }: { block: TimelineBlock }) {
  return (
    <Frame title={block.title} note={block.note}>
      <ol className="relative flex flex-col gap-4 border-l border-foreground/15 pl-5">
        {block.items.map((item, i) => (
          <li key={`${i}-${item.date}`} className="relative flex flex-col gap-0.5">
            <span
              className="absolute top-1.5 -left-[1.6rem] h-2.5 w-2.5 rounded-full border-2 border-background bg-primary-600 dark:bg-primary-400"
              aria-hidden
            />
            <span className="text-xs font-medium tabular-nums text-primary-700 dark:text-primary-300">
              {item.date}
            </span>
            <span className="text-sm font-semibold text-foreground">{item.title}</span>
            {item.text ? <p className="text-sm text-foreground-muted">{item.text}</p> : null}
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Steps({ block }: { block: StepsBlock }) {
  return (
    <Frame title={block.title} note={block.note}>
      <ol className="flex flex-col gap-3">
        {block.items.map((item, i) => (
          <li key={`${i}-${item.title}`} className="flex gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white dark:bg-primary-400 dark:text-background"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <span className="text-sm font-semibold text-foreground">{item.title}</span>
              {item.text ? <p className="text-sm text-foreground-muted">{item.text}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Compare({ block }: { block: CompareBlock }) {
  return (
    <Frame title={block.title} note={block.note} className="@container">
      <div
        className={cn(
          'grid grid-cols-1 gap-2',
          block.columns.length === 3 ? '@[36rem]:grid-cols-3' : '@[28rem]:grid-cols-2'
        )}
      >
        {block.columns.map((column, i) => {
          const recommended = i === block.recommended;
          const ItemIcon = column.tone === 'contra' ? X : column.tone === 'pro' ? Check : null;
          return (
            <section
              key={`${i}-${column.title}`}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-xl p-3',
                recommended ? 'bg-primary-600/[0.08] ring-1 ring-primary-600/40' : field
              )}
            >
              <h4 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                {column.title}
                {recommended ? (
                  <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-primary-400 dark:text-background">
                    Empfehlung
                  </span>
                ) : null}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {column.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-sm text-foreground">
                    {ItemIcon ? (
                      <ItemIcon
                        className={cn(
                          'mt-0.5 h-3.5 w-3.5 shrink-0',
                          column.tone === 'contra'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-primary-600 dark:text-primary-400'
                        )}
                        aria-hidden
                      />
                    ) : (
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Frame>
  );
}

const TABLE_FORMAT: Record<
  NonNullable<TableBlock['columns'][number]['format']>,
  DataTableFormat
> = {
  text: { kind: 'text' },
  number: { kind: 'number' },
  percent: { kind: 'percent', basis: 'unit' },
  currency: { kind: 'currency', currency: 'EUR' },
  delta: { kind: 'delta' },
};

function Table({ block }: { block: TableBlock }) {
  const columns: DataTableColumn[] = block.columns.map((column, i) => ({
    key: column.key,
    label: column.label,
    format: column.format ? TABLE_FORMAT[column.format] : undefined,
    priority: i === 0 ? 'primary' : undefined,
  }));
  return (
    <figure className="my-3 flex flex-col gap-2">
      {block.title ? (
        <figcaption className="text-sm font-semibold text-foreground">{block.title}</figcaption>
      ) : null}
      <DataTable columns={columns} rows={block.rows} caption={block.title} />
      {block.note ? <p className="text-xs text-foreground-muted">{block.note}</p> : null}
    </figure>
  );
}
