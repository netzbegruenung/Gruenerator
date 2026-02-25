import { extractLocaleFromRequest } from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { assemblePromptGraphAsync } from '../../promptAssemblyGraph.js';
import { LOCALE_CONTEXT, REQUEST_TYPE_DISPLAY_NAMES } from '../types.js';

import type { EnrichedState } from '../../../../utils/types/requestEnrichment.js';
import type { PRAgentRequest } from '../../PRAgent/types.js';
import type { AntragAgentState } from '../types.js';

const log = createLogger('AntragAgent:generate');

function buildSectionInstructions(
  requestType: AntragAgentState['requestType'],
  localeCtx: (typeof LOCALE_CONTEXT)[string]
): string {
  switch (requestType) {
    case 'kleine_anfrage':
      return `Erstelle eine KLEINE ANFRAGE mit folgender Struktur:

1. **Betreff**: Präziser Titel der Anfrage
2. **Vorbemerkung**: ${localeCtx.inquiryReference}. Kurze Darstellung des Sachverhalts und warum die Anfrage nötig ist.
3. **Fragen**: Nummerierte, konkrete W-Fragen (Wer, Was, Wann, Wie viele, Welche). Jede Frage zielt auf überprüfbare Fakten.

Formuliere sachlich und präzise. Vermeide suggestive Fragen.`;

    case 'grosse_anfrage':
      return `Erstelle eine GROSSE ANFRAGE mit folgender Struktur:

1. **Betreff**: Aussagekräftiger Titel
2. **Politische Vorbemerkung**: Übergeordnete politische Einordnung des Themas. Bezug zu aktuellen Entwicklungen und grünen Positionen.
3. **Fragenblöcke**: Thematisch gruppierte Fragen (je 3-5 Fragen pro Block mit Zwischenüberschrift). Fragen sollen eine umfassende Bestandsaufnahme ermöglichen.
4. **Antrag auf mündliche Aussprache**: Begründung für die Debatte im ${localeCtx.municipalBody}.

Formuliere politisch klar, aber sachlich. Die Fragen sollen eine parlamentarische Debatte ermöglichen.`;

    default:
      return `Erstelle einen ANTRAG mit folgender Struktur:

1. **Betreff**: Aussagekräftiger Titel des Antrags
2. **Beschlussvorschlag**: Konkreter Beschlusstext. Orientiere dich am Muster: "${localeCtx.decisionFormula}"
3. **Sachverhalt**: Darstellung der aktuellen Situation und des Problems
4. **Begründung**: Politische und fachliche Argumente für den Antrag. Bezug zu grünen Kernwerten {{partyNameGenitive}}.
5. **Finanzielle Auswirkungen**: Geschätzte Kosten oder Hinweis auf Kostenneutralität

Formuliere formal korrekt für den ${localeCtx.municipalBody}. Der Beschlussvorschlag muss rechtlich umsetzbar sein.`;
  }
}

export async function generateNode(state: AntragAgentState): Promise<Partial<AntragAgentState>> {
  const startTime = Date.now();
  const requestTypeDisplay = REQUEST_TYPE_DISPLAY_NAMES[state.requestType];
  log.debug(`[generateNode] Generating ${requestTypeDisplay}`);

  if (!state.enrichedState) {
    log.error('[generateNode] No enriched state, cannot generate');
    return {
      generatedContent: '',
      generationTimeMs: Date.now() - startTime,
      error: 'Keine angereicherten Daten für die Generierung verfügbar',
    };
  }

  try {
    const locale = extractLocaleFromRequest(state.req);
    const localeCtx = LOCALE_CONTEXT[locale] || LOCALE_CONTEXT['de-DE'];
    const sectionInstructions = buildSectionInstructions(state.requestType, localeCtx);

    const enrichedWithStrategy: EnrichedState = {
      ...state.enrichedState,
      knowledge: [
        ...state.enrichedState.knowledge,
        ...(state.strategy ? [`Argumentationsstrategie (bitte befolgen):\n${state.strategy}`] : []),
        ...(state.researchContext ? [`Recherche-Kontext:\n${state.researchContext}`] : []),
      ],
    };

    const request = enrichedWithStrategy.request as PRAgentRequest;

    const systemRole = `Du agierst als erfahrener kommunalpolitischer Redakteur für {{partyName}} mit Expertise in der Arbeit im ${localeCtx.municipalBody}.

${sectionInstructions}

WICHTIG: Gib nur den finalen deutschen Text aus, keine Erklärungen oder Kommentare. Nutze Markdown-Formatierung direkt im Text (Überschriften mit #, Aufzählungen mit -). Verwende KEINE Code-Fences (\`\`\`) um den Text.`;

    const promptResult = await assemblePromptGraphAsync({
      ...enrichedWithStrategy,
      systemRole,
      request: `Erstelle ${requestTypeDisplay === 'Antrag' ? 'einen ' + requestTypeDisplay : 'eine ' + requestTypeDisplay} zum Thema:\n\n${request.inhalt}${state.gliederung ? `\n\nGremium/Gliederung: ${state.gliederung}` : ''}`,
    });

    const aiResult = await state.req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'antrag',
        usePrivacyMode: (request.usePrivacyMode as boolean) || false,
        systemPrompt: promptResult.system,
        messages: promptResult.messages,
        options: {
          max_tokens: 3000,
          temperature: 0.5,
          top_p: 0.9,
        },
      },
      state.req
    );

    let generatedContent = aiResult.content || aiResult.data?.content || '';

    // LLMs (especially Magistral) often wrap markdown output in ```markdown fences.
    // Strip them server-side before streaming — the frontend stripWrappingCodeFence
    // only runs on the final accumulated text, too late for streamed chunks.
    generatedContent = stripCodeFences(generatedContent);

    const generationTimeMs = Date.now() - startTime;
    log.debug(`[generateNode] ${requestTypeDisplay} generated in ${generationTimeMs}ms`);
    log.debug(
      `[generateNode] Content length: ${generatedContent.length}, ` +
        `starts with code fence: ${/^[\s]*```/.test(generatedContent)}, ` +
        `first 200 chars: ${generatedContent.substring(0, 200).replace(/\n/g, '\\n')}`
    );

    return {
      generatedContent,
      generationTimeMs,
    };
  } catch (error) {
    log.error('[generateNode] Generation failed:', error);
    return {
      generatedContent: '',
      generationTimeMs: Date.now() - startTime,
      error: `Generierung fehlgeschlagen: ${(error as Error).message}`,
    };
  }
}

/**
 * Strips wrapping code fences from LLM output. Handles both complete fences
 * (```markdown...```) and unclosed fences (```markdown... without closing ```).
 */
function stripCodeFences(content: string): string {
  if (!content) return content;
  let text = content.trim();

  // Strip opening fence: ```markdown\n or ```\n
  const openFence = /^```[a-zA-Z]*\s*\n/;
  if (openFence.test(text)) {
    text = text.replace(openFence, '');
    // Strip closing fence if present
    text = text.replace(/\n```\s*$/, '');
  }

  return text.trim();
}
