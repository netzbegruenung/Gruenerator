'use client';

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  ResponsiveMenu,
  ResponsiveMenuItem,
  ResponsiveMenuSection,
} from '@gruenerator/ui';
import { useState } from 'react';
import { LuChefHat } from 'react-icons/lu';

import { type Mentionable } from '../../lib/mentionables';
import { composerToolbarButtonClass } from '../../lib/utils';
import { useChatDensity } from '../thread/chatDensityContext';
import { ComposerToken } from '../thread/ComposerToken';

export interface NotebookRecipeGroup {
  title: string;
  recipes: readonly Mentionable[];
}

interface NotebookRecipePickerProps {
  value: Mentionable | null;
  onChange: (recipe: Mentionable | null) => void;
  /** Sections in order; empty ones are left out. */
  groups: readonly NotebookRecipeGroup[];
}

/**
 * Rezept-Wähler der Notebook-Seite. Das Rezept gibt nur die Form der Antwort
 * vor (Wahlprüfstein, Pressemitteilung, Bürger*innenmail …); Suche und Quellen
 * bleiben die des Notebooks. Gewählt steht es als Chip im Composer, wie ein
 * Rezept im Chat — es wird aber nicht in den Text geschrieben, sonst landete
 * die Erwähnung in der Suchanfrage.
 */
export function NotebookRecipePicker({ value, onChange, groups }: NotebookRecipePickerProps) {
  const [open, setOpen] = useState(false);
  const isCompact = useChatDensity() === 'compact';
  const sections = groups.filter((g) => g.recipes.length > 0);

  if (value) {
    // Below `sm` the chip takes its own row above the input, like the chat's
    // mention pills — inline it squeezed the textarea to a single character.
    return (
      <div className="flex min-w-0 max-sm:order-first max-sm:basis-full max-sm:px-1 max-sm:pt-1.5">
        <ComposerToken
          icon={value.icon ?? null}
          glyph={value.avatar}
          brandColor={value.backgroundColor}
          label={value.title}
          removeLabel={`Rezept ${value.title} entfernen`}
          onRemove={() => onChange(null)}
        />
      </div>
    );
  }
  if (sections.length === 0) return null;

  const pick = (recipe: Mentionable) => {
    onChange(recipe);
    setOpen(false);
  };

  return (
    <ResponsiveMenu
      open={open}
      onOpenChange={setOpen}
      sheetTitle="Rezept wählen"
      dropdownAlign="start"
      dropdownClassName="w-72 max-w-[90vw]"
      trigger={
        <button type="button" className={composerToolbarButtonClass(isCompact)}>
          <LuChefHat aria-hidden className="size-4" />
          <span className="max-sm:sr-only">Rezept</span>
        </button>
      }
      desktopContent={sections.map((section, i) => (
        <div key={section.title}>
          {i > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs text-foreground-muted">
            {section.title}
          </DropdownMenuLabel>
          {section.recipes.map((recipe) => (
            <DropdownMenuItem
              key={recipe.mention}
              className="flex-col items-start gap-0.5 py-2"
              onSelect={() => pick(recipe)}
            >
              <span className="text-sm font-medium leading-tight">{recipe.title}</span>
              {recipe.description && (
                <span className="line-clamp-2 text-xs leading-snug text-foreground-muted">
                  {recipe.description}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </div>
      ))}
      mobileContent={sections.map((section) => (
        <ResponsiveMenuSection key={section.title} title={section.title}>
          {section.recipes.map((recipe) => (
            <ResponsiveMenuItem key={recipe.mention} onClick={() => pick(recipe)}>
              <span className="block font-medium">{recipe.title}</span>
              {recipe.description && (
                <span className="text-muted-foreground block text-xs">{recipe.description}</span>
              )}
            </ResponsiveMenuItem>
          ))}
        </ResponsiveMenuSection>
      ))}
    />
  );
}
