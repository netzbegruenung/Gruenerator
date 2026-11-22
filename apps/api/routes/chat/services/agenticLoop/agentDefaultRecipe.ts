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
  | 'projectLandesverband'
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
 * Die Projekt-Rezepte, die der vorige Turn dieses Chats geladen hat und die
 * dieser Turn vorab lädt (`preloaded`, weicht also einer anderen gewählten
 * Textsorte). Nur in einem Schreib-Turn ({@link isRecipeWriteTurn}) ohne eigene
 * Wahl, ohne Persona und ohne Agent-Default. Nicht nur auf Prosa-Turns wie der
 * Agent-Default: Folgeaufträge laufen meist direkt als `agentic`.
 *
 * Warum: Ein Rezept wirkt nur im Turn, der es lädt, und Folgeaufträge („noch
 * einer", „mach es kürzer") lud das Modell gemessen kaum neu (21.11.2026, je
 * drei Läufe): ohne Hilfe 0/3, mit einer Katalogzeile „im vorigen Turn
 * geladen, lade es erneut" 0–2/3 — der Post zur Pflanzaktion verlor dabei
 * jedes Mal die Pflicht-Hashtags. Vorab geladen bestanden alle 33 Prüfungen,
 * und eine Sachfrage zwischen zwei Briefen blieb ein Satz (3/3).
 */
export function carriedProjectRecipes(
  state: DefaultRecipeState & { projectRecipeIds?: readonly string[] },
  lastTurn: readonly { mention: string; id: string | null }[]
): string[] {
  if (state.activeSkillMention || state.activeRecipeId || state.customSystemPrompt) return [];
  const project = new Set(state.projectRecipeIds ?? []);
  if (project.size === 0) return [];
  if (!isRecipeWriteTurn(state)) return [];
  return [...new Set(lastTurn.flatMap((r) => (r.id && project.has(r.id) ? [r.id] : [])))];
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
          projectLandesverband: state.projectLandesverband ?? null,
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
