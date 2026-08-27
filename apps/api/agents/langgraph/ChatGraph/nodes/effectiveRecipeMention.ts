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
 *  2. Der Agenten-Default (`defaultRecipeMention`) springt nur ein, wenn NICHTS
 *     gewählt wurde UND keine eigene Persona läuft. Eine Persona — ob frei
 *     getippt oder als server-eigener Baustein — sagt bereits, wie geschrieben
 *     werden soll; ein ungefragt dazugelegtes Rezept wäre dort ein zweiter
 *     Formatgeber. Das gilt bewusst für BEIDE Custom-Fälle, auch den Baustein.
 *
 * Der Default kommt als Thunk herein, nicht als Wert: `roleAwareDefaultRecipeMention`
 * läuft über `SKILLS` und die Profilrollen, und auf einem Turn mit gewählter
 * Mention wird er gar nicht gebraucht.
 *
 * Eigenes, abhängigkeitsfreies Modul aus demselben Grund wie `textFormMention.ts`:
 * `respondNode` hat über 2000 Zeilen und `buildSystemMessage` läuft nur mit vier
 * Mocks — die Entscheidung hier ist ohne all das prüfbar.
 */
export function resolveEffectiveRecipeMention(params: {
  /** Was die Person für DIESEN Turn gewählt hat (Mention-Popover, `@`, `skill:`-Token). */
  activeSkillMention: string | null | undefined;
  /** Rollen-Chat: gesetzt heißt „es läuft eine Persona", egal woher sie stammt. */
  customSystemPrompt: string | null | undefined;
  /** Schreib-Turn im engeren Sinn — kein Gruß, kein Chitchat, keine Produktfrage. */
  isWriteEligibleTurn: boolean;
  /** Der LV-bewusste Agenten-Default. Wird nur bei Bedarf aufgerufen. */
  agentDefault: () => string | null;
}): string | null {
  const chosen = params.activeSkillMention ?? null;
  if (chosen) return chosen;
  if (params.customSystemPrompt) return null;
  return params.isWriteEligibleTurn ? params.agentDefault() : null;
}
