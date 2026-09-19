/**
 * Welches Rezept diesen Turn wirklich trägt — die Wahl der Person zuerst, der
 * Agenten-Default nur als Rückfall.
 *
 * Zwei Regeln, und die Reihenfolge zwischen ihnen ist der ganze Punkt:
 *
 *  1. Eine AUSDRÜCKLICHE Mention gilt immer. Ob getippt (`@presse-hessen-partei`)
 *     oder als `skill:`-Token mitgeschickt — sie ist die Bestellung der Person
 *     und wird von keinem Zustand überstimmt, auch nicht von einer selbst
 *     formulierten Rolle. Bis 08/2026 tat sie das: ein `customSystemPrompt` ohne
 *     Baustein verwarf die Mention, und mit ihr die angelernte Textform, die
 *     Attributionszeile, die Formatregel und die Logzeile — der Ausfall war im
 *     Log nicht einmal sichtbar, weil die Zeile an der Mention hängt (#2928).
 *
 *  2. Der Agenten-Default (`defaultRecipeId` vor `defaultRecipeMention`) springt
 *     nur ein, wenn NICHTS gewählt wurde UND keine eigene Persona läuft. Eine
 *     Persona — ob frei getippt oder als server-eigener Baustein — sagt bereits,
 *     wie geschrieben werden soll; ein ungefragt dazugelegtes Rezept wäre dort
 *     ein zweiter Formatgeber. Das gilt bewusst für BEIDE Custom-Fälle, auch den
 *     Baustein.
 *
 * Gewählt werden kann auf zwei Arten, und beide sind AUSDRÜCKLICH: die Mention
 * und die Zeilen-id (`activeRecipeId`). Die id gewinnt weiter unten im
 * Nachschlag (`resolveRecipeBody`), hier zählt nur, DASS eine Wahl vorliegt —
 * sonst legte der Agenten-Default sein Rezept neben ein gepinntes.
 *
 * Der Default kommt als Thunk herein, nicht als Wert: `roleAwareDefaultRecipeMention`
 * läuft über `SKILLS` und die Profilrollen, und auf einem Turn mit gewählter
 * Mention wird er gar nicht gebraucht. Die id-Variante ist ein reiner Wert —
 * sie steht fertig in der Agenten-Konfiguration.
 *
 * Eigenes, abhängigkeitsfreies Modul aus demselben Grund wie `textFormVisibility.ts`:
 * `respondNode` hat über 2000 Zeilen und `buildSystemMessage` läuft nur mit vier
 * Mocks — die Entscheidung hier ist ohne all das prüfbar.
 */
export interface EffectiveRecipeChoice {
  /** Die wirksame Mention, oder `null` — dann trägt allenfalls `recipeId`. */
  mention: string | null;
  /** Die gepinnte Zeile, oder `null`. Schlägt im Nachschlag die Mention. */
  recipeId: string | null;
}

const NOTHING: EffectiveRecipeChoice = Object.freeze({ mention: null, recipeId: null });

export function resolveEffectiveRecipeMention(params: {
  /** Was die Person für DIESEN Turn gewählt hat (Mention-Popover, `@`, `skill:`-Token). */
  activeSkillMention: string | null | undefined;
  /** Die gewählte Zeile, falls die Oberfläche eine id mitschickt. */
  activeRecipeId?: string | null | undefined;
  /** Rollen-Chat: gesetzt heißt „es läuft eine Persona", egal woher sie stammt. */
  customSystemPrompt: string | null | undefined;
  /** Schreib-Turn im engeren Sinn — kein Gruß, kein Chitchat, keine Produktfrage. */
  isWriteEligibleTurn: boolean;
  /** Der LV-bewusste Agenten-Default. Wird nur bei Bedarf aufgerufen. */
  agentDefault: () => string | null;
  /** Das per id gepinnte Rezept des Agenten. Schlägt seine Default-Mention. */
  agentDefaultRecipeId?: string | null | undefined;
}): EffectiveRecipeChoice {
  const chosenMention = params.activeSkillMention ?? null;
  const chosenId = params.activeRecipeId ?? null;
  if (chosenMention || chosenId) return { mention: chosenMention, recipeId: chosenId };
  if (params.customSystemPrompt) return NOTHING;
  if (!params.isWriteEligibleTurn) return NOTHING;
  const defaultId = params.agentDefaultRecipeId ?? null;
  if (defaultId) return { mention: null, recipeId: defaultId };
  return { mention: params.agentDefault(), recipeId: null };
}
