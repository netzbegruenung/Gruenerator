import {
  SKILLS,
  isLandesverbandIdentifier,
  isLvItemVisibleForRoles,
} from '@gruenerator/shared/agents';

/** Mention → Kennung des Agenten, dem das Rezept gehört. */
const SKILL_OWNERS = new Map<string, string>(SKILLS.map((s) => [s.mention, s.identifier]));

export type RecipeOverrideVerdict =
  { ok: true } | { ok: false; status: 400 | 403; message: string };

/**
 * Darf diese Person einen eigenen Stil FÜR dieses mitgelieferte Rezept
 * hinterlegen? (`kind: 'recipe'`, seit #2930.)
 *
 * Der Stil ersetzt den Rumpf des Rezepts. Anlegen darf ihn deshalb nur, wem das
 * Rezept überhaupt angeboten wird — dieselbe Zuteilung wie in Agentur,
 * Rezept-Bibliothek und Rezept-Katalog. Ohne diese Prüfung könnte sich jede*r
 * per PUT auf das Rezept eines fremden Landesverbands setzen; die Mention steht
 * im Pfad, und `SKILLS` liegt in jedem Bundle.
 *
 * Nur Landesverbands-Rezepte sind überschreibbar. Die generischen
 * (`presse`, `instagram`, …) gehen weiterhin über `kind: 'preset'`, wo die
 * Mention gleich dem Textyp sein muss — und für ein Rezept ohne Landesverband
 * (`wahlpruefstein`) gibt es niemanden, an dem eine Berechtigung hinge.
 *
 * `lvIds === null` heißt „nicht bekannt" und lässt durch (dieselbe Bedeutung wie
 * überall sonst); der Server kennt die Rollen aber immer, weil er sie aus der
 * Profiltabelle liest — dort ist „keine Rolle" die leere Liste.
 *
 * Eigenes, abhängigkeitsfreies Modul, damit die Berechtigung ohne Express,
 * ts-rest und Datenbank prüfbar ist.
 */
export function checkRecipeOverride(params: {
  mention: string;
  lvIds: readonly string[] | null;
}): RecipeOverrideVerdict {
  const owner = SKILL_OWNERS.get(params.mention);
  if (!owner || !isLandesverbandIdentifier(owner)) {
    return {
      ok: false,
      status: 400,
      message: `„@${params.mention}" ist kein Rezept eines Landesverbands.`,
    };
  }
  if (!isLvItemVisibleForRoles(owner, params.lvIds)) {
    return {
      ok: false,
      status: 403,
      message: `„@${params.mention}" gehört zu einem Landesverband, für den du keine Rolle hinterlegt hast.`,
    };
  }
  return { ok: true };
}
