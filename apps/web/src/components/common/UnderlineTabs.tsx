import { cn } from '@/utils/cn';

export interface UnderlineTab<K extends string> {
  key: K;
  label: string;
}

interface UnderlineTabsProps<K extends string> {
  tabs: UnderlineTab<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}

/**
 * Quiet underline tab bar — active tab gets a green underline + bold label, the
 * rest are muted. Horizontally scrollable when the labels overflow. Shared across
 * the Agentura detail view and the agent editor.
 */
export function UnderlineTabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
}: UnderlineTabsProps<K>) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-lg overflow-x-auto border-b border-grey-200 dark:border-grey-700',
        className
      )}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 pb-sm text-sm transition-colors',
              active
                ? 'border-primary-600 font-bold text-foreground-heading'
                : 'border-transparent font-semibold text-foreground-muted hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
