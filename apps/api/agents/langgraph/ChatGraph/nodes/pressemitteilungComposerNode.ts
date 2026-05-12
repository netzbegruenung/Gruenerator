/**
 * Pressemitteilung Composer Node
 *
 * Replaces respondNode for `intent === 'pressemitteilung_examples'`. Builds a
 * PM-specific system prompt that loads up to 4 full LV press releases as
 * worked examples and instructs the model to mimic their structure/tonality.
 *
 * Writes the prompt to `state.responseText`. `respondNode.buildSystemMessage`
 * checks for this and returns it as-is when set, so the controller's existing
 * streamText pipeline picks up the press-specific prompt without changes.
 *
 * Model selection (Gemma 4 override) lives in the controller, not here.
 */

import { createLogger } from '../../../../utils/logger.js';
import { formatGermanDate } from '../../../../utils/stringUtils.js';

import type { ChatGraphState, PressExampleItem } from '../types.js';

const log = createLogger('PressemitteilungComposer');

const PM_CRAFT_RUBRIC = `## PRESSEMITTEILUNG-HANDWERK

Eine professionelle Pressemitteilung folgt einer klaren journalistischen Struktur:

1. **Aussagekräftiger Titel** — präzise, eine Hauptaussage. Keine Marketing-Sprache.
2. **Lead-Absatz** — beantwortet die W-Fragen (Wer/Was/Wann/Wo/Warum/Wie). Maximal 3-4 Sätze. Liefert die Kernnachricht eigenständig: Leser*innen, die nur den Lead lesen, müssen alles Wesentliche verstanden haben.
3. **Hauptteil** — Details, Kontext, weitere Argumente. Strukturierte Absätze, keine Aufzählungslisten.
4. **Wörtliches Zitat** — von der*dem Sprecher*in / Verantwortlichen, idealerweise nach dem Lead. Format: \`"Aussage", erklärt [Name], [Funktion].\` Das Zitat liefert die Bewertung oder Forderung.
5. **Hintergrund** — Kontextinformationen, Statistiken, frühere Vorgänge. Eingeleitet mit \`Hintergrund:\` oder \`Zum Hintergrund:\`.

**Tonalität**: journalistischer Nachrichtenstil, sachlich-objektiv, aktive Sprache, keine Emojis, keine Hashtags, keine direkte Anrede.
**Länge**: 1500–2500 Zeichen.
**Datumszeile**: Beginne mit \`[Ort], [Datum].\` (z.B. \`Wien, 9. Mai 2026\`).`;

function formatExample(ex: PressExampleItem, idx: number): string {
  const meta = [ex.lv, ex.publishedAt].filter(Boolean).join(' · ');
  const header = meta ? `### Vorlage ${idx + 1} (${meta})` : `### Vorlage ${idx + 1}`;
  return `${header}\n**${ex.title}**\n\n${ex.body}`;
}

/**
 * Build the press-specific system prompt: agent.systemRole + craft rubric +
 * up to 4 full LV PMs as worked examples + writing-assignment guidance.
 *
 * Pulls from `state.examplesResult.press` (populated by the unified search
 * service with full PM bodies reconstructed from all chunks).
 */
export function buildPressemitteilungSystemPrompt(state: ChatGraphState): string {
  const { agentConfig, examplesResult } = state;
  const examples = (examplesResult?.press ?? []).slice(0, 4);

  const today = formatGermanDate();

  const examplesBlock =
    examples.length === 0
      ? '\n\n*(Keine Vorlagen verfügbar — schreibe eigenständig nach dem Handwerks-Standard.)*'
      : `\n\n## VORLAGEN\n\nFolgende echte Pressemitteilungen aus den Landesverbänden dienen als Vorlage. Mimik ihre Tonalität, Lead-Struktur, Zitat-Setzung und Hintergrund-Framing — schreibe NICHT generisch.\n\n${examples.map(formatExample).join('\n\n---\n\n')}`;

  return `${agentConfig.systemRole}

Heutiges Datum: ${today}

${PM_CRAFT_RUBRIC}${examplesBlock}

## SCHREIBAUFTRAG

Verfasse jetzt eine Pressemitteilung zum unten erfragten Thema. Befolge das PM-Handwerk und mimik die Vorlagen. Kein einleitender Meta-Text ("Hier ist deine Pressemitteilung..."), kein abschließender Kommentar — nur die fertige Pressemitteilung. Erfinde keine Fakten oder Zitate.`;
}

/**
 * Press-composition node. Sibling of respondNode, runs only for
 * `pressemitteilung_examples` intent. Pure prompt-builder; the controller
 * still owns model resolution + streamAndAccumulate.
 */
export async function pressemitteilungComposerNode(
  state: ChatGraphState
): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const exampleCount = state.examplesResult?.press?.length ?? 0;
  log.info(`[Composer] Building PM-specific prompt (${exampleCount} press examples available)`);

  try {
    const systemMessage = buildPressemitteilungSystemPrompt(state);
    const responseTimeMs = Date.now() - startTime;
    log.info(`[Composer] Prompt prepared in ${responseTimeMs}ms (${systemMessage.length} chars)`);
    return {
      responseText: systemMessage,
      streamingStarted: false,
      responseTimeMs,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('[Composer] Error:', errMsg);
    return {
      responseText: '',
      responseTimeMs: Date.now() - startTime,
      error: `Press prompt building failed: ${errMsg}`,
    };
  }
}
