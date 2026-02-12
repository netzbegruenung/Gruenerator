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
}

/**
 * Build the system prompt for the deep agent.
 * This replaces both the classifier and the respondNode's buildSystemMessage.
 */
export function buildDeepAgentSystemPrompt(ctx: SystemPromptContext): string {
  const sections: string[] = [];

  // 1. Agent role (from agentConfig)
  sections.push(ctx.agentConfig.systemRole);

  // 2. Tool usage guidelines
  sections.push(buildToolGuidelines(ctx.enabledTools));

  // 3. Citation instructions
  sections.push(CITATION_INSTRUCTIONS);

  // 4. Memory context (if available)
  if (ctx.memoryContext) {
    sections.push(formatMemoryContext(ctx.memoryContext));
  }

  // 5. Attachment context (uploaded documents)
  if (ctx.attachmentContext) {
    sections.push(formatAttachmentContext(ctx.attachmentContext));
  }

  // 6. Thread attachments (from previous messages)
  if (ctx.threadAttachments?.length) {
    sections.push(formatThreadAttachments(ctx.threadAttachments));
  }

  // 7. Response rules
  sections.push(RESPONSE_RULES);

  return sections.join('\n\n');
}

function buildToolGuidelines(enabledTools: Record<string, boolean>): string {
  const tools: string[] = [];

  if (enabledTools.search !== false) {
    tools.push(
      '- **search_documents**: Durchsuche Grüne Positionen, Programme und Dokumente.\n' +
        '  Nutze dieses Tool bei Fragen zu Partei-Positionen, Wahlprogrammen, Grundsatzprogramm.'
    );
  }

  if (enabledTools.web !== false) {
    tools.push(
      '- **web_search**: Suche aktuelle Informationen im Web.\n' +
        '  Nutze dieses Tool bei Fragen zu aktuellen Ereignissen, Nachrichten, externen Fakten.'
    );
  }

  if (enabledTools.research !== false) {
    tools.push(
      '- **research**: Führe eine strukturierte Recherche mit mehreren Quellen durch.\n' +
        '  Nutze dieses Tool für komplexe Fragen, Vergleiche, detaillierte Analysen.'
    );
  }

  if (enabledTools.examples !== false) {
    tools.push(
      '- **search_examples**: Suche Social-Media-Beispiele und Vorlagen.\n' +
        '  Nutze dieses Tool wenn nach Beispiel-Posts oder Vorlagen gefragt wird.'
    );
  }

  if (enabledTools.image !== false) {
    tools.push(
      '- **generate_image**: Generiere ein Bild mit KI.\n' +
        '  Nutze dieses Tool wenn der Nutzer ein Bild, Grafik oder Illustration erstellen möchte.'
    );
  }

  tools.push(
    '- **scrape_url**: Lade den Inhalt einer URL.\n' +
      '  Nutze dieses Tool wenn der Nutzer eine URL teilt und den Inhalt analysieren möchte.'
  );

  tools.push(
    '- **recall_memory**: Rufe gespeicherte Informationen über den Nutzer ab.\n' +
      '  Nutze dieses Tool wenn der Nutzer auf frühere Gespräche verweist.'
  );

  tools.push(
    '- **save_memory**: Speichere wichtige Informationen über den Nutzer.\n' +
      '  Nutze dieses Tool wenn der Nutzer persönliche Infos teilt ("merke dir", "ich bin...").'
  );

  return `## VERFÜGBARE WERKZEUGE

${tools.join('\n\n')}

### WERKZEUG-NUTZUNGS-RICHTLINIEN

- Bei einfachen Begrüßungen, Dank oder rein kreativen Aufgaben: KEIN Tool verwenden, direkt antworten.
- Bei Fragen zu Grünen Positionen/Programmen: Zuerst search_documents verwenden.
- Bei Fragen zu aktuellen Ereignissen: web_search verwenden.
- Bei komplexen Fragen die mehrere Quellen brauchen: research verwenden.
- Bei Vergleichsfragen: Mehrere Tools kombinieren (z.B. search_documents + web_search).
- Wenn die ersten Suchergebnisse nicht ausreichen: Erneut suchen mit angepasster Query.
- URLs im Nutzer-Text: scrape_url verwenden um den Inhalt zu lesen.
- Erinnerungen: recall_memory wenn Nutzer Kontext aus früheren Gesprächen erwartet.`;
}

const CITATION_INSTRUCTIONS = `## QUELLEN-VERWEISE

Wenn du Informationen aus Tool-Ergebnissen verwendest:
1. Verwende Inline-Quellenverweise [1], [2], etc. direkt nach Aussagen
2. Nummeriere die Quellen in der Reihenfolge ihres Erscheinens
3. Setze die Referenz direkt nach der Aussage: "Die Grünen fordern ein Tempolimit [1]."
4. Erfinde keine Quellen — nur Verweise auf tatsächliche Tool-Ergebnisse verwenden`;

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
2. Kurze, präzise Antworten (max 3-4 Absätze für einfache Fragen)
3. Antworte immer auf Deutsch, es sei denn der Nutzer fragt explizit nach einer anderen Sprache
4. Erfinde keine Fakten oder Quellennamen
5. Wenn du unsicher bist ob ein Tool nötig ist, antworte lieber direkt`;
