'use client';

import {
  Badge,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  /** Appended to the current option's name on the trigger only, e.g. what
   *  that option decided for the current input. */
  valueSuffix?: string;
}

function RecommendedBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="px-1.5 py-0 text-[10px] font-medium leading-4 text-foreground-muted"
    >
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
  valueSuffix,
}: ComposerOptionPickerProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompact = useChatDensity() === 'compact';
  const current = options.find((o) => o.id === value) ?? options[0];

  const handleSelect = (id: T) => {
    onChange(id);
    setMenuOpen(false);
  };

  // Radio items, like the depth menu beside it in the notebook composer: the
  // selection is a neutral dot, not a brand tint, so the menu sits on any
  // surface colour. Descriptions wrap instead of being cut off — they are the
  // only place a mode says what it does.
  const desktopContent = (
    <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
      {options.map((option) => (
        <DropdownMenuRadioItem
          key={option.id}
          value={option.id}
          // Pin the dot to the name line, not the top edge of a two-line item.
          className="items-start py-2 [&>span:first-child]:top-[0.7rem]"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-medium leading-tight">{option.name}</span>
              {option.recommendedLabel && <RecommendedBadge label={option.recommendedLabel} />}
            </span>
            {option.description && (
              <span className="text-xs leading-snug text-foreground-muted">
                {option.description}
              </span>
            )}
          </span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
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

  const suffix = valueSuffix ? ` · ${valueSuffix}` : '';
  const defaultTriggerLabel = current ? (
    <span>
      <span className="max-sm:hidden">
        {current.name}
        {suffix}
      </span>
      <span className="sm:hidden">
        {current.shortName || current.name}
        {suffix}
      </span>
    </span>
  ) : null;

  return (
    <ResponsiveMenu
      open={menuOpen}
      onOpenChange={setMenuOpen}
      sheetTitle={sheetTitle}
      dropdownAlign="end"
      dropdownClassName="w-72 max-w-[90vw]"
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
