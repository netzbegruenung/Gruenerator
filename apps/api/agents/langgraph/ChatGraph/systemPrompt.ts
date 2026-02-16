/**
 * System Prompt Builder for Deep Agent
 *
 * Builds a rich system prompt that replaces the classifier node's role.
 * The prompt guides the LLM on when and how to use each tool,
 * includes citation instructions, memory/attachment context, and
 * German language guidance.
 */

import type { ThreadAttachment } from './types.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';

export interface SystemPromptContext {
  agentConfig: AgentConfig;
  enabledTools: Record<string, boolean>;
  memoryContext?: string | null;
  attachmentContext?: string | null;
  threadAttachments?: ThreadAttachment[];
  notebookContext?: string;
  notebookCollectionIds?: string[];
}

/**
 * Check if a tool key is effectively enabled for this agent+session combo.
 */
function isToolEnabled(
  key: string,
  agentWhitelist: string[] | undefined,
  frontendToggles: Record<string, boolean>
): boolean {
  if (agentWhitelist && !agentWhitelist.includes(key)) return false;
  if (frontendToggles[key] === false) return false;
  return true;
}

/**
 * Build the system prompt for the deep agent.
 * This replaces both the classifier and the respondNode's buildSystemMessage.
 */
export function buildDeepAgentSystemPrompt(ctx: SystemPromptContext): string {
  const sections: string[] = [];
  const agentWhitelist = ctx.agentConfig.enabledTools;

  // 1. Agent role (from agentConfig)
  sections.push(ctx.agentConfig.systemRole);

  // 2. Current date for temporal awareness
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  sections.push(`Heutiges Datum: ${today}`);

  // 3. Few-shot examples (if configured)
  const fewShotSection = buildFewShotSection(ctx.agentConfig);
  if (fewShotSection) {
    sections.push(fewShotSection);
  }

  // 4. Tool usage guidelines (filtered by agent whitelist + frontend toggles)
  sections.push(buildToolGuidelines(ctx.enabledTools, agentWhitelist));

  // 5. Citation instructions
  sections.push(CITATION_INSTRUCTIONS);

  // 6. Notebook context (scoped search instructions)
  if (ctx.notebookContext) {
    sections.push(ctx.notebookContext);
  }

  // 7. Memory context (if available)
  if (ctx.memoryContext) {
    sections.push(formatMemoryContext(ctx.memoryContext));
  }

  // 8. Attachment context (uploaded documents)
  if (ctx.attachmentContext) {
    sections.push(formatAttachmentContext(ctx.attachmentContext));
  }

  // 9. Thread attachments (from previous messages)
  if (ctx.threadAttachments?.length) {
    sections.push(formatThreadAttachments(ctx.threadAttachments));
  }

  // 10. Response rules
  sections.push(RESPONSE_RULES);

  return sections.join('\n\n');
}

function buildToolGuidelines(
  frontendToggles: Record<string, boolean>,
  agentWhitelist?: string[]
): string {
  const check = (key: string) => isToolEnabled(key, agentWhitelist, frontendToggles);

  const tools: string[] = [];

  if (check('search')) {
    tools.push(
      '- **search_documents**: Durchsuche Grüne Positionen, Programme und Dokumente.\n' +
        '  Nutze dieses Tool bei Fragen zu Partei-Positionen, Wahlprogrammen, Grundsatzprogramm.'
    );
  }

  if (check('web')) {
    tools.push(
      '- **web_search**: Suche aktuelle Informationen im Web.\n' +
        '  Nutze dieses Tool bei Fragen zu aktuellen Ereignissen, Nachrichten, externen Fakten.'
    );
  }

  if (check('research')) {
    tools.push(
      '- **research**: Führe eine strukturierte Recherche mit mehreren Quellen durch.\n' +
        '  Nutze dieses Tool für komplexe Fragen, Vergleiche, detaillierte Analysen.'
    );
  }

  if (check('examples')) {
    tools.push(
      '- **search_examples**: Suche echte, erfolgreiche Social-Media-Beispiele und Vorlagen.\n' +
        '  Nutze dieses Tool beim ERSTEN Social-Media-Auftrag als Stilvorlage. Bei Follow-ups im selben Gespräch (z.B. "erstelle einen Tweet dazu") sind bereits Beispiele vorhanden — nutze diese statt erneut zu suchen.'
    );
  }

  if (check('image')) {
    tools.push(
      '- **generate_image**: Generiere ein Bild mit KI.\n' +
        '  Nutze dieses Tool wenn der Nutzer ein Bild, Grafik oder Illustration erstellen möchte.'
    );
  }

  if (check('image_edit')) {
    tools.push(
      '- **edit_image**: Bearbeite ein angehängtes Bild mit grüner Stadtbegrünung.\n' +
        '  Nutze dieses Tool wenn der Nutzer ein Foto hochgeladen hat und es mit Bäumen, Radwegen, Grünflächen transformieren möchte.'
    );
  }

  if (check('scrape')) {
    tools.push(
      '- **scrape_url**: Lade den Inhalt einer URL.\n' +
        '  Nutze dieses Tool wenn der Nutzer eine URL teilt und den Inhalt analysieren möchte.'
    );
  }

  if (check('memory')) {
    tools.push(
      '- **recall_memory**: Rufe gespeicherte Informationen über den Nutzer ab.\n' +
        '  Nutze dieses Tool wenn der Nutzer auf frühere Gespräche verweist.'
    );
  }

  if (check('memory_save')) {
    tools.push(
      '- **save_memory**: Speichere wichtige Informationen über den Nutzer.\n' +
        '  Nutze dieses Tool wenn der Nutzer persönliche Infos teilt ("merke dir", "ich bin...").'
    );
  }

  if (check('self_review')) {
    tools.push(
      '- **self_review**: Bewerte einen Entwurf gegen Qualitätskriterien.\n' +
        '  Nutze dieses Tool NACH dem Erstellen eines Entwurfs. Wenn der Score unter 4 liegt, überarbeite und prüfe erneut.'
    );
  }

  if (check('draft_structured')) {
    tools.push(
      '- **draft_structured**: Erstelle einen strukturierten Entwurf mit allen Pflichtabschnitten.\n' +
        '  Nutze dieses Tool zum Erstellen des finalen Dokuments — es validiert Vollständigkeit und formatiert korrekt.'
    );
  }

  const guidelines: string[] = [
    '- **VOR JEDEM TOOL-AUFRUF**: Prüfe, ob die nötige Information bereits im Gesprächsverlauf vorhanden ist. Bei Follow-up-Nachrichten wie "erstelle einen Tweet dazu", "fasse das zusammen", "kürze das" — nutze den vorhandenen Kontext, OHNE erneut zu suchen.',
    '- Nur erneut suchen wenn: (a) die Frage ein neues Thema betrifft, (b) der Nutzer explizit neue Information anfordert ("aktuelle", "suche nach"), oder (c) die bisherigen Ergebnisse nachweislich unvollständig sind.',
    '- Bei einfachen Begrüßungen, Dank oder rein kreativen Aufgaben: KEIN Tool verwenden, direkt antworten.',
  ];

  if (check('search')) {
    guidelines.push(
      '- Bei Fragen zu Grünen Positionen/Programmen: Zuerst search_documents verwenden.'
    );
  }
  if (check('web')) {
    guidelines.push(
      '- Bei Fragen zu aktuellen Ereignissen: web_search verwenden.',
      '- Bei zeitbezogenen Fragen ("heute", "letzte Woche", "aktuell"): Setze den time_range Parameter bei web_search (day/week/month/year).'
    );
  }
  if (check('research')) {
    guidelines.push('- Bei komplexen Fragen die mehrere Quellen brauchen: research verwenden.');
  }
  if (check('search') && check('web')) {
    guidelines.push(
      '- Bei Vergleichsfragen: Mehrere Tools kombinieren (z.B. search_documents + web_search).'
    );
  }
  guidelines.push(
    '- Wenn die ersten Suchergebnisse nicht ausreichen und der Nutzer explizit mehr braucht: Erneut suchen mit angepasster Query.'
  );
  if (check('scrape')) {
    guidelines.push('- URLs im Nutzer-Text: scrape_url verwenden um den Inhalt zu lesen.');
  }
  if (check('memory')) {
    guidelines.push(
      '- Erinnerungen: recall_memory wenn Nutzer Kontext aus früheren Gesprächen erwartet.'
    );
  }
  if (check('image_edit')) {
    guidelines.push(
      '- Bildbearbeitung: edit_image nur wenn ein Bild angehängt ist und grüne Transformation gewünscht wird.'
    );
  }

  // Self-review workflow guidance
  if (check('self_review')) {
    guidelines.push(
      '- **QUALITÄTSPRÜFUNG**: Nachdem du einen Entwurf erstellt hast, nutze IMMER self_review um die Qualität zu prüfen. Wenn der Score unter 4 liegt, überarbeite den Entwurf basierend auf den Vorschlägen und prüfe erneut.'
    );
  }

  // Draft structured workflow guidance
  if (check('draft_structured')) {
    guidelines.push(
      '- **STRUKTURIERTES ERSTELLEN**: Nutze draft_structured zum Erstellen des Dokuments. Es stellt sicher, dass alle Pflichtabschnitte vorhanden sind.'
    );
  }

  let result = `## VERFÜGBARE WERKZEUGE

${tools.join('\n\n')}

### WERKZEUG-NUTZUNGS-RICHTLINIEN

${guidelines.join('\n')}

### PARALLELE WERKZEUG-NUTZUNG

Du kannst mehrere Werkzeuge gleichzeitig aufrufen. Nutze das bei Fragen die verschiedene Quellentypen brauchen:`;

  if (check('search') && check('web')) {
    result += `
- Bei Vergleichsfragen zu Grünen Positionen und aktuellen Nachrichten: **search_documents UND web_search gleichzeitig** aufrufen.
- Bei Fragen die sowohl Partei-Dokumente als auch Webkontext brauchen: Beide Tools parallel starten.`;
  }

  result += `
- Bei einfachen Faktenfragen: Ein einzelner Tool-Aufruf reicht.`;

  if (check('research')) {
    result += `
- Für tiefe, mehrstufige Recherchen mit Synthese: **research** Tool verwenden (kombiniert intern mehrere Quellen).`;
  }

  if (check('web')) {
    result += `

### ERGEBNIS-ANZAHL (max_results bei web_search)

- Einfache Faktenfragen ("Wann ist der nächste Parteitag?"): max_results: 3
- Standardfragen: max_results weglassen (Standard: 5)
- Komplexe Recherchen oder Vergleichsfragen: max_results: 8-10`;
  }

  return result;
}

/**
 * Build the few-shot examples section for the system prompt.
 */
function buildFewShotSection(agentConfig: AgentConfig): string | null {
  if (!agentConfig.fewShotExamples?.length) return null;

  const examples = agentConfig.fewShotExamples
    .map((ex, i) => {
      const parts = [
        `### Beispiel ${i + 1}`,
        `**Anfrage:** ${ex.input}`,
        `**Antwort:**\n${ex.output}`,
      ];
      if (ex.reasoning) {
        parts.splice(2, 0, `**Vorgehensweise:** ${ex.reasoning}`);
      }
      return parts.join('\n');
    })
    .join('\n\n');

  return `## BEISPIELE FÜR IDEALE ANTWORTEN

Die folgenden Beispiele zeigen das erwartete Qualitätsniveau und Format:

${examples}`;
}

const CITATION_INSTRUCTIONS = `## QUELLEN-VERWEISE

Wenn du Informationen aus Tool-Ergebnissen verwendest:
1. Verwende Inline-Quellenverweise [1], [2], etc. direkt nach Aussagen
2. Nummeriere die Quellen in der Reihenfolge ihres Erscheinens
3. Setze die Referenz direkt nach der Aussage: "Die Grünen fordern ein Tempolimit [1]."
4. Erfinde keine Quellen — nur Verweise auf tatsächliche Tool-Ergebnisse verwenden
5. Zitiere 1-2 Quellen pro Kernaussage — nicht jeder Satz braucht einen Verweis
6. Bevorzuge die relevantesten Quellen statt alle aufzulisten`;

function formatMemoryContext(memoryContext: string): string {
  return `## ERINNERUNGEN AN DIESEN NUTZER

Du hast folgende Informationen über diesen Nutzer aus früheren Gesprächen:

${memoryContext}

---
Berücksichtige diese Informationen bei deiner Antwort, aber erwähne sie nur wenn relevant.`;
}

function formatAttachmentContext(attachmentContext: string): string {
  // Truncate per-document to prevent context explosion
  const MAX_CHARS = 20000;
  const limited =
    attachmentContext.length > MAX_CHARS
      ? attachmentContext.slice(0, MAX_CHARS) + '\n\n[...gekürzt]'
      : attachmentContext;

  return `## ANGEHÄNGTE DOKUMENTE

Der Nutzer hat Dokumente angehängt. Hier ist der extrahierte Text:

${limited}

---
Beantworte Fragen zu den Dokumenten basierend auf deren Inhalt.`;
}

function formatThreadAttachments(attachments: ThreadAttachment[]): string {
  const docs = attachments
    .filter((a) => !a.isImage && a.summary)
    .map((a, i) => `${i + 1}. **${a.name}**: ${a.summary}`)
    .join('\n');

  if (!docs) return '';

  return `## FRÜHERE DOKUMENTE IN DIESEM GESPRÄCH

${docs}

---
Nutze diese Dokumentinhalte wenn der Nutzer sich darauf bezieht.`;
}

const RESPONSE_RULES = `## ANTWORT-REGELN

1. Beantworte NUR was gefragt wurde — keine ungebetene Zusatzinfo
2. Passe die Antwortlänge an die Komplexität an:
   - Einfache Fragen: 1-2 kurze Absätze
   - Mittlere Fragen: 2-4 Absätze mit Quellenverweisen
   - Komplexe Recherchen: Strukturiert mit Überschriften, bis zu 6 Absätze
3. Antworte immer auf Deutsch, es sei denn der Nutzer fragt explizit nach einer anderen Sprache
4. Erfinde keine Fakten oder Quellennamen
5. Wenn der Gesprächsverlauf bereits genug Kontext enthält, antworte direkt OHNE Tool-Aufruf
6. Erstelle KEINE Quellenliste am Ende — Quellen werden automatisch angezeigt`;
