import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react';

import { cn } from '../lib/cn';

const sectionHeaderVariants = cva('flex items-center justify-between', {
  variants: {
    size: {
      default: 'mb-md',
      sm: 'mb-sm',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const plusButtonClass =
  'flex items-center justify-center w-7 h-7 rounded-full text-primary-600 hover:bg-primary-600/10 transition-colors cursor-pointer border-none bg-transparent';

const iconButtonClass =
  'flex items-center justify-center w-7 h-7 rounded-full text-grey-500 hover:text-foreground hover:bg-grey-200/40 dark:hover:bg-grey-700/40 transition-colors cursor-pointer border-none bg-transparent';

function SectionHeader({
  className,
  size = 'default',
  title,
  titleHref,
  onTitleClick,
  onCreate,
  createLabel,
  createMenu,
  actions,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof sectionHeaderVariants> & {
    title: string;
    titleHref?: string;
    /** In-app click handler for the title. Takes precedence over `titleHref`. */
    onTitleClick?: () => void;
    onCreate?: () => void;
    createLabel?: string;
    /** Wraps the plus button as a dropdown trigger. Receives the button as children. */
    createMenu?: (trigger: React.ReactNode) => React.ReactNode;
    actions?: React.ReactNode;
    /**
     * Search affordance. Pass `onSearchChange` to opt in — renders a magnifier
     * icon that expands to an inline input. The query value is controlled by
     * the consumer via `searchQuery`.
     */
    searchQuery?: string;
    onSearchChange?: (q: string) => void;
    searchPlaceholder?: string;
    searchLabel?: string;
  }) {
  const Heading = size === 'sm' ? 'h3' : 'h2';
  const headingClass =
    size === 'sm'
      ? 'text-sm font-medium text-foreground m-0'
      : 'text-xl font-semibold text-foreground-heading m-0';

  const plusButton =
    onCreate || createMenu ? (
      <button
        type="button"
        onClick={createMenu ? undefined : onCreate}
        className={plusButtonClass}
        aria-label={createLabel ?? 'Neu erstellen'}
      >
        <PlusIcon className="size-[18px]" />
      </button>
    ) : null;

  const searchable = typeof onSearchChange === 'function';
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const isExpanded = searchOpen || (searchQuery?.length ?? 0) > 0;

  React.useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const searchControl = searchable ? (
    isExpanded ? (
      <div className="flex items-center gap-1 rounded-full border border-grey-200 bg-background pl-2 pr-1 py-0.5 dark:border-grey-700">
        <SearchIcon className="size-3.5 text-grey-500" aria-hidden />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery ?? ''}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onSearchChange('');
              setSearchOpen(false);
            }
          }}
          placeholder={searchPlaceholder ?? 'Suchen…'}
          aria-label={searchLabel ?? 'Suchen'}
          className="h-6 w-32 border-none bg-transparent text-sm text-foreground placeholder:text-grey-400 focus:outline-none focus:ring-0"
        />
        <button
          type="button"
          onClick={() => {
            onSearchChange('');
            setSearchOpen(false);
          }}
          className="flex h-5 w-5 items-center justify-center rounded-full text-grey-500 hover:bg-grey-200/40 dark:hover:bg-grey-700/40"
          aria-label="Suche schließen"
        >
          <XIcon className="size-3" />
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className={iconButtonClass}
        aria-label={searchLabel ?? 'Suchen'}
      >
        <SearchIcon className="size-4" />
      </button>
    )
  ) : null;

  return (
    <div
      data-slot="section-header"
      data-size={size}
      className={cn(sectionHeaderVariants({ size, className }))}
      {...props}
    >
      <div className="flex items-center gap-xs">
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="bg-transparent border-none p-0 cursor-pointer text-left"
          >
            <Heading className={cn(headingClass, 'hover:text-primary-600 transition-colors')}>
              {title}
            </Heading>
          </button>
        ) : titleHref ? (
          <a href={titleHref} target="_blank" rel="noopener noreferrer" className="no-underline">
            <Heading className={cn(headingClass, 'hover:text-primary-600 transition-colors')}>
              {title}
            </Heading>
          </a>
        ) : (
          <Heading className={headingClass}>{title}</Heading>
        )}
        {createMenu && plusButton ? createMenu(plusButton) : plusButton}
      </div>
      {(actions || searchControl) && (
        <div className="flex items-center gap-xs">
          {actions}
          {searchControl}
        </div>
      )}
    </div>
  );
}

const MemoizedSectionHeader = React.memo(SectionHeader);

export { MemoizedSectionHeader as SectionHeader, sectionHeaderVariants };
