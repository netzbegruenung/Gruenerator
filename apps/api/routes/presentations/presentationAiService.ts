/**
 * Presentation AI service
 *
 * Turns a natural-language deck-edit request into a list of structured
 * presentation operations (PresentationOperation[]). The operations are applied
 * CLIENT-SIDE by the presentations editor against the deck's Y.Doc — this
 * service only plans them.
 *
 * Mirrors sheets/sheetAiService.ts (plan-then-apply, plain JSON, no streaming),
 * routed through the facade (`aiTools`, lane `editor_ops_presentation`) rather
 * than calling the AI SDK directly — see services/ai/generate.ts. As with the
 * sheet lane, a lane always carries the facade's generic fallback chain: an
 * unavailable Mistral now falls back to cortecs/melious instead of the
 * previous pinned, chain-less "fail loudly". See the stage-3 report.
 */

import {
  getPresentationBrandTheme,
  presentationOperationSchema,
  type PresentationOperation,
} from '@gruenerator/contracts';
import { jsonSchema } from 'ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { aiTools } from '../../services/ai/generate.js';
import { createLogger } from '../../utils/logger.js';

import type { AiResult, Tool } from '../../services/ai/types.js';

const log = createLogger('PresentationAI');

const buildStrictPrompt = (brand?: string | null): string => {
  const theme = getPresentationBrandTheme(brand);
  const palette = theme.aiPalette.join(', ');
  return `Du übersetzt die Anfrage einer Person in Präsentations-Operationen, indem du das Tool applyPresentationOperations aufrufst.

Du MUSST NUR mit einem Aufruf von applyPresentationOperations mit { "operations": [ ... ] } antworten.

Der AKTUELLE FOLIEN-ZUSTAND unten nummeriert die Folien fortlaufend (Folie 1, Folie 2, …). Adressiere Folien IMMER über diese 1-basierte Nummer.

Erlaubte Operationstypen (jedes Objekt braucht ein "type"-Feld):
- { "type": "add_slide", "layout": "title|content|split|quote|image|code", "title": "…", "body": "Markdown …", "notes"?: "…", "at"?: 3, "fontSize"?: "l" }
    // Fügt eine neue Folie hinzu. "at" ist die 1-basierte Einfügeposition; ohne "at" wird ans Ende angehängt.
    // "body" ist Markdown — nutze "- " für Aufzählungen. Halte Folien knapp (Stichpunkte, kein Fließtext).
- { "type": "update_slide", "slide": 2, "title"?: "…", "body"?: "…", "notes"?: "…", "layout"?: "content", "variant"?: 0, "fontSize"?: "l", "transition"?: "fade", "fragments"?: true, "autoAnimate"?: true, "hidden"?: false, "background"?: "#316049", "codeLanguage"?: "typescript" }
    // Ändert NUR die angegebenen Felder von Folie "slide". Weggelassene Felder bleiben unverändert.
    // "variant": Design-Variante innerhalb des Layouts (0–2). title: 0 Klassisch / 1 Geteilt / 2 Sand;
    //   content: 0 Liste / 1 Karten / 2 Nummeriert; quote: 0 Grün / 1 Sand; image: 0 Groß / 1 Geteilt.
    // "background": CSS-Farbe (#316049), Bild-URL oder "linear-gradient(...)".
    // "fragments": Aufzählungspunkte schrittweise einblenden. "autoAnimate": Elemente zur nächsten Folie morphen.
    // "hidden": Folie in der Präsentation überspringen (nicht löschen). "codeLanguage": nur für layout "code".
    // "fontSize": Schriftgröße der Folie: "auto" (Standard: automatisch einpassen) | "xs" | "s" | "m" | "l" | "xl".
    //   Bei Wünschen wie "Text größer/kleiner" nutzen; "auto" setzt auf automatische Anpassung zurück.
- { "type": "delete_slide", "slide": 4 }
- { "type": "move_slide", "from": 5, "to": 2 }
- { "type": "set_deck_option", "defaultTransition"?: "none|fade|slide|convex|concave|zoom", "autoSlide"?: 0, "loop"?: false, "slideNumber"?: false, "accentColor"?: "${theme.defaultAccent}" }
    // "autoSlide": automatischer Folienwechsel nach N Millisekunden (0 = aus). "loop": Endlosschleife. "slideNumber": Foliennummern zeigen.
    // "accentColor": Marken-Akzentfarbe der gesamten Präsentation (Grün-Töne: ${palette}).

REGELN:
- Layouts: "title" = Titelfolie (Deckblatt), "content" = Titel + Aufzählung, "split" = zweispaltig, "quote" = Zitat, "image" = Bildfolie, "code" = Quellcode (body = Code, codeLanguage setzen).
- Markdown-Tabellen ("| Spalte | Spalte |") sind erlaubt, höchstens 4 Spalten — für Gegenüberstellungen mit gleichartigen Feldern. Fließende Aussagen bleiben eine Aufzählung.
- Bilder als "![Beschreibung](URL)" im body, NUR mit einer URL, die bereits in der Präsentation oder in der Anfrage steht. Niemals eine URL erfinden — eine geratene Adresse landet als kaputtes Bild auf der Folie. Die Beschreibung ist der Alternativtext und darf nicht leer sein.
- Für mathematische Formeln LaTeX zwischen $…$ direkt im Markdown-body verwenden.
- Die erste Folie einer Präsentation sollte layout "title" haben.
- Formuliere Inhalte auf Deutsch mit geschlechtergerechter Sprache (Genderstern *).
- Die Person fragt explizit nach einer Änderung — gib die Operationen aus, die sie umsetzen. Nur wenn die Anfrage wirklich unmöglich ist oder keine Änderung erfordert, gib ein leeres Array zurück.
- Gib NUR den Tool-Aufruf zurück. Keinen Fließtext.

BEISPIEL — die Person sagt "Füge am Ende eine Folie mit den drei wichtigsten Argumenten hinzu":
{ "operations": [ { "type": "add_slide", "layout": "content", "title": "Die drei wichtigsten Argumente", "body": "- Argument 1\\n- Argument 2\\n- Argument 3" } ] }`;
};

const TOOL_NAME = 'applyPresentationOperations';
const OPERATIONS_SCHEMA = z.object({ operations: z.array(z.unknown()).max(40) });

/** How many times the forced tool call is attempted — one retry, as before. */
const MAX_ATTEMPTS = 2;

/** The tool call by NAME, in either transport shape the adapters produce. */
function extractToolInput(result: AiResult): { operations?: unknown[] } | null {
  const call = result.tool_calls?.find((c) => c.name === TOOL_NAME);
  if (call) return call.input as { operations?: unknown[] };
  for (const block of result.raw_content_blocks ?? []) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME && block.input) {
      return block.input as { operations?: unknown[] };
    }
  }
  return null;
}

/**
 * Plan presentation operations for a user request. Returns a validated
 * PresentationOperation[] (possibly empty). Throws only on provider/model
 * failure.
 */
export async function generatePresentationOperations(opts: {
  userPrompt: string;
  presentationContext: string;
  referenceContent?: string | null;
  /** Deck country brand — steers the accent palette offered to the planner. */
  brand?: string | null;
}): Promise<PresentationOperation[]> {
  const { userPrompt, presentationContext, referenceContent, brand } = opts;

  const referenceSection = referenceContent?.trim()
    ? `\n\nRECHERCHIERTE QUELLEN (Faktenbasis für die Bearbeitung — übernimm konkrete Zahlen, Namen und Fakten WÖRTLICH aus diesen Quellen; erfinde keine Beispielwerte):\n<recherchierte_quellen>\n${referenceContent.trim().slice(0, 8000)}\n</recherchierte_quellen>`
    : '';

  const system = `${buildStrictPrompt(brand)}\n\nAKTUELLER FOLIEN-ZUSTAND:\n${presentationContext.slice(0, 24_000)}${referenceSection}`;

  // jsonSchema() wrapping is required — the AI SDK's asSchema helper rejects
  // raw JSON-Schema objects (see toolForcedEdit.ts). Deliberately lenient
  // (`z.unknown()` items): a single malformed op must not make the whole tool
  // call unusable. We validate each op ourselves below against
  // presentationOperationSchema and keep the good ones.
  const rawSchema = zodToJsonSchema(OPERATIONS_SCHEMA, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  const tool: Tool = {
    name: TOOL_NAME,
    description:
      'Apply a batch of presentation operations. Each item is one operation object with a "type" field (one of the operation types documented in the system prompt).',
    input_schema: jsonSchema(
      rawSchema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  let toolInput: { operations?: unknown[] } | null = null;
  let lastResult: AiResult | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await aiTools({
        lane: 'editor_ops_presentation',
        system,
        prompt: userPrompt,
        tools: [tool],
        toolChoice: 'required',
        temperature: 0.2,
      });
      lastResult = result;
      toolInput = extractToolInput(result);
      if (toolInput) break;
      log.warn(
        `[PresentationAI] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
      );
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      log.warn(
        `[PresentationAI] attempt ${attempt} threw: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const rawOps = toolInput ? toolInput.operations : undefined;

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
      `[PresentationAI] 0 operations for prompt "${userPrompt}" — finish=${lastResult?.stop_reason ?? 'n/a'}, ` +
        `toolCall=${toolInput ? 'yes' : 'no'}, rawOpsCount=${Array.isArray(rawOps) ? rawOps.length : 'n/a'}, ` +
        `dropped=${dropped.length}, contextChars=${presentationContext.length}, ` +
        `modelText=${JSON.stringify((lastResult?.content ?? '').slice(0, 200))}`
    );
  }

  log.info(`[PresentationAI] Planned ${captured.length} operation(s) for prompt: "${userPrompt}"`);
  return captured;
}
