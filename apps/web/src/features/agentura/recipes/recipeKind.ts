/**
 * Classifies a recipe mention into the kind the backend derives it into
 * (`resolveTextFormKind`, `saveTextFormBodySchema`'s `kind`), so the UI can
 * pick the right editor and copy before ever calling save.
 *
 * Three buckets, same as the server:
 *  - `preset`  — the mention IS one of the four text types (`presse`,
 *                `instagram`, `facebook`, `antrag`).
 *  - `recipe`  — the mention belongs to a Landesverband system skill
 *                (`isLandesverbandIdentifier`). `entitled` mirrors the
 *                Landesgeschäftsstelle-role check the tab already runs
 *                (`isLvItemVisibleForRoles`) — false means the mention exists
 *                but this user's roles don't unlock it, not that it's free.
 *  - `custom`  — anything else. Always entitled: a custom mention is the
 *                user's own to create.
 */
import { type TextFormKind, type TextFormType } from '@gruenerator/contracts';
import {
  SKILLS,
  isLandesverbandIdentifier,
  isLvItemVisibleForRoles,
} from '@gruenerator/shared/agents';

/**
 * `label` wird zum Titel des Rezepts (`RecipeEditorPage` seedet ihn daraus) und
 * beschriftet damit auch den analysierten Stilblock. Es muss deshalb dieselbe
 * Schreibung sein wie `TEXT_FORM_TYPE_LABELS` in den Contracts, nicht eine
 * zweite, kürzere — sonst stünde im Editor „Instagram" und im erzeugten Block
 * „Instagram-Posts". Bewacht von `recipeKind.vitest.ts`.
 *
 * Als Literale und nicht als Verweis auf die Contracts-Tabelle, weil
 * `documentation/scripts/generate-settings.mjs` diese Liste per AST liest und
 * dabei bewusst nur String-Literale auflöst.
 */
export const PRESETS: { textType: TextFormType; label: string; hint: string }[] = [
  { textType: 'instagram', label: 'Instagram-Posts', hint: 'Instagram-Posts' },
  { textType: 'facebook', label: 'Facebook-Posts', hint: 'Facebook-Posts' },
  { textType: 'presse', label: 'Pressemitteilungen', hint: 'Pressetexte' },
  { textType: 'antrag', label: 'Anträge', hint: 'Anträge' },
];

export interface RecipeClassification {
  kind: TextFormKind;
  mention: string;
  textType: TextFormType | null;
  label: string;
  hint: string;
  entitled: boolean;
}

/**
 * Which preset a Landesverband skill's mention belongs to, by prefix —
 * `insta-*` reads as the `instagram` preset, everything else by its own
 * textType prefix (`presse-*`, `facebook-*`, …). Mirrors
 * `TexteAnlernenTab.lvRecipes`; kept here so the classifier and the tab agree.
 */
function presetForLvMention(mention: string): (typeof PRESETS)[number] | undefined {
  return PRESETS.find((p) =>
    p.textType === 'instagram' ? mention.startsWith('insta') : mention.startsWith(p.textType)
  );
}

export function classifyRecipeMention(
  mention: string,
  lvIds: readonly string[] | null
): RecipeClassification {
  const preset = PRESETS.find((p) => p.textType === mention);
  if (preset) {
    return {
      kind: 'preset',
      mention,
      textType: preset.textType,
      label: preset.label,
      hint: preset.hint,
      entitled: true,
    };
  }

  const skill = SKILLS.find(
    (s) => s.mention === mention && isLandesverbandIdentifier(s.identifier)
  );
  if (skill) {
    const lvPreset = presetForLvMention(skill.mention);
    return {
      kind: 'recipe',
      mention,
      textType: lvPreset?.textType ?? null,
      label: skill.title,
      hint: lvPreset?.hint ?? skill.title,
      entitled: isLvItemVisibleForRoles(skill.identifier, lvIds),
    };
  }

  return {
    kind: 'custom',
    mention,
    textType: null,
    label: mention,
    hint: mention,
    entitled: true,
  };
}
