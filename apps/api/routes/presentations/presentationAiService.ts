/**
 * Presentation AI service
 *
 * Turns a natural-language deck-edit request into a list of structured
 * presentation operations (PresentationOperation[]). The operations are applied
 * CLIENT-SIDE by the presentations editor against the deck's Y.Doc — this
 * service only plans them.
 *
 * Mirrors sheets/sheetAiService.ts (plan-then-apply, plain JSON, no streaming).
 */

import { presentationOperationSchema, type PresentationOperation } from '@gruenerator/contracts';
import { generateText, tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../chat/agents/providers.js';

const log = createLogger('PresentationAI');

// Deck planning ALWAYS uses Mistral Medium 3.5 — the op-planner needs a strong
// model. Pinned with no provider chain: if Mistral is unavailable we fail
// loudly rather than silently downgrade. `mistral-medium-2604` === "Mistral
// Medium 3.5" (see services/ai/modelDiscovery.ts).
const PRESENTATION_AI_PROVIDER = 'mistral';
const PRESENTATION_AI_MODEL = 'mistral-medium-2604';

const PRESENTATION_TOOL_STRICT_PROMPT = `Du übersetzt die Anfrage einer Person in Präsentations-Operationen, indem du das Tool applyPresentationOperations aufrufst.

Du MUSST NUR mit einem Aufruf von applyPresentationOperations mit { "operations": [ ... ] } antworten.

Der AKTUELLE FOLIEN-ZUSTAND unten nummeriert die Folien fortlaufend (Folie 1, Folie 2, …). Adressiere Folien IMMER über diese 1-basierte Nummer.

Erlaubte Operationstypen (jedes Objekt braucht ein "type"-Feld):
- { "type": "add_slide", "layout": "title|content|split|quote|image|code", "title": "…", "body": "Markdown …", "notes"?: "…", "at"?: 3 }
    // Fügt eine neue Folie hinzu. "at" ist die 1-basierte Einfügeposition; ohne "at" wird ans Ende angehängt.
    // "body" ist Markdown — nutze "- " für Aufzählungen. Halte Folien knapp (Stichpunkte, kein Fließtext).
- { "type": "update_slide", "slide": 2, "title"?: "…", "body"?: "…", "notes"?: "…", "layout"?: "content", "variant"?: 0, "transition"?: "fade", "fragments"?: true, "autoAnimate"?: true, "hidden"?: false, "background"?: "#316049", "codeLanguage"?: "typescript" }
    // Ändert NUR die angegebenen Felder von Folie "slide". Weggelassene Felder bleiben unverändert.
    // "variant": Design-Variante innerhalb des Layouts (0–2). title: 0 Klassisch / 1 Geteilt / 2 Sand;
    //   content: 0 Liste / 1 Karten / 2 Nummeriert; quote: 0 Grün / 1 Sand; image: 0 Groß / 1 Geteilt.
    // "background": CSS-Farbe (#316049), Bild-URL oder "linear-gradient(...)".
    // "fragments": Aufzählungspunkte schrittweise einblenden. "autoAnimate": Elemente zur nächsten Folie morphen.
    // "hidden": Folie in der Präsentation überspringen (nicht löschen). "codeLanguage": nur für layout "code".
- { "type": "delete_slide", "slide": 4 }
- { "type": "move_slide", "from": 5, "to": 2 }
- { "type": "set_deck_option", "defaultTransition"?: "none|fade|slide|convex|concave|zoom", "autoSlide"?: 0, "loop"?: false, "slideNumber"?: false, "accentColor"?: "#316049" }
    // "autoSlide": automatischer Folienwechsel nach N Millisekunden (0 = aus). "loop": Endlosschleife. "slideNumber": Foliennummern zeigen.
    // "accentColor": Marken-Akzentfarbe der gesamten Präsentation (Grün-Töne: #316049, #005538, #52907A).

REGELN:
- Layouts: "title" = Titelfolie (Deckblatt), "content" = Titel + Aufzählung, "split" = zweispaltig, "quote" = Zitat, "image" = Bildfolie, "code" = Quellcode (body = Code, codeLanguage setzen).
- Für mathematische Formeln LaTeX zwischen $…$ direkt im Markdown-body verwenden.
- Die erste Folie einer Präsentation sollte layout "title" haben.
- Formuliere Inhalte auf Deutsch mit geschlechtergerechter Sprache (Genderstern *).
- Die Person fragt explizit nach einer Änderung — gib die Operationen aus, die sie umsetzen. Nur wenn die Anfrage wirklich unmöglich ist oder keine Änderung erfordert, gib ein leeres Array zurück.
- Gib NUR den Tool-Aufruf zurück. Keinen Fließtext.

BEISPIEL — die Person sagt "Füge am Ende eine Folie mit den drei wichtigsten Argumenten hinzu":
{ "operations": [ { "type": "add_slide", "layout": "content", "title": "Die drei wichtigsten Argumente", "body": "- Argument 1\\n- Argument 2\\n- Argument 3" } ] }`;

/**
 * Plan presentation operations for a user request. Returns a validated
 * PresentationOperation[] (possibly empty). Throws only on provider/model
 * failure.
 */
export async function generatePresentationOperations(opts: {
  userPrompt: string;
  presentationContext: string;
  referenceContent?: string | null;
}): Promise<PresentationOperation[]> {
  const { userPrompt, presentationContext, referenceContent } = opts;

  if (!isProviderConfigured(PRESENTATION_AI_PROVIDER)) {
    throw new Error(
      'Presentation AI requires Mistral Medium 3.5, but the Mistral provider is not configured (MISTRAL_API_KEY missing)'
    );
  }
  const model = getModel(PRESENTATION_AI_PROVIDER, PRESENTATION_AI_MODEL);
  log.info(`[PresentationAI] Using Mistral Medium 3.5 (${PRESENTATION_AI_MODEL})`);

  const referenceSection = referenceContent?.trim()
    ? `\n\nZUSÄTZLICHER KONTEXT (vorherige Antwort des Assistenten, auf die sich die Person bezieht):\n<reference_content>\n${referenceContent.trim().slice(0, 8000)}\n</reference_content>`
    : '';

  const system = `${PRESENTATION_TOOL_STRICT_PROMPT}\n\nAKTUELLER FOLIEN-ZUSTAND:\n${presentationContext.slice(0, 24_000)}${referenceSection}`;

  const result = await generateText({
    model,
    system,
    prompt: userPrompt,
    tools: {
      applyPresentationOperations: tool({
        description:
          'Apply a batch of presentation operations. Each item is one operation object with a "type" field (one of the operation types documented in the system prompt).',
        // Deliberately lenient: accept the raw array so a single malformed op
        // does not make the SDK reject the WHOLE tool call. We validate each op
        // ourselves below against presentationOperationSchema and keep the good
        // ones.
        inputSchema: z.object({ operations: z.array(z.unknown()).max(40) }),
      }),
    },
    toolChoice: 'required',
    maxOutputTokens: 8000,
    maxRetries: 1,
    temperature: 0.2,
  });

  const toolCall = result.toolCalls.find((tc) => tc.toolName === 'applyPresentationOperations');
  const rawOps = toolCall ? (toolCall.input as { operations?: unknown[] }).operations : undefined;

  // Per-op validation: keep every valid operation, drop (and log) only the
  // malformed ones — one bad op must never silently discard a whole batch.
  const captured: PresentationOperation[] = [];
  const dropped: string[] = [];
  for (const raw of Array.isArray(rawOps) ? rawOps : []) {
    const parsed = presentationOperationSchema.safeParse(raw);
    if (parsed.success) captured.push(parsed.data);
    else
      dropped.push(
        `${parsed.error.issues[0]?.message ?? 'invalid'} :: ${JSON.stringify(raw).slice(0, 160)}`
      );
  }

  if (dropped.length > 0) {
    log.warn(
      `[PresentationAI] Dropped ${dropped.length} malformed operation(s): ${dropped.join(' | ')}`
    );
  }
  if (captured.length === 0) {
    log.warn(
      `[PresentationAI] 0 operations for prompt "${userPrompt}" — finish=${result.finishReason}, ` +
        `toolCall=${toolCall ? 'yes' : 'no'}, rawOpsCount=${Array.isArray(rawOps) ? rawOps.length : 'n/a'}, ` +
        `dropped=${dropped.length}, contextChars=${presentationContext.length}, ` +
        `modelText=${JSON.stringify(result.text.slice(0, 200))}`
    );
  }

  log.info(`[PresentationAI] Planned ${captured.length} operation(s) for prompt: "${userPrompt}"`);
  return captured;
}
