/**
 * Darf diese Person dieses Rezept an ihren Agenten binden?
 *
 * Die Frage stellt sich beim Speichern einer Agenten-Konfiguration, nicht im
 * Turn — und sie muss dieselbe Antwort geben wie das Mention-Menü, sonst bindet
 * jemand ein Landesverbands-Rezept, das er nirgends findet und dessen Rumpf
 * `resolveRecipeBody` ihm später auch nicht liefert.
 *
 * Geprüft wird die NORMALISIERTE Mention (`normalizeTextFormMention`, dieselbe
 * Funktion, die `resolveRecipeBody` benutzt). Aufrufer müssen genau diese Form
 * auch persistieren, nicht die getippte: ein gespeichertes „@Presse" träfe im
 * Turn keine Zeile, obwohl es hier durchgegangen ist.
 *
 * Im Übrigen wird hier nichts neu entschieden: Für eine Mention zählt die
 * Mitgliedschaft im Katalog, den das Modell und das Menü ohnehin sehen
 * (`buildRecipeCatalog` — Audience, Landesverbands-Rolle, Instanz, abgeschaltete
 * Gliederungen). Für eine gepinnte Zeile zählt der Sichtbarkeitstest der Zeile
 * selbst (eigen, per Projekt geteilt, oder öffentlich).
 */
import { type RoleLandesverbandInput } from '@gruenerator/shared/agents';

import { buildRecipeCatalog } from '../../routes/chat/agents/recipeCatalog.js';
import { normalizeTextFormMention } from '../user/textFormKind.js';
import { getTextFormForInjectionById } from '../user/textFormRepository.js';

/**
 * `recipeId` gewinnt über `mention` — dieselbe Reihenfolge, in der
 * `resolveRecipeBody` den Rumpf holt, damit geprüft wird, was später auch wirkt.
 *
 * Ohne beides gibt es nichts zu prüfen, und das ist `false`: das Leeren eines
 * Feldes ist kein zu prüfender Wert, sondern ein eigener Zweig beim Aufrufer.
 */
export async function isRecipeUsableForAgent(params: {
  userId: string;
  mention?: string | null;
  recipeId?: string | null;
  userLocale: string | null;
  roles: readonly RoleLandesverbandInput[] | null;
}): Promise<boolean> {
  const { userId, userLocale, roles } = params;

  if (params.recipeId) {
    return (await getTextFormForInjectionById(params.recipeId, userId)) !== null;
  }

  if (!params.mention) return false;

  const mention = normalizeTextFormMention(params.mention);
  const catalog = await buildRecipeCatalog({ userLocale, userId, roles });
  return catalog.some((entry) => entry.mention === mention);
}
