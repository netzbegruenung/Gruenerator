import { agentsList, useHiddenSkillMentions, type AgentListItem } from '@gruenerator/chat';
import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';
import { isAdminVisibleSkill, isSkillOfferedIn } from '@gruenerator/shared/agents';
import { useId, useMemo } from 'react';

import { useOwnRecipes, usePublicRecipes } from './api';

import { CURRENT_INSTANCE } from '@/config/instance';
import { useAuthStore } from '@/stores/authStore';

const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';

export interface RecipePickerValue {
  mention: string | null;
  id: string | null;
}

interface OwnRecipeOption {
  id: string;
  mention: string;
  title: string;
}

/**
 * System recipes visible to this user: matching their locale, not hidden by
 * an admin on this deployment, and offered on this instance. Same filter
 * `AgenturaPage.allSkills` applies, extracted so this picker doesn't
 * duplicate it.
 */
function useVisibleSystemRecipes(): readonly AgentListItem[] {
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const hiddenSkillMentions = useHiddenSkillMentions();
  return useMemo(
    () =>
      agentsList.filter(
        (s) =>
          (s.audience === undefined || s.audience === 'all' || s.audience === userLocale) &&
          isAdminVisibleSkill(s.mention, hiddenSkillMentions) &&
          isSkillOfferedIn(s, CURRENT_INSTANCE)
      ),
    [userLocale, hiddenSkillMentions]
  );
}

/**
 * Own, shared-into-a-group and public recipes with an identity of their
 * own — a preset/recipe override (`kind !== 'custom'`) just edits an
 * existing system recipe's body and has no separate mention, so it's already
 * covered by the system group. Deduped by mention, own wins.
 */
function ownRecipeOptions(
  own: readonly TextForm[],
  publicRecipes: readonly PublicTextForm[]
): OwnRecipeOption[] {
  const map = new Map<string, OwnRecipeOption>();
  for (const f of own) {
    if (f.kind === 'custom' && !map.has(f.mention)) {
      map.set(f.mention, { id: f.id, mention: f.mention, title: f.title });
    }
  }
  for (const f of publicRecipes) {
    if (f.kind === 'custom' && !map.has(f.mention)) {
      map.set(f.mention, { id: f.id, mention: f.mention, title: f.title });
    }
  }
  return [...map.values()];
}

/** The select's value string encodes both which group the option is in and
 * which field ({@link RecipePickerValue}) it resolves to on change. */
function encodeValue(value: RecipePickerValue): string {
  if (value.id) return `own:${value.id}`;
  if (value.mention) return `sys:${value.mention}`;
  return '';
}

interface RecipePickerProps {
  value: RecipePickerValue;
  onChange: (next: RecipePickerValue) => void;
  id?: string;
}

/**
 * "Standard-Rezept" picker for the agent editor: the recipe the chat loads
 * for this agent when the user picks none themselves
 * (`Agent.defaultRecipeMention`/`defaultRecipeId`). A system recipe is
 * addressed by its mention alone (no row id); an own/shared/public recipe is
 * addressed by its row id, which survives a rename of the recipe.
 */
export function RecipePicker({ value, onChange, id }: RecipePickerProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const systemRecipes = useVisibleSystemRecipes();
  const { data: own } = useOwnRecipes(true);
  const { data: publicRecipes } = usePublicRecipes(true);
  const ownOptions = useMemo(
    () => ownRecipeOptions(own ?? [], publicRecipes ?? []),
    [own, publicRecipes]
  );

  const handleChange = (raw: string) => {
    if (raw === '') {
      onChange({ mention: null, id: null });
      return;
    }
    if (raw.startsWith('own:')) {
      const rowId = raw.slice('own:'.length);
      const opt = ownOptions.find((o) => o.id === rowId);
      onChange({ mention: opt?.mention ?? null, id: rowId });
      return;
    }
    onChange({ mention: raw.slice('sys:'.length), id: null });
  };

  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={selectId} className="text-sm font-medium">
        Standard-Rezept (optional)
      </label>
      <select
        id={selectId}
        className={selectCls}
        value={encodeValue(value)}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">— kein Standard-Rezept —</option>
        <optgroup label="Rezepte">
          {systemRecipes.map((s) => (
            <option key={s.mention} value={`sys:${s.mention}`}>
              {s.title}
            </option>
          ))}
        </optgroup>
        <optgroup label="Meine Rezepte">
          {ownOptions.map((o) => (
            <option key={o.id} value={`own:${o.id}`}>
              {o.title}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="m-0 text-xs text-foreground-muted">
        Wird geladen, wenn du im Chat kein Rezept wählst.
      </p>
    </div>
  );
}
