'use client';

import { type NotebookDepth } from '@gruenerator/contracts';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { BookOpen, Check, Telescope, Zap } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { LuSettings2 } from 'react-icons/lu';

import {
  NOTEBOOK_DEPTHS,
  notebookDepthDef,
  type NotebookDepthIconKey,
} from '../../lib/notebookDepth';
import { composerToolbarButtonClass } from '../../lib/utils';

export interface SourceFilterCollection {
  id: string;
  name: string;
  description?: string;
  /** A number, or a label where a page config does not count ('Wiki'). */
  documentCount?: string | number;
}

export interface CategoryFilterField {
  field: string;
  label: string;
  values: Array<{ value: string; count?: number }>;
  valueLabels?: Record<string, string>;
  /** Behind „Weitere Filter“ instead of offered directly. */
  collapsed?: boolean;
}

export interface SourceFilterConfig {
  collections: SourceFilterCollection[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
}

export interface CategoryFilterConfig {
  fields: CategoryFilterField[];
  activeFilters: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
  onClearAll?: () => void;
}

/** Semantic icon key → lucide component. The registry stays renderer-agnostic. */
const DEPTH_ICONS: Record<NotebookDepthIconKey, typeof Zap> = {
  fast: Zap,
  deep: BookOpen,
  ultra: Telescope,
};

/** The one facet a document carries exactly once, so its counts add up to a
 *  document count. Themes and persons are multi-valued and would overcount. */
const COUNTABLE_FIELD = 'content_type';

const numberFormat = new Intl.NumberFormat('de-DE');

function Chip({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        selected
          ? 'border-primary bg-primary/10 font-semibold text-primary-700 dark:text-primary-200'
          : 'border-border bg-background-pure text-foreground hover:border-primary/40'
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={id} className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
          {title}
        </h3>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function SectionLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-primary transition-colors hover:text-primary-600"
    >
      {children}
    </button>
  );
}

/** Only real numbers: a label like '3 Programme' goes in the chip's tooltip. */
function Count({ value }: { value?: number | string }) {
  return typeof value === 'number' ? (
    <span className="text-xs font-semibold">
      {/* Keeps „Fraktion, 542“ apart in the accessible name. */}
      <span className="sr-only">, </span>
      {value}
    </span>
  ) : null;
}

function sourceTitle(collection: SourceFilterCollection): string | null {
  const label = typeof collection.documentCount === 'string' ? collection.documentCount : null;
  return [label, collection.description].filter(Boolean).join(' · ') || null;
}

/** How many documents the current selection searches — only where the counts
 *  can honestly be added up, otherwise null. */
function scopeCount(
  sourceFilters: SourceFilterConfig | undefined,
  categoryFilters: CategoryFilterConfig | undefined
): number | null {
  const active = categoryFilters?.activeFilters ?? {};
  const otherFieldActive = Object.entries(active).some(
    ([field, values]) => field !== COUNTABLE_FIELD && values.length > 0
  );
  if (otherFieldActive) return null;

  const countable = categoryFilters?.fields.find((f) => f.field === COUNTABLE_FIELD);
  if (countable) {
    const selected = active[COUNTABLE_FIELD] ?? [];
    const values = selected.length
      ? countable.values.filter((v) => selected.includes(v.value))
      : countable.values;
    if (values.some((v) => v.count == null)) return null;
    return values.reduce((sum, v) => sum + (v.count ?? 0), 0);
  }

  if (sourceFilters && !(COUNTABLE_FIELD in active)) {
    const selected = sourceFilters.collections.filter((c) =>
      sourceFilters.selectedIds.includes(c.id)
    );
    // Page configs may label a source instead of counting it ('3 Programme',
    // 'Wiki') — then there is no number to give.
    const counts = selected.map((c) => c.documentCount);
    if (!counts.every((n): n is number => typeof n === 'number')) return null;
    return counts.reduce((sum, n) => sum + n, 0);
  }
  return null;
}

export function NotebookSettingsPopover({
  mode,
  onModeChange,
  sourceFilters,
  categoryFilters,
  className,
}: {
  mode?: NotebookDepth;
  onModeChange?: (mode: NotebookDepth) => void;
  sourceFilters?: SourceFilterConfig;
  categoryFilters?: CategoryFilterConfig;
  /** Classes for the portalled panel, e.g. the surface's accent scope, which
   *  does not reach it through the DOM. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const categoryActiveCount = categoryFilters
    ? Object.values(categoryFilters.activeFilters).reduce((sum, arr) => sum + arr.length, 0)
    : 0;
  const sourceActiveCount = sourceFilters
    ? sourceFilters.collections.length - sourceFilters.selectedIds.length
    : 0;
  const hasActiveBadge = categoryActiveCount > 0 || sourceActiveCount > 0;
  const activeDepth = notebookDepthDef(mode);
  const fields = categoryFilters?.fields ?? [];
  // A collapsed field with a selection stays in view, so it can be undone.
  const isActive = (field: CategoryFilterField) =>
    (categoryFilters?.activeFilters[field.field]?.length ?? 0) > 0;
  const moreFields = fields.filter((f) => f.collapsed && !isActive(f));
  const directFields = fields.filter((f) => !moreFields.includes(f));
  const shownFields = showMore ? [...directFields, ...moreFields] : directFields;
  const hasFilters = !!sourceFilters || fields.length > 0;
  const canReset =
    (categoryFilters?.onClearAll && categoryActiveCount > 0) ||
    (sourceFilters?.onSelectAll && sourceActiveCount > 0);
  const count = hasFilters ? scopeCount(sourceFilters, categoryFilters) : null;

  const reset = () => {
    if (categoryActiveCount > 0) categoryFilters?.onClearAll?.();
    if (sourceActiveCount > 0) sourceFilters?.onSelectAll?.();
  };

  // Nothing to set (e.g. gruen-o-mat): no settings button leading to an empty panel.
  if (!(mode && onModeChange) && !hasFilters) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={composerToolbarButtonClass()}
          aria-label={mode ? `Einstellungen — Suchtiefe: ${activeDepth.label}` : 'Einstellungen'}
          title={mode ? `Einstellungen · Suchtiefe: ${activeDepth.label}` : 'Einstellungen'}
        >
          {/* Always the settings glyph: the tier's own icon (a book for „Mittel“)
              did not read as „this opens the options“. The tier stays in the
              label and tooltip. */}
          <LuSettings2 className="h-4 w-4" />
          {hasActiveBadge && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {categoryActiveCount + sourceActiveCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        aria-label="Einstellungen"
        className={cn(
          'flex w-[26rem] max-w-[calc(100vw-2rem)] flex-col rounded-3xl p-0 shadow-lg',
          className
        )}
      >
        <div className="max-h-[min(60vh,32rem)] space-y-6 overflow-y-auto p-6">
          {mode && onModeChange && (
            <div className="space-y-2">
              <Section title="Suchtiefe">
                {NOTEBOOK_DEPTHS.map((depth) => {
                  const Icon = DEPTH_ICONS[depth.icon];
                  return (
                    <Chip
                      key={depth.depth}
                      selected={depth.depth === mode}
                      onClick={() => onModeChange(depth.depth)}
                      title={depth.description}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {depth.label}
                    </Chip>
                  );
                })}
              </Section>
              <p className="text-xs text-foreground-muted">{activeDepth.description}</p>
            </div>
          )}

          {sourceFilters && (
            <Section
              title="Quellen"
              action={
                sourceActiveCount === 0
                  ? sourceFilters.onSelectNone && (
                      <SectionLink onClick={sourceFilters.onSelectNone}>Keine</SectionLink>
                    )
                  : sourceFilters.onSelectAll && (
                      <SectionLink onClick={sourceFilters.onSelectAll}>Alle</SectionLink>
                    )
              }
            >
              {sourceFilters.collections.map((collection) => {
                const selected = sourceFilters.selectedIds.includes(collection.id);
                const title = sourceTitle(collection);
                return (
                  <Chip
                    key={collection.id}
                    selected={selected}
                    onClick={() => sourceFilters.onToggle(collection.id)}
                    {...(title ? { title } : {})}
                  >
                    {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                    {collection.name}
                    <Count value={collection.documentCount} />
                  </Chip>
                );
              })}
            </Section>
          )}

          {categoryFilters &&
            shownFields.map((field) => {
              const active = categoryFilters.activeFilters[field.field] ?? [];
              return (
                <Section
                  key={field.field}
                  title={field.label}
                  action={
                    active.length > 0 ? (
                      <SectionLink
                        onClick={() =>
                          active.forEach((v) => categoryFilters.onToggle(field.field, v))
                        }
                      >
                        Alle
                      </SectionLink>
                    ) : (
                      <span className="text-sm text-foreground-muted">Alle</span>
                    )
                  }
                >
                  {field.values.map(({ value, count: valueCount }) => {
                    const selected = active.includes(value);
                    return (
                      <Chip
                        key={value}
                        selected={selected}
                        onClick={() => categoryFilters.onToggle(field.field, value)}
                      >
                        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                        {field.valueLabels?.[value] ?? value}
                        <Count value={valueCount} />
                      </Chip>
                    );
                  })}
                </Section>
              );
            })}

          {moreFields.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="text-sm font-medium text-primary transition-colors hover:text-primary-600"
            >
              {showMore ? 'Weniger Filter' : `Weitere Filter (${moreFields.length})`}
            </button>
          )}
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3 px-6 pb-5 pt-2">
            <button
              type="button"
              onClick={reset}
              disabled={!canReset}
              className="text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              Zurücksetzen
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
            >
              {count != null ? `In ${numberFormat.format(count)} Quellen suchen` : 'Fertig'}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
