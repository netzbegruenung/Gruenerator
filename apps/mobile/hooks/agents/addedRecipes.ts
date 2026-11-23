import { type AgentListItem } from '@gruenerator/chat';
import { type PublicTextForm, type UserLibraryItem } from '@gruenerator/contracts';
import { isLandesverbandIdentifier } from '@gruenerator/shared/agents';

/**
 * Löst die Rezept-Verweise der Bibliothek auf: Mention → Katalog-Rezept,
 * sonst Zeilen-id → öffentliches Nutzer-Rezept. Landesverbands-Rezepte erst
 * mit geladenen Rollen; eigene Zeilen fallen heraus; ein Verweis ohne
 * sichtbares Ziel fällt still heraus.
 */
export function pickAddedRecipes(input: {
  items: readonly UserLibraryItem[];
  catalogSkills: readonly AgentListItem[];
  rolesLoaded: boolean;
  ownIds: ReadonlySet<string>;
  publicRecipes: readonly PublicTextForm[];
}): { skills: AgentListItem[]; forms: PublicTextForm[] } {
  const skillsByMention = new Map(
    input.catalogSkills
      .filter((s) => input.rolesLoaded || !isLandesverbandIdentifier(s.identifier))
      .map((s) => [s.mention, s])
  );
  const publicById = new Map(
    input.publicRecipes.filter((f) => !input.ownIds.has(f.id)).map((f) => [f.id, f])
  );
  const skills: AgentListItem[] = [];
  const forms: PublicTextForm[] = [];
  for (const item of input.items) {
    if (item.kind !== 'recipe') continue;
    const skill = skillsByMention.get(item.ref);
    if (skill) {
      skills.push(skill);
      continue;
    }
    const form = publicById.get(item.ref);
    if (form) forms.push(form);
  }
  return { skills, forms };
}
