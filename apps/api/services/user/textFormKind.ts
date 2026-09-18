/**
 * The single rule for what an angelernte Textform's `kind` is, given its
 * mention — the logic `userTextFormsContractRouter.save` and `textFormTools.
 * createTextForm` each re-implemented separately (#Rezepte vereinheitlichen).
 *
 * A mention resolves to exactly one of:
 *  - `preset`  — one of the four `textFormTypeSchema` keys (`presse`,
 *                `instagram`, `facebook`, `antrag`). The mention IS the type.
 *  - `recipe`  — the mention of a Landesverbands-Rezept (`presse-hessen-partei`).
 *                Overriding it needs a matching LV role, checked by
 *                `checkRecipeOverride`.
 *  - `custom`  — a self-chosen slug that shadows neither a preset nor a
 *                system-skill mention.
 *
 * Eigenes, abhängigkeitsfreies Modul (kein Express, kein Postgres), damit die
 * Regel ohne HTTP und ohne Werkzeug-Kontext prüfbar ist — wie
 * `recipeOverrideAccess.ts`, das diese Funktion für Schritt (3) mitbenutzt.
 */
import {
  textFormMentionSchema,
  textFormTypeSchema,
  type TextFormKind,
  type TextFormType,
} from '@gruenerator/contracts';
import { canonicalSkillMention, hasSystemRecipe, SKILLS } from '@gruenerator/shared/agents';

import { checkRecipeOverride } from '../../routes/userTextForms/recipeOverrideAccess.js';

export type TextFormKindVerdict =
  | { ok: true; kind: TextFormKind; textType: TextFormType | null; mention: string }
  | { ok: false; status: 400 | 403 | 409; message: string };

/** Alle Mentions, die einem mitgelieferten Systemrezept gehören. */
const SKILL_MENTIONS = new Set<string>(SKILLS.map((s) => s.mention));
/** Die vier Textyp-Schlüssel aus `textFormTypeSchema`. */
const PRESET_TYPES = new Set<string>(textFormTypeSchema.options);

/**
 * Ein Mention darf mit `@` oder `/` getippt kommen; gespeichert und verglichen
 * wird der nackte, kanonische Schlüssel (zurückgezogene Mentions lösen auf
 * ihren Nachfolger auf, siehe `canonicalSkillMention`).
 */
export function normalizeTextFormMention(raw: string): string {
  return canonicalSkillMention(
    raw
      .trim()
      .replace(/^[@/]+/, '')
      .toLowerCase()
  );
}

/**
 * Mention aus dem Titel: kleingeschrieben, Umlaute bleiben (der Contract
 * erlaubt sie), Leerzeichen und alles andere werden Bindestriche, auf die
 * Contract-Länge gekürzt. Bewusst NICHT `slugifyName`: das transliteriert
 * `ä` → `ae`, und die Person würde ihre Textform dann unter einem Namen
 * suchen, den sie nie getippt hat. (Verbatim aus `textFormTools.ts`.)
 */
export function deriveRecipeMention(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

function kindLabel(kind: TextFormKind): string {
  return kind === 'preset' ? 'Preset' : kind === 'recipe' ? 'Rezept-Stil' : 'Custom';
}

/**
 * Leitet `kind`/`textType` aus einer Mention ab und prüft dabei alles, was
 * dafür nötig ist (Landesverbands-Berechtigung, Kollision mit Systemrezepten,
 * Mention-Form). Reihenfolge ist load-bearing:
 *
 * 1. normalisieren (siehe {@link normalizeTextFormMention}).
 * 2. Mention ist einer der vier Textyp-Schlüssel → `preset`.
 * 3. Mention gehört einem Systemrezept → `checkRecipeOverride` entscheidet
 *    (400/403 unverändert durchgereicht) oder `recipe`.
 * 4. sonst muss die Mention ein gültiger Custom-Slug sein (400 mit der
 *    Zod-Meldung); ein defensiver 409, falls die Mention trotzdem mit einer
 *    SKILLS- oder Preset-Mention kollidiert — nach 2./3. unerreichbar, bleibt
 *    aber stehen, falls `SKILLS`/`hasSystemRecipe` künftig auseinanderlaufen.
 * 5. `requestedKind` (falls mitgeschickt) muss zum abgeleiteten `kind` passen.
 */
export function resolveTextFormKind(params: {
  mention: string;
  requestedKind?: TextFormKind | undefined;
  textType?: TextFormType | null | undefined;
  lvIds: readonly string[] | null;
}): TextFormKindVerdict {
  const mention = normalizeTextFormMention(params.mention);

  let derived: { kind: TextFormKind; textType: TextFormType | null };

  if (PRESET_TYPES.has(mention)) {
    derived = { kind: 'preset', textType: mention as TextFormType };
  } else if (hasSystemRecipe(mention)) {
    const verdict = checkRecipeOverride({ mention, lvIds: params.lvIds });
    if (!verdict.ok) return { ok: false, status: verdict.status, message: verdict.message };
    derived = { kind: 'recipe', textType: params.textType ?? null };
  } else {
    const parsed = textFormMentionSchema.safeParse(mention);
    if (!parsed.success) {
      return {
        ok: false,
        status: 400,
        message: parsed.error.issues[0]?.message ?? 'Ungültige Mention.',
      };
    }
    if (SKILL_MENTIONS.has(mention) || PRESET_TYPES.has(mention)) {
      return {
        ok: false,
        status: 409,
        message: `„@${mention}" ist bereits vergeben. Bitte einen anderen Namen wählen.`,
      };
    }
    derived = { kind: 'custom', textType: params.textType ?? null };
  }

  if (params.requestedKind !== undefined && params.requestedKind !== derived.kind) {
    return {
      ok: false,
      status: 400,
      message: `„@${mention}" ist ein ${kindLabel(derived.kind)}, nicht kind='${params.requestedKind}'.`,
    };
  }

  return { ok: true, kind: derived.kind, textType: derived.textType, mention };
}
