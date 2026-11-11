/**
 * Das Standard-Rezept eines Agenten im agentischen Loop — EINE Entscheidung,
 * zwei Leser.
 *
 * Im Loop trägt die Rezept-Registry jeden Rezept-Rumpf (`catalogAssembly`):
 * das gewählte (`pinned`), die Methoden und das Standard-Rezept des Agenten
 * (`preloaded`). `respondNode` lässt den Rumpf dann aus dem Systemprompt weg.
 * Beide müssen dafür dieselbe Frage gleich beantworten — weicht eine Seite ab,
 * steht der Rumpf doppelt im Prompt oder fällt zwischen den Toren durch.
 *
 * Bis 11/2026 entschieden beide getrennt: die Registry lud nur den Default
 * eines Ein-Rezept-Agenten vor (`ownedDefaultRecipeMention`), `respondNode`
 * schrieb auf Prosa-Turns jeden anderen Default als Fragment in den Prompt.
 * Das Fragment kannte die Registry nicht, also bot `rezept_laden` dasselbe
 * Rezept ein zweites Mal an (live gemessen: ein Aufruf, ~4 s, doppelter Rumpf)
 * — und wählte das Modell eine andere Textsorte, stand das Fragment als
 * zweiter Formatgeber daneben, statt zu weichen.
 */
import { lastUserText } from '../../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import {
  looksLikeDocsHelpQuestion,
  NO_RETRIEVAL_VERDICTS,
} from '../../../../agents/langgraph/ChatGraph/nodes/classifierSignals.js';
import {
  resolveEffectiveRecipeMention,
  type EffectiveRecipeChoice,
} from '../../../../agents/langgraph/ChatGraph/nodes/effectiveRecipeMention.js';
import { type ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import { isProductMetaQuestion } from '../../../../services/chat/productKnowledge.js';
import {
  ownedDefaultRecipeMention,
  roleAwareDefaultRecipeMention,
} from '../../agents/lvRecipePreference.js';

import { looksLikeChitchatTurn } from './routing.js';

type DefaultRecipeState = Pick<
  ChatGraphState,
  | 'intent'
  | 'loopDemotedFromProse'
  | 'lastUserTextNoMentions'
  | 'messages'
  | 'mentionPinnedTool'
  | 'activeSkillMention'
  | 'activeRecipeId'
  | 'customSystemPrompt'
  | 'activeRole'
  | 'userLocale'
  | 'agentConfig'
>;

/** Ein Prosa-Turn, der als `agentic` im Loop läuft (Klassifikator `proseGoesToLoop`). */
export function isProseLoopState(
  state: Pick<ChatGraphState, 'intent' | 'loopDemotedFromProse'>
): boolean {
  return (
    state.loopDemotedFromProse != null ||
    (NO_RETRIEVAL_VERDICTS.has(state.intent) && state.intent !== 'greeting')
  );
}

/**
 * Ein Schreib-Turn im engeren Sinn: keine neutrale Zusammenfassung, kein Gruß,
 * kein Plaudern, keine Produkt- oder Hilfefrage. Nur dort springt ein
 * Agenten-Default ein — ~2k Tokens Pressemitteilungs-Format auf „was kannst
 * du?" wären verschenkt.
 */
export function isRecipeWriteTurn(state: DefaultRecipeState): boolean {
  if (state.intent === 'summary' || state.intent === 'greeting') return false;
  const text = state.lastUserTextNoMentions ?? lastUserText(state);
  if (looksLikeChitchatTurn(text) || isProductMetaQuestion(text)) return false;
  return state.mentionPinnedTool !== 'gruenerator_docs_search' && !looksLikeDocsHelpQuestion(text);
}

/**
 * Welches Standard-Rezept die Registry für diesen Loop-Turn vorab lädt, oder
 * `null`. Eine eigene Wahl (Mention, gepinnte Zeile) und eine Persona schließen
 * den Default aus (`resolveEffectiveRecipeMention`).
 *
 * - Prosa-Schreib-Turn: derselbe Default wie im Einzelpfad — `defaultRecipeId`
 *   vor der LV-bewussten Mention.
 * - Sonst nur der Default eines Ein-Rezept-Agenten, auch auf Recherchefragen
 *   („Wie positioniert sich der LV zu …?"), außer beim Plaudern und auf
 *   Produktfragen. Warum nur dort: `ownedDefaultRecipeMention`.
 */
export function loopAgentDefaultRecipe(state: DefaultRecipeState): EffectiveRecipeChoice | null {
  if (state.activeSkillMention || state.activeRecipeId || state.customSystemPrompt) return null;
  const agentConfig = state.agentConfig;
  if (isProseLoopState(state) && isRecipeWriteTurn(state)) {
    const choice = resolveEffectiveRecipeMention({
      activeSkillMention: null,
      customSystemPrompt: null,
      isWriteEligibleTurn: true,
      agentDefault: () =>
        roleAwareDefaultRecipeMention(agentConfig, {
          activeRole: state.activeRole,
          userLocale: state.userLocale,
        }),
      agentDefaultRecipeId: agentConfig.defaultRecipeId ?? null,
    });
    return choice.mention || choice.recipeId ? choice : null;
  }
  const owned = ownedDefaultRecipeMention(agentConfig);
  if (!owned) return null;
  const text = state.lastUserTextNoMentions ?? lastUserText(state);
  if (looksLikeChitchatTurn(text) || isProductMetaQuestion(text)) return null;
  return { mention: owned, recipeId: null };
}
