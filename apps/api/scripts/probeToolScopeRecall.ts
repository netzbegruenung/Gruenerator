/**
 * Findet das ECHTE Planer-Modell den Rückweg, wenn das Tor danebenlag?
 *
 * Das ist die einzige Frage an `toolScope.ts`, die kein Einheitstest beantwortet:
 * die Werkzeuge für die eigenen Inhalte sind zurückgestellt, der Turn braucht
 * sie trotzdem, und das Muster hat ihn nicht erkannt. Erwartet wird ein Aufruf
 * von `meine_inhalte_laden` — nicht eine Antwort aus dem Nichts.
 *
 * Läuft gegen LOOP_PLANNER_PRIMARY (GreenPT), also genau das Modell, das im
 * Betrieb entscheidet.
 *
 * HÄRTER ALS DER BETRIEB, mit Absicht: ein einziger Schritt, und als System
 * steht nur `buildToolUsageBlock` — nicht die Persona, nicht `GATHER_SUFFIX`
 * mit seinem "Verlass dich NICHT auf dein eigenes Wissen — belege mit Tools".
 * Was hier durchfällt, fällt im Betrieb nicht zwingend durch; was hier hält,
 * hält erst recht.
 *
 * ── Stand 25.08.2026, nach zwei Runden Nachschärfen ──
 *
 * Acht Fälle: sieben erkennt inzwischen das Tor, einer bleibt offen —
 *
 *   "Wo liegt eigentlich die Rede von letzter Woche?"  → web_search
 *
 * Bewusst nicht behoben: "Rede" in die Wortliste zu nehmen würde die Gruppe auf
 * JEDEM Redenschreib-Turn öffnen, und das ist der häufigere Fall. Die zwei
 * Runden davor stehen in `MEINE_INHALTE_RE` — sie sind der Grund für die
 * Trennung in Produkt- und allgemeine Substantive und für den Selbstbezug.
 *
 *   GREENPT_API_KEY=… pnpm --filter @gruenerator/api exec tsx \
 *     scripts/probeToolScopeRecall.ts
 */
import { generateText } from 'ai';

import { LOOP_PLANNER_PRIMARY } from '../routes/chat/agents/autoPolicy.js';
import { buildChatToolCatalog } from '../routes/chat/agents/toolCatalog.js';
import { createSourceRegistry } from '../routes/chat/services/agenticLoop/sourceRegistry.js';
import { createToolScope } from '../routes/chat/services/agenticLoop/toolScope.js';
import { buildToolUsageBlock } from '../routes/chat/services/agenticLoop/toolUsageBlock.js';
import { getModel } from '../services/ai/providers.js';

import type { AgentConfig } from '../routes/chat/agents/types.js';
import type { SSEWriter } from '../routes/chat/services/sseHelpers.js';
import type { ChatGraphState } from '../agents/langgraph/ChatGraph/types.js';

const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const agentConfig = { identifier: 'gruenerator-universal' } as unknown as AgentConfig;

/** Turns, die eigene Inhalte MEINEN, aber ohne Possessiv auskommen — also genau
 *  die, an denen das Muster in toolScope.ts vorbeiläuft. */
const FAELLE = [
  // Die fünf aus dem ersten Lauf — zwei davon gingen daneben und haben das Tor
  // verändert (siehe MEINE_INHALTE_RE). Sie bleiben stehen als Rückfallprobe.
  'Zeig mir die Aufgabe zum Radentscheid',
  'Was habe ich letzte Woche zum Klimaentscheid geschrieben?',
  'Leg eine Karte auf das Klimaboard',
  'Welche Notizbücher gibt es?',
  'Öffne das Dokument Haushaltsrede',
  // Härtere Fälle ohne Possessiv und ohne Abruf-Verb: hier MUSS das Netz halten.
  'Wo liegt eigentlich die Rede von letzter Woche?',
  'Ich suche was, das ich neulich abgelegt hatte',
  'Steht da noch was Offenes für mich drin?',
];

for (const frage of FAELLE) {
  const state = {
    userLocale: 'de-DE',
    intent: 'agentic',
    messages: [],
    lastUserTextNoMentions: frage,
  } as unknown as ChatGraphState;

  const { tools } = buildChatToolCatalog({
    agentConfig,
    sourceRegistry: createSourceRegistry(),
    loop: { sse, state, req: {} as never, threadId: 't1' },
  });
  const scope = createToolScope({ toolNames: Object.keys(tools), userText: frage });
  Object.assign(tools, scope.loaderTools());
  const gezeigt = scope.activeTools();

  if (!gezeigt) {
    console.log(`  OFFEN   ${frage}  (das Tor hat den Turn erkannt — kein Rückweg nötig)`);
    continue;
  }

  const res = await generateText({
    model: getModel(LOOP_PLANNER_PRIMARY.provider, LOOP_PLANNER_PRIMARY.model),
    system: buildToolUsageBlock(8, false, false, gezeigt),
    messages: [{ role: 'user', content: frage }],
    tools,
    maxOutputTokens: 300,
    prepareStep: () => ({ activeTools: gezeigt as string[] }),
    stopWhen: () => true,
  });

  const gerufen = res.toolCalls.map((c) => c.toolName);
  const ok = gerufen.includes('meine_inhalte_laden');
  console.log(
    `  ${ok ? 'LADER  ' : 'FEHLT  '} ${frage}\n           → ${gerufen.length > 0 ? gerufen.join(', ') : `kein Tool-Aufruf: "${res.text.slice(0, 90)}"`}`
  );
}
process.exit(0);
