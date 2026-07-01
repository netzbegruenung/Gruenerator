import { generateObject } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getIntermediateModel } from '../ai/providers.js';

import { MEMORY_CATEGORIES, CATEGORY_DESCRIPTIONS, type MemoryCategory } from './categories.js';

const log = createLogger('MemoryGatekeeper');

const LayerDecisionSchema = z.object({
  shouldExtract: z.boolean().describe('Ob diese Kategorie extrahiert werden soll'),
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
  reasoning: string;
  durationMs: number;
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

## Wichtig

- Im Zweifel ÜBERSPRINGE — lieber zu wenig als zu viel speichern
- Aufgaben-Anforderungen ≠ Präferenzen. "Schreib formell" für einen einzelnen Text ist KEINE Präferenz
- "Ich bevorzuge immer formelle Texte" IST eine Präferenz (Schlüsselwort: "immer", "grundsätzlich", "generell")
- Antworte IMMER mit dem strukturierten Schema`;

export async function shouldExtractMemories(
  userMessage: string,
  assistantMessage: string
): Promise<GatekeeperDecision> {
  const startTime = Date.now();

  try {
    const model = getIntermediateModel();

    const result = await generateObject({
      model,
      schema: GatekeeperResultSchema,
      system: GATEKEEPER_SYSTEM_PROMPT,
      prompt: `## Nutzer-Nachricht\n${userMessage}\n\n## Assistenten-Antwort\n${assistantMessage.slice(0, 1000)}`,
      maxOutputTokens: 500,
      temperature: 0,
      abortSignal: AbortSignal.timeout(8000),
    });

    const categories: MemoryCategory[] = [];
    const reasonings: string[] = [];

    for (const cat of MEMORY_CATEGORIES) {
      const decision = result.object[cat];
      if (decision.shouldExtract) {
        categories.push(cat);
        reasonings.push(`${cat}: ${decision.reasoning}`);
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
      reasoning: 'Gatekeeper failed, skipping extraction',
      durationMs,
    };
  }
}
