'use client';

import {
  Badge,
  cn,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { type ReactNode, useState } from 'react';

import { composerToolbarButtonClass } from '../../lib/utils';

import { useChatDensity } from './chatDensityContext';

export interface ComposerOption<T extends string = string> {
  id: T;
  name: string;
  /** Compact trigger label below `sm`. Falls back to `name`. */
  shortName?: string;
  description?: string;
  /** Badge next to the name (e.g. "Empfohlen"). */
  recommendedLabel?: string;
}

interface ComposerOptionPickerProps<T extends string> {
  options: readonly ComposerOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Title of the mobile sheet. */
  sheetTitle: string;
  /** Section heading inside the mobile sheet. */
  sectionTitle: string;
  ariaLabel: string;
  /** Overrides the default trigger text (the current option's name). */
  triggerLabel?: ReactNode;
}

const activeClass = 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400';

function RecommendedBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] leading-4 font-medium">
      {label}
    </Badge>
  );
}

/**
 * The composer's option dropdown (desktop) / bottom sheet (mobile): the look of
 * the model picker, without its store. Callers own the value.
 */
export function ComposerOptionPicker<T extends string>({
  options,
  value,
  onChange,
  sheetTitle,
  sectionTitle,
  ariaLabel,
  triggerLabel,
}: ComposerOptionPickerProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompact = useChatDensity() === 'compact';
  const current = options.find((o) => o.id === value) ?? options[0];

  const handleSelect = (id: T) => {
    onChange(id);
    setMenuOpen(false);
  };

  const desktopContent = (
    <>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.id}
          onSelect={() => onChange(option.id)}
          className={cn(
            'flex flex-col items-start gap-0.5 py-1.5',
            value === option.id && activeClass
          )}
        >
          {option.recommendedLabel ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-medium leading-tight">{option.name}</span>
                <RecommendedBadge label={option.recommendedLabel} />
              </span>
              <span className="text-muted-foreground text-xs leading-tight">
                {option.description}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium leading-tight">{option.name}</span>
              {option.description && (
                <span className="text-muted-foreground line-clamp-1 text-xs leading-tight">
                  {option.description}
                </span>
              )}
            </>
          )}
        </DropdownMenuItem>
      ))}
    </>
  );

  const mobileContent = (
    <ResponsiveMenuSection title={sectionTitle}>
      {options.map((option) => (
        <ResponsiveMenuItem
          key={option.id}
          active={value === option.id}
          onClick={() => handleSelect(option.id)}
        >
          {option.recommendedLabel ? (
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{option.name}</span>
              <RecommendedBadge label={option.recommendedLabel} />
            </span>
          ) : (
            <span className="block font-medium">{option.name}</span>
          )}
          {option.description && (
            <span className="text-muted-foreground block text-xs">{option.description}</span>
          )}
        </ResponsiveMenuItem>
      ))}
    </ResponsiveMenuSection>
  );

  const defaultTriggerLabel = current ? (
    <span>
      <span className="max-sm:hidden">{current.name}</span>
      <span className="sm:hidden">{current.shortName || current.name}</span>
    </span>
  ) : null;

  return (
    <ResponsiveMenu
      open={menuOpen}
      onOpenChange={setMenuOpen}
      sheetTitle={sheetTitle}
      dropdownAlign="end"
      dropdownClassName="min-w-[12rem] max-w-[90vw]"
      trigger={
        <button
          type="button"
          className={composerToolbarButtonClass(isCompact)}
          aria-label={ariaLabel}
        >
          {triggerLabel ?? defaultTriggerLabel}
        </button>
      }
      desktopContent={desktopContent}
      mobileContent={mobileContent}
    />
  );
}
