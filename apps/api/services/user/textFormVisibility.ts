/**
 * Zwei reine Regeln über Textform-Zeilen: welche Zeile bei gleicher Mention
 * gewinnt ({@link pickVisibleTextForm}), und ob eine Zeile überhaupt als
 * eigener Eintrag auftaucht ({@link isListableTextForm}).
 *
 * Which row wins when the same mention resolves to more than one visible
 * Textform — own, shared into a group, or public. `own` always wins (a
 * person's own override must never be shadowed by something shared at them),
 * `group` beats `public` (a project's own choice outranks the open catalog),
 * and ties within the same access level are broken deterministically so the
 * same input always picks the same row.
 *
 * Eigenes, abhängigkeitsfreies Modul (kein Express, kein Postgres) — reine
 * Funktionen über bereits geladene Zeilen, wie `recipeOverrideAccess.ts`.
 */
import { type TextFormKind } from '@gruenerator/contracts';
import { hasSystemRecipe } from '@gruenerator/shared/agents';

export type TextFormAccess = 'own' | 'group' | 'public';

/**
 * Ist diese Zeile ein EIGENER Eintrag — im Mention-Menü, im Rezept-Katalog des
 * Modells, überall, wo Rezepte aufgezählt werden?
 *
 * Presets und Rezept-Stile ersetzen den Rumpf eines mitgelieferten Rezepts; sie
 * sind keine zweite Zeile daneben, sonst stünde der selbst gewählte Titel neben
 * dem des Rezepts und verdrängte ihn. Gefragt wird deshalb nach dem
 * mitgelieferten Rezept und nicht nach `kind` allein: `antrag` ist ein Preset
 * OHNE Systemrezept, überschreibt also nichts und muss sich selbst eintragen —
 * sonst ist der angelernte Antrags-Stil auf keinem Pfad erreichbar (#2937).
 *
 * Hier und nicht in der Abfrage, weil dieselbe Frage an mehreren Stellen
 * gestellt wird und die Antwort ohne Postgres prüfbar sein soll.
 */
export function isListableTextForm(kind: TextFormKind, mention: string): boolean {
  return kind === 'custom' || !hasSystemRecipe(mention);
}

/**
 * Darf diese Zeile über den eigenen Zugang HINAUS reichen — in ein Projekt
 * geteilt oder in der Agentura gelistet werden, und darf sie bei fremden Leuten
 * injiziert werden?
 *
 * Zwei Bedingungen, und die zweite ist nicht dieselbe Frage wie oben:
 * `kind === 'custom'` hält Presets und Rezept-Stile draussen (sie ersetzen den
 * Rumpf eines mitgelieferten Rezepts, und der gehört nicht dem Eigentümer, um
 * ihn weiterzugeben); `!hasSystemRecipe(mention)` hält zusätzlich die
 * `custom`-Zeile draussen, deren Mention ein Systemrezept VERDECKT. Solche
 * Zeilen gibt es — aus der Zeit vor `resolveTextFormKind` —, und
 * {@link isListableTextForm} ist für sie blind: es lässt jede `custom`-Zeile
 * durch, weil es die andere Frage beantwortet (steht sie als eigene Menüzeile?).
 * Geteilt tauschte so eine Zeile fremden Leuten das Systemrezept still aus.
 *
 * Gilt am Schreib- UND am Lesepfad: eine Zeile, die vor dieser Regel
 * veröffentlicht wurde, wird beim Lesen wieder aussortiert.
 */
export function isShareableTextForm(kind: TextFormKind, mention: string): boolean {
  return kind === 'custom' && !hasSystemRecipe(mention);
}

const ACCESS_RANK: Record<TextFormAccess, number> = { own: 0, group: 1, public: 2 };

/**
 * Picks the row with the highest-precedence access for `userId`, breaking
 * ties by `created_at` ascending (older wins) and then `id` ascending.
 * Returns `undefined` for an empty input.
 */
export function pickVisibleTextForm<
  T extends { user_id: string; created_at: Date | string; id: string; access: TextFormAccess },
>(rows: readonly T[], userId: string): T | undefined {
  let best: T | undefined;

  for (const row of rows) {
    const access: TextFormAccess = row.user_id === userId ? 'own' : row.access;
    if (!best) {
      best = row;
      continue;
    }
    const bestAccess: TextFormAccess = best.user_id === userId ? 'own' : best.access;
    const cmp = compare({ ...row, access }, { ...best, access: bestAccess });
    if (cmp < 0) best = row;
  }

  return best;
}

function compare(
  a: { created_at: Date | string; id: string; access: TextFormAccess },
  b: { created_at: Date | string; id: string; access: TextFormAccess }
): number {
  const rankDiff = ACCESS_RANK[a.access] - ACCESS_RANK[b.access];
  if (rankDiff !== 0) return rankDiff;

  const createdDiff = toTime(a.created_at) - toTime(b.created_at);
  if (createdDiff !== 0) return createdDiff;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
