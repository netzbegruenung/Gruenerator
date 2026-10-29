/**
 * Wie viel eines Werkzeugergebnisses das Modell sieht — je Werkzeug.
 *
 * `wrapToolsForLoop` kürzt jedes Ergebnis über `DEFAULT_MAX_RESULT_CHARS` (6000).
 * Das ist ein Netz für Werkzeuge ohne eigene Begrenzung. Ein Werkzeug, das sein
 * Material selbst auf N Zeichen begrenzt (`read_document`: 20.000), hat damit
 * schon entschieden, wie viel das Modell lesen soll; das Netz darf es nicht ein
 * zweites Mal und dann ~26-fach kleiner kürzen. Gemessen 29.10.2026: ein
 * Dokument von 20.000 Zeichen kam mit 760 beim Modell an, ohne Hinweis.
 *
 * Die Zahlen stehen hier nicht doppelt: jede eigene Kappe wird aus dem
 * Werkzeug IMPORTIERT. Budget = Kappe x `ESCAPE_ALLOWANCE` + `METADATA_SLACK`:
 * gemessen wird das SERIALISIERTE Ergebnis, und JSON-Text (Konnektoren) wächst
 * beim Escapen von `"` und Umbrüchen (eingerückt 1,17x, einzeilig 1,25x).
 * Über `MAX_TOOL_RESULT_CHARS` geht keines (das erzwingt `wrapToolsForLoop`).
 *
 * Wer ein Werkzeug mit eigener Kappe über 6000 baut, trägt es hier ein —
 * `toolResultBudgets.vitest.ts` liest die Quelltexte und wird sonst rot.
 */
import { MAX_TOOL_RESULT_CHARS as USER_MCP_RESULT_CHARS } from '../../../../services/mcp/UserMCPClient.js';
import { READ_CAP } from '../../agents/documentLoopTools.js';
import { MODEL_RESULT_MAX_CHARS } from '../../agents/managedMcpCatalog.js';
import { ARTIFACT_READ_CHARS } from '../../agents/personalDataTools.js';

import { type ToolLabel } from './types.js';
import { MAX_TOOL_RESULT_CHARS } from './wrapTools.js';

/** Platz für das, was neben dem großen Feld im Ergebnis steht (IDs, Titel, Marker, Hinweise). */
export const METADATA_SLACK = 2_000;

/**
 * Aufschlag der Kappe fürs Escapen im serialisierten Ergebnis. Gemessen
 * 29.10.2026 an 25.000 Zeichen JSON-Text: eingerückt 29.265 serialisiert (1,17x),
 * einzeilig 1,25x. 1,2x plus `METADATA_SLACK` trägt beides ganz (25.000 einzeilig
 * → 31.250 < 32.000); die Decke in `wrapTools.ts` liegt deshalb bei 32.000.
 */
export const ESCAPE_ALLOWANCE = 1.2;

/** Das Budget für ein Werkzeug mit eigener Zeichenkappe. */
export const budgetForCap = (cap: number): number =>
  Math.min(Math.ceil(cap * ESCAPE_ALLOWANCE) + METADATA_SLACK, MAX_TOOL_RESULT_CHARS);

/**
 * Lesewerkzeuge ohne Zeichenkappe: ihre Grenze liegt in Zeilen/Spalten
 * (`read_sheet`: 50 × 20 Zellen), Folien, Abschnitten oder Ausgabetokens
 * (`summarize`: 1200 je Dokument), nicht in Zeichen. Wer sie ruft, will das
 * Ganze lesen — meist vor einer Änderung. 20.000 trägt eine Tabelle voller
 * Zeilen und mehrere Digests; was darüber liegt, kürzt das Netz ehrlich
 * (`_gekuerzt`), statt wie vorher schon ab 6000 auf ~750 je Feld.
 */
export const UNCAPPED_READ_BUDGET = 20_000;

/** Werkzeuge mit eigener Zeichenkappe — Name → Kappe (ohne Luft). */
export const OWN_CAP_TOOLS: Readonly<Record<string, number>> = {
  read_document: READ_CAP,
  read_artifact: ARTIFACT_READ_CHARS,
};

/** Lesewerkzeuge ohne Zeichenkappe, siehe {@link UNCAPPED_READ_BUDGET}. */
export const UNCAPPED_READ_TOOLS: readonly string[] = [
  'read_sheet',
  'read_presentation',
  'read_explainable',
  'read_sharepic',
  'summarize',
  // Reel-Transkript (`media`, action=transcript): bis 150 Segmente, ~12k Zeichen.
  'media',
  // Produktwissen: gemessen 29.10.2026 15.453 Zeichen (de-DE), 10.622 (de-AT); wächst mit
  // Agents, Glossar und verbundenen MCP-Servern.
  'product_knowledge',
];

/** Konnektor-Ergebnisse: die Kappe des Katalogs, der sie liefert. */
export const CONNECTOR_CAPS: Readonly<Record<'mcp' | 'managed', number>> = {
  mcp: USER_MCP_RESULT_CHARS,
  managed: MODEL_RESULT_MAX_CHARS,
};

const clamp = (n: number): number => Math.min(n, MAX_TOOL_RESULT_CHARS);

/**
 * Das Budget für ein Werkzeug, oder `null` (⇒ Standard 6000). MCP-Werkzeuge
 * haben dynamische Namen und erkennt man an ihrem Katalog-Etikett (`origin`).
 */
export function toolResultBudget(
  toolName: string,
  labels: ReadonlyMap<string, ToolLabel>
): number | null {
  const origin = labels.get(toolName)?.origin;
  if (origin) return budgetForCap(CONNECTOR_CAPS[origin.kind]);
  const own = OWN_CAP_TOOLS[toolName];
  if (own != null) return budgetForCap(own);
  if (UNCAPPED_READ_TOOLS.includes(toolName)) return clamp(UNCAPPED_READ_BUDGET);
  return null;
}
