import { generateObject } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getIntermediateModel } from '../ai/providers.js';

import { MEMORY_CATEGORIES, CATEGORY_DESCRIPTIONS, type MemoryCategory } from './categories.js';
import { getMem0Instance } from './Mem0Service.js';

import type { MemoryConfidence } from './types.js';

const log = createLogger('MemoryGatekeeper');

// How many existing memories to surface to the gatekeeper for its
// "already covered?" check. Kept small — this is a cheap pre-filter, not a
// full recall; mem0's own extraction step does its own (weaker) comparison
// against the 10 nearest neighbours regardless.
const EXISTING_MEMORIES_FOR_DEDUP_CHECK = 8;
const EXISTING_MEMORY_TEXT_TRUNCATE = 160;

const LayerDecisionSchema = z.object({
  shouldExtract: z.boolean().describe('Ob diese Kategorie extrahiert werden soll'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'high: explizite Aussage. medium: aus Gesprächsmuster abgeleitet. low: einmalige, mehrdeutige Erwähnung.'
    ),
  reasoning: z.string().describe('Kurze Begründung (1 Satz)'),
});

const GatekeeperResultSchema = z.object({
  identity: LayerDecisionSchema,
  activity: LayerDecisionSchema,
  context: LayerDecisionSchema,
  experience: LayerDecisionSchema,
  preference: LayerDecisionSchema,
});

export type GatekeeperResult = z.infer<typeof GatekeeperResultSchema>;

export interface GatekeeperDecision {
  shouldExtract: boolean;
  categories: MemoryCategory[];
  /** Highest confidence among the categories that survived the low-confidence filter. */
  confidence: MemoryConfidence | null;
  reasoning: string;
  durationMs: number;
}

const CONFIDENCE_RANK: Record<MemoryConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Fetch a compact list of existing memories relevant to this turn so the
 * gatekeeper can skip facts that are already stored (phrased differently).
 * mem0ai's own extraction step does a similar check internally, but only
 * against its 10 nearest neighbours with a "when in doubt, extract" bias —
 * this pre-filter catches near-duplicates before the extraction LLM (and its
 * own bias toward completeness) ever runs.
 */
async function fetchExistingMemoriesContext(userId: string, query: string): Promise<string | null> {
  const mem0 = getMem0Instance();
  if (!mem0) return null;

  try {
    const existing = await mem0.searchMemories(query, userId, EXISTING_MEMORIES_FOR_DEDUP_CHECK);
    if (existing.length === 0) return null;

    return existing
      .map((m) => {
        const text =
          m.memory.length > EXISTING_MEMORY_TEXT_TRUNCATE
            ? `${m.memory.slice(0, EXISTING_MEMORY_TEXT_TRUNCATE)}…`
            : m.memory;
        return `- ${text}`;
      })
      .join('\n');
  } catch (error) {
    // Non-fatal: the gatekeeper still works without existing-memory context,
    // just without the dedup check for this turn.
    log.warn('[Gatekeeper] Failed to fetch existing memories for dedup check:', error);
    return null;
  }
}

const GATEKEEPER_SYSTEM_PROMPT = `Du bist ein Gedächtnis-Gatekeeper für den Grünerator, eine KI-Plattform für Die Grünen.

Deine Aufgabe: Entscheide für jede Kategorie, ob der folgende Gesprächsaustausch Informationen enthält, die langfristig gespeichert werden sollten.

## Kategorien

${MEMORY_CATEGORIES.map((c) => `- **${c}**: ${CATEGORY_DESCRIPTIONS[c]}`).join('\n')}

## Regeln

EXTRAHIERE bei:
- Persönliche Fakten über den Nutzer ("Ich bin Kreisverbandsvorstand in Freiburg")
- Politische Positionen und Haltungen ("Klimaschutz ist mir besonders wichtig")
- Ausdrückliche Präferenzen ("Ich bevorzuge immer kurze, direkte Texte")
- Laufende Projekte oder Aktivitäten ("Wir arbeiten gerade am Antrag für den Parteitag")
- Erfahrungen und Lektionen ("Die letzte PM kam sehr gut an, weil...")

ÜBERSPRINGE bei:
- Reine Aufgaben-Anweisungen ("Schreib mir eine Pressemitteilung", "Mach das kürzer")
- Einmalige Generierungsaufträge ohne persönlichen Bezug
- Gesprächs-Metadaten (Grüße, Danke, "Gut gemacht", Feedback zum Tool)
- Fragen über Fakten ohne persönlichen Bezug ("Was ist das Grundsatzprogramm?")
- Formatierungs-Korrekturen ("Mach Aufzählungszeichen daraus")

## Bereits gespeicherte Erinnerungen

Wenn unten eine Liste "Bereits gespeicherte Erinnerungen" steht: prüfe für jede Kategorie, ob die
neue Information inhaltlich schon durch einen der Einträge abgedeckt ist — auch wenn die
Formulierung abweicht. Falls ja: ÜBERSPRINGE diese Kategorie (auch wenn sie sonst extrahiert würde).
Nur wirklich neue oder veränderte Information rechtfertigt eine neue Erinnerung.

## Konfidenz

Bewerte jede extrahierte Kategorie:
- **high**: Explizite Aussage ("Ich bin...", "Ich bevorzuge immer...")
- **medium**: Aus Gesprächsmuster abgeleitet
- **low**: Einmalige Erwähnung, mehrdeutig — wird NICHT gespeichert, also im Zweifel lieber "low" als raten

## Wichtig

- Im Zweifel ÜBERSPRINGE — lieber zu wenig als zu viel speichern
- Aufgaben-Anforderungen ≠ Präferenzen. "Schreib formell" für einen einzelnen Text ist KEINE Präferenz
- "Ich bevorzuge immer formelle Texte" IST eine Präferenz (Schlüsselwort: "immer", "grundsätzlich", "generell")
- Antworte IMMER mit dem strukturierten Schema`;

export async function shouldExtractMemories(
  userMessage: string,
  assistantMessage: string,
  userId: string
): Promise<GatekeeperDecision> {
  const startTime = Date.now();

  try {
    const model = getIntermediateModel('heavy');

    const existingMemoriesContext = await fetchExistingMemoriesContext(
      userId,
      `${userMessage}\n${assistantMessage}`
    );

    const prompt = [
      `## Nutzer-Nachricht\n${userMessage}`,
      `## Assistenten-Antwort\n${assistantMessage.slice(0, 1000)}`,
      existingMemoriesContext
        ? `## Bereits gespeicherte Erinnerungen\n${existingMemoriesContext}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await generateObject({
      model,
      schema: GatekeeperResultSchema,
      system: GATEKEEPER_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 600,
      temperature: 0,
      abortSignal: AbortSignal.timeout(8000),
    });

    const categories: MemoryCategory[] = [];
    const reasonings: string[] = [];
    let confidence: MemoryConfidence | null = null;

    for (const cat of MEMORY_CATEGORIES) {
      const decision = result.object[cat];
      // Low-confidence extractions are dropped here, not just tagged — a
      // "maybe, once, ambiguous" fact is exactly the kind of thing that piles
      // up in the store without ever being useful again.
      if (decision.shouldExtract && decision.confidence !== 'low') {
        categories.push(cat);
        reasonings.push(`${cat} (${decision.confidence}): ${decision.reasoning}`);
        if (!confidence || CONFIDENCE_RANK[decision.confidence] > CONFIDENCE_RANK[confidence]) {
          confidence = decision.confidence;
        }
      }
    }

    const shouldExtract = categories.length > 0;
    const durationMs = Date.now() - startTime;

    log.info(
      `[Gatekeeper] ${shouldExtract ? `EXTRACT [${categories.join(', ')}]` : 'SKIP'} (${durationMs}ms)`
    );

    return {
      shouldExtract,
      categories,
      confidence,
      reasoning: reasonings.join('; '),
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.warn(`[Gatekeeper] Failed (${durationMs}ms), failing closed (skip extraction):`, error);

    // Fail closed: if the gatekeeper errors (e.g. structured-output failure on
    // the intermediate model), skip extraction rather than dumping the whole
    // turn — including one-off task instructions — into memory. This matches
    // the gatekeeper's own "Im Zweifel ÜBERSPRINGE" rule.
    return {
      shouldExtract: false,
      categories: [],
      confidence: null,
      reasoning: 'Gatekeeper failed, skipping extraction',
      durationMs,
    };
  }
}
