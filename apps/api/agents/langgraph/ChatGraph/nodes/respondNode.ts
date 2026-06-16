/**
 * Respond Node
 *
 * Prepares the response context with search results and system instructions.
 * Does NOT stream directly - streaming is handled by the controller using AI SDK v6.
 *
 * This separation keeps the graph transport-agnostic and testable.
 */

import { SKILLS } from '@gruenerator/shared/agents';

import { getPrAgentInsightFragment } from '../../../../services/agents/prAgentInsightService.js';
import { localizePlaceholders } from '../../../../services/localization/index.js';
import { type Locale } from '../../../../services/localization/types.js';
import { createLogger } from '../../../../utils/logger.js';
import { formatGermanDate } from '../../../../utils/stringUtils.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import { type AnchorDescriptor, getActiveAnchors } from './anchorContext.js';
import { buildCitableSources, type CitableSource } from './citableSources.js';

import type {
  ChatGraphState,
  DocumentSource,
  ResearchToolResult,
  SearchResult,
  ThreadAttachment,
} from '../types.js';

const log = createLogger('ChatGraph:Respond');

/**
 * Attachment context limits.
 * These prevent large documents from consuming the entire token budget.
 */
const ATTACHMENT_LIMITS = {
  PER_DOCUMENT_CHARS: 8000, // ~2000 tokens per document
  TOTAL_BUDGET_CHARS: 20000, // ~5000 tokens total for all attachments
};

/**
 * Smart document truncation.
 * Keeps the introduction (60%) and conclusion (40%) for better context.
 * Documents typically have important info at the start and end.
 */
export function truncateDocument(
  text: string,
  limit: number = ATTACHMENT_LIMITS.PER_DOCUMENT_CHARS
): string {
  if (!text || text.length <= limit) return text;

  // Smart truncation: keep intro (60%) + conclusion (40%)
  const introLength = Math.floor(limit * 0.6);
  const outroLength = limit - introLength - 60; // 60 chars for marker

  const intro = text.slice(0, introLength);
  const outro = text.slice(-outroLength);

  const removedChars = text.length - limit;
  return `${intro}\n\n[...${removedChars.toLocaleString('de-DE')} Zeichen gekürzt...]\n\n${outro}`;
}

/**
 * Apply total budget limit to already-formatted attachment context.
 * Parses individual documents and truncates as needed.
 */
function limitAttachmentContext(
  context: string,
  budget: number = ATTACHMENT_LIMITS.TOTAL_BUDGET_CHARS
): string {
  if (!context || context.length <= budget) return context;

  // Parse documents by the ### header pattern
  const docPattern = /^### .+$/gm;
  const docMatches = [...context.matchAll(docPattern)];

  if (docMatches.length === 0) {
    // No structured documents found, just truncate the whole thing
    return truncateDocument(context, budget);
  }

  // Split into individual documents
  const documents: { header: string; content: string }[] = [];
  for (let i = 0; i < docMatches.length; i++) {
    const match = docMatches[i];
    if (!match) continue;
    const startIdx = match.index!;
    const nextMatch = docMatches[i + 1];
    const endIdx = nextMatch ? nextMatch.index! : context.length;
    const fullDoc = context.slice(startIdx, endIdx);
    const header = match[0];
    const content = fullDoc.slice(header.length).trim();
    documents.push({ header, content });
  }

  // Apply per-document limit and total budget
  let totalChars = 0;
  const limited: string[] = [];
  let omittedCount = 0;

  for (const doc of documents) {
    if (totalChars >= budget) {
      omittedCount++;
      continue;
    }

    const remaining = budget - totalChars;
    const perDocLimit = Math.min(ATTACHMENT_LIMITS.PER_DOCUMENT_CHARS, remaining);
    const truncated = truncateDocument(doc.content, perDocLimit);

    limited.push(`${doc.header}\n${truncated}`);
    totalChars += truncated.length + doc.header.length + 1;
  }

  if (omittedCount > 0) {
    limited.push(
      `\n[${omittedCount} weitere(s) Dokument(e) nicht einbezogen wegen Kontextbeschränkung]`
    );
    log.info(`[Attachment] Omitted ${omittedCount} documents due to context budget`);
  }

  const result = limited.join('\n\n---\n\n');

  if (result.length < context.length) {
    log.info(`[Attachment] Truncated context: ${context.length} → ${result.length} chars`);
  }

  return result;
}

/**
 * Total character budget for search context (~1000 tokens).
 * Distributed proportionally by relevance score across top results.
 * Increases to 6000 when crawled full content is available.
 */
const SEARCH_CONTEXT_BUDGET = 4000;
const SEARCH_CONTEXT_BUDGET_CRAWLED = 6000;
const SEARCH_CONTEXT_BUDGET_DOCUMENTCHAT = 8000;
const MAX_SEARCH_RESULTS = 8;

const FINDINGS_CLEANING_PROMPT = `Du bist ein Forschungsassistent. Fasse die folgenden Suchergebnisse zu einem kohärenten Überblick zusammen, fokussiert auf den Recherche-Auftrag.

Regeln:
- Strukturierte Zusammenfassung (max 1500 Zeichen)
- Verweise auf die Quellen beibehalten (Titel in **Fettschrift**)
- Wichtige Fakten, Zahlen und Positionen hervorheben
- Redundante Informationen zusammenfassen
- Auf Deutsch antworten

Antworte NUR mit der Zusammenfassung, ohne Einleitung.`;

const MAX_CLEANED_FINDINGS_LENGTH = 2000;

/**
 * Clean and summarize search results using Mistral-small.
 * Returns a coherent findings summary or null on failure.
 */
async function cleanFindings(state: ChatGraphState): Promise<string | null> {
  const { searchResults, researchBrief, searchQuery, aiWorkerPool } = state;

  const topResults = searchResults.slice(0, 6);
  const resultsText = topResults
    .map((r, i) => `[${i + 1}] **${r.title}**\n${r.content.slice(0, 500)}`)
    .join('\n\n');

  const brief = researchBrief || searchQuery || '';

  const response = await aiWorkerPool.processRequest(
    {
      type: 'chat_clean_findings',
      provider: INTERMEDIATE_MODEL.provider,
      systemPrompt: FINDINGS_CLEANING_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Recherche-Auftrag: ${brief}\n\nSuchergebnisse:\n${resultsText}\n\nErstelle eine strukturierte Zusammenfassung.`,
        },
      ],
      options: {
        model: INTERMEDIATE_MODEL.model,
        max_tokens: 600,
        temperature: 0.2,
      },
    },
    null
  );

  const cleaned = (response.content || '').trim();
  if (!cleaned) return null;

  return cleaned.slice(0, MAX_CLEANED_FINDINGS_LENGTH);
}

/**
 * Format search results as context for the response generation.
 * Uses budget-based allocation weighted by relevance score.
 * Results with fullContent (crawled) get 2x weight in budget allocation.
 *
 * For complex research queries with a researchBrief, uses LLM cleaning
 * to produce a coherent summary instead of raw truncated snippets.
 */
export function formatResearchWrapperContext(meta: ResearchToolResult): string {
  // Wrapper-mode prompt: the synthesized answer is rendered separately as the
  // Recherche-Karte (researchMeta tool result). The agent must NOT re-synthesize
  // from chunks — that produces drift (small models drop confidence and emit
  // "keine Informationen" while the card shows a confident answer). Treat this
  // as a thin conversational wrapper around the artifact.
  const synthesisPreview = meta.answer.length > 800 ? `${meta.answer.slice(0, 800)}…` : meta.answer;
  const followUpHint =
    meta.followUpQuestions.length > 0
      ? 'nimm ggf. eine der Folge-Fragen aus der Karte auf, oder '
      : '';
  return `

## RECHERCHE ABGESCHLOSSEN — DU BIST WRAPPER, NICHT ANTWORTGEBER

Die vollständige Recherche-Antwort und alle ${meta.citations.length} Quellen werden dem*der Nutzer*in als separate Recherche-Karte oberhalb deiner Antwort angezeigt.

WICHTIG:
1. Wiederhole NICHT die Recherche-Antwort — sie ist bereits sichtbar.
2. Verweise konversationell auf die Karte (maximal 2 Sätze).
3. Sage NIE "keine Informationen", "keine Treffer", "konnte nichts finden" o.ä. — die Recherche WAR erfolgreich (Konfidenz: ${meta.confidence}, ${meta.citations.length} Quellen).
4. Wenn passend: ${followUpHint}biete eine weiterführende Frage an.

Synthese (NUR zur Orientierung — wiederhole sie nicht):
${synthesisPreview}`;
}

export async function formatSearchContext(
  state: ChatGraphState,
  includeSourceUrls = false
): Promise<string> {
  // Research mode with usable synthesis: emit a wrapper-mode block so the
  // model writes a thin conversational reference, not a re-synthesis from
  // raw chunks. The tool artifact (researchMeta) is the single source of
  // truth for the answer; the chat reply just frames it.
  if (
    state.intent === 'research' &&
    state.researchMeta?.answer &&
    state.researchMeta.confidence !== 'low'
  ) {
    log.info(
      `[Respond] Wrapper-mode (intent=research, confidence=${state.researchMeta.confidence}, citations=${state.researchMeta.citations.length}, answer_len=${state.researchMeta.answer.length})`
    );
    return formatResearchWrapperContext(state.researchMeta);
  }

  // Log why wrapper-mode did NOT apply so regressions are easy to spot in
  // production logs (e.g. confidence dropping to 'low', meta missing,
  // intent mis-classified).
  if (state.intent === 'research') {
    log.info(
      `[Respond] Wrapper-mode skipped for research intent: hasMeta=${!!state.researchMeta}, hasAnswer=${!!state.researchMeta?.answer}, confidence=${state.researchMeta?.confidence ?? 'none'} — falling through to chunk-based context`
    );
  }

  if (state.searchResults.length === 0) {
    return '';
  }

  // Complex research: try LLM-cleaned findings
  if (state.complexity === 'complex' && state.researchBrief && state.aiWorkerPool) {
    try {
      const cleaned = await cleanFindings(state);
      if (cleaned) {
        log.info(`[Respond] Using cleaned findings (${cleaned.length} chars)`);
        return `\n\n## RECHERCHE-ERGEBNISSE\n\n${cleaned}`;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`[Respond] Findings cleaning failed, falling back to budget truncation: ${errMsg}`);
    }
  }

  // Default: budget-based truncation
  // Notebook-scoped searches get more results and higher budget for deeper answers
  // Includes agents bound to a notebook via `defaultNotebookId` so they get the
  // same deeper context budget as an explicitly selected notebook.
  const isNotebookScoped =
    (state.notebookCollectionIds?.length ?? 0) > 0 ||
    (state.defaultNotebookCollectionIds?.length ?? 0) > 0 ||
    (state.notebookDocumentIds?.length ?? 0) > 0;
  const maxResults = isNotebookScoped ? 12 : MAX_SEARCH_RESULTS;
  // Group chunks → sources so each `[N]` is one source. Dedup means a wolke
  // file with 5 chunks renders as a single `[1]` block (multiple excerpts
  // concatenated), not 5 separate entries the model would over-cite.
  const sources = buildCitableSources(state.searchResults.slice(0, maxResults));

  // Document chat gets the highest budget for focused Q&A
  const isDocumentChat = state.documentChatIds?.length > 0;
  // Detect if any source has crawled content (longer than typical snippets)
  const hasCrawledContent = sources.some((s) => (s.representative.content?.length ?? 0) > 500);
  // Multi-source results get the higher budget (mixed doc + web content)
  const isMultiSource = (state.searchSources?.length || 0) > 1;
  const budget = isDocumentChat
    ? SEARCH_CONTEXT_BUDGET_DOCUMENTCHAT
    : isNotebookScoped
      ? SEARCH_CONTEXT_BUDGET_DOCUMENTCHAT
      : hasCrawledContent || isMultiSource
        ? SEARCH_CONTEXT_BUDGET_CRAWLED
        : SEARCH_CONTEXT_BUDGET;

  // Crawled sources get 2x weight in budget allocation
  const weightedRelevance = sources.map((s) => {
    const base = s.representative.relevance || 0.5;
    const crawlBoost = (s.representative.content?.length ?? 0) > 500 ? 2 : 1;
    return base * crawlBoost;
  });
  const totalWeightedRelevance = weightedRelevance.reduce((sum, w) => sum + w, 0) || 1;

  const resultsText = sources
    .map((s, i) => {
      const charBudget = Math.max(
        200,
        Math.floor(((weightedRelevance[i] ?? 0) / totalWeightedRelevance) * budget)
      );
      const body = formatSourceChunks(s, charBudget);
      // When the agent writes inline links (e.g. ready-to-send emails), expose
      // the source URL to the model so it can cite the concrete article instead
      // of falling back to a hardcoded homepage. Normal chat omits it and uses
      // the clickable [N] cards instead.
      const urlPart = includeSourceUrls && s.url ? `\nQuelle-URL: ${s.url}` : '';
      return `[${i + 1}] **${s.title}**${urlPart}\n${body}`.trim();
    })
    .join('\n\n');

  return `\n\n## SUCHERGEBNISSE\n\n${resultsText}\n\n---\n[Ende der Suchergebnisse. Insgesamt ${sources.length} Quelle(n) verfügbar.]`;
}

/**
 * Render the chunks of a single CitableSource into a prompt block. When a
 * source has multiple chunks (e.g. several excerpts from one wolke file or
 * notebook doc), each chunk gets an `--- Auszug N:` separator so the model
 * sees distinct evidence under the same `[N]`. Char budget is split evenly
 * across the chunks, with a per-chunk floor.
 */
function formatSourceChunks(source: CitableSource, totalCharBudget: number): string {
  const chunks = source.chunks.slice(0, 4); // bounded — popover still has the full set
  if (chunks.length === 1) {
    const text = chunks[0].content ?? '';
    return text.length > totalCharBudget ? truncateDocument(text, totalCharBudget) : text;
  }
  const perChunkBudget = Math.max(150, Math.floor(totalCharBudget / chunks.length));
  return chunks
    .map((c, i) => {
      const text = c.content ?? '';
      const truncated =
        text.length > perChunkBudget ? truncateDocument(text, perChunkBudget) : text;
      return `--- Auszug ${i + 1}:\n${truncated}`;
    })
    .join('\n\n');
}

/**
 * Format per-document context blocks for multi-doc chat.
 * Each DocumentSource gets its own labeled section with its top-K reranked
 * chunks, so the model sees evidence grouped by source instead of one merged
 * pool. Per-doc budget = total / N to keep within context window.
 *
 * Returns empty string when there are <2 doc sources or no per-source
 * results — the existing single-pool SUCHERGEBNISSE block handles those.
 */
function formatPerSourceContext(state: ChatGraphState): string {
  const docSources: DocumentSource[] = state.documentSources ?? [];
  const perSource: Record<string, SearchResult[]> = state.perSourceResults ?? {};

  if (docSources.length < 2) return '';

  // Flatten perSourceResults across all DocumentSources, then re-group via the
  // canonical CitableSource view. This makes per-doc `[N]` markers in the
  // model output align with the same `[N]` ids the SUCHERGEBNISSE block uses
  // and with the Citation array — they all derive from one ordering now.
  const flat: SearchResult[] = [];
  for (const ds of docSources) {
    const rows = perSource[ds.id];
    if (!rows || rows.length === 0) continue;
    flat.push(...rows);
  }
  if (flat.length === 0) return '';

  const sources = buildCitableSources(flat);
  if (sources.length < 2) return '';

  const TOTAL_BUDGET = 8000;
  const perDocBudget = Math.floor(TOTAL_BUDGET / sources.length);

  const blocks = sources.map((s) => {
    const chunks = s.chunks.slice(0, 6);
    const inner = chunks
      .map((r, i) => {
        const charBudget = Math.max(150, Math.floor(perDocBudget / Math.max(1, chunks.length)));
        const content =
          r.content.length > charBudget ? truncateDocument(r.content, charBudget) : r.content;
        return `(${s.id}.${i + 1}) **${r.title}**\n${content}`.trim();
      })
      .join('\n\n');
    return `### Dokument ${s.id}: ${s.title}\n\n${inner}`;
  });

  return `\n\n## QUELLEN PRO DOKUMENT\n\n${blocks.join('\n\n')}\n\n---\n[Ende der dokumentbezogenen Quellen. Halte die Aussagen je Dokument auseinander.]`;
}

/**
 * Format the open document (docs-editor surface) as the primary conversation
 * context. Distinct framing from `formatAttachmentContext` — this IS the
 * document the user is talking about, not a side-loaded reference.
 */
function formatCurrentDocument(state: ChatGraphState): string {
  if (!state.currentDocument) {
    return '';
  }
  const { title, markdown, selectionText } = state.currentDocument;
  const limitedMarkdown = limitAttachmentContext(markdown);
  const titleLine = title ? `Titel: ${title}\n\n` : '';
  const selection = selectionText
    ? `\n\n### AUSGEWÄHLTER TEXT\n\n${selectionText.slice(0, 4000)}`
    : '';
  return `

## AKTUELLES DOKUMENT

${titleLine}${limitedMarkdown}${selection}`;
}

/**
 * Format attachment context for the response generation.
 * Applies truncation limits to prevent context explosion with large documents.
 */
function formatAttachmentContext(state: ChatGraphState): string {
  if (!state.attachmentContext) {
    return '';
  }

  // Apply truncation limits to prevent context explosion
  const limitedContext = limitAttachmentContext(state.attachmentContext);

  return `

## ANGEHÄNGTE DOKUMENTE

${limitedContext}`;
}

/**
 * Format image attachment context for the system message.
 * Instructs the model to acknowledge and describe the attached images.
 */
function formatImageContext(state: ChatGraphState): string {
  const sections: string[] = [];

  if (state.imageAttachments && state.imageAttachments.length > 0) {
    const count = state.imageAttachments.length;
    const names = state.imageAttachments.map((img) => img.name).join(', ');
    sections.push(`

## ANGEHÄNGTE BILDER

Der*die Nutzer*in hat ${count} Bild${count > 1 ? 'er' : ''} angehängt (${names}). Die Bilder sind in der Nachricht sichtbar.`);
  }

  // Vision-grounded before/after descriptions populated by imageEditNode after a
  // successful FLUX edit. Lets respondNode narrate the actual change instead of
  // hallucinating ("I can't edit images") when the model isn't itself vision-capable.
  const editDescriptions = state.imageEditDescriptions;
  if (editDescriptions && (editDescriptions.original || editDescriptions.edited)) {
    const before = editDescriptions.original ?? '(keine Beschreibung verfügbar)';
    const after = editDescriptions.edited ?? '(keine Beschreibung verfügbar)';
    sections.push(`

## BILDVERGLEICH (vom Vision-Modell beschrieben)

- Originalbild: ${before}
- Bearbeitetes Bild: ${after}`);
  }

  return sections.join('');
}

/**
 * Format thread attachments (from previous messages) as context.
 * Only includes document summaries, not full text (for token efficiency).
 */
function formatThreadAttachmentsContext(attachments: ThreadAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return '';
  }

  const docs = attachments
    .filter((a) => !a.isImage && a.summary)
    .map((a, i) => `${i + 1}. **${a.name}**: ${a.summary}`)
    .join('\n');

  if (!docs) {
    return '';
  }

  return `

## FRÜHERE DOKUMENTE IN DIESEM GESPRÄCH

${docs}

---
Nutze diese Dokumentinhalte wenn der Nutzer sich darauf bezieht (z.B. "das PDF", "das Dokument", etc.).`;
}

/**
 * Format summary context from document summarization.
 * Placed between attachments and search results in the system prompt.
 */
function formatSummaryContext(summaryContext: string | null): string {
  if (!summaryContext) return '';

  return `

## DOKUMENTENZUSAMMENFASSUNG

${summaryContext}

---
Nutze diese Zusammenfassung als Grundlage für deine Antwort.`;
}

/**
 * Format board context (from @board mentions).
 * Injects the board's columns and cards as structured text.
 */
function formatBoardContext(boardContext: string | null): string {
  if (!boardContext) return '';

  return `

## BOARD-KONTEXT

${boardContext}`;
}

/**
 * Format collaborative document context (from @doc mentions).
 * Injects the document's text content for AI reference.
 */
function formatDocumentMentionContext(documentMentionContext: string | null): string {
  if (!documentMentionContext) return '';

  return `

## REFERENZIERTE DOKUMENTE

${documentMentionContext}`;
}

/**
 * Format memory context from mem0 cross-thread memories.
 * These are persistent facts and preferences about the user,
 * grouped by category (identity, preference, context, etc.).
 */
function formatMemoryContext(memoryContext: string | null): string {
  if (!memoryContext || memoryContext.trim() === '') {
    return '';
  }

  return `

## KONTEXT ZUM NUTZER (KEINE QUELLEN – NICHT ZITIEREN)

Folgende Informationen stammen aus früheren Gesprächen mit diesem Nutzer:

${memoryContext}

---
Berücksichtige diese nur wenn relevant für die aktuelle Frage. Verwende KEINE Quellenverweise [N] für diese Informationen – sie sind keine Suchergebnisse.`;
}

/**
 * Build locale context for the system prompt.
 * Provides country-specific awareness so the AI interprets references correctly
 * (e.g. "Hauptstadt" = Wien for Austrian users, "Parlament" = Nationalrat).
 */
function formatLocaleContext(userLocale: string | undefined): string {
  if (userLocale === 'de-AT') {
    return `

## LÄNDERKONTEXT: ÖSTERREICH

Der Nutzer ist in Österreich. Beachte:
- "Hauptstadt" = Wien, "Parlament" = Nationalrat, "Bundesregierung" = österreichische Bundesregierung
- "Die Grünen" bezieht sich auf Die Grünen – Die Grüne Alternative (Österreich), nicht auf Bündnis 90/Die Grünen (Deutschland)
- Verwende österreichische Begriffe wenn passend (z.B. "Landeshauptmann" statt "Ministerpräsident")
- Politische Referenzen beziehen sich auf österreichische Politik, sofern nicht anders angegeben`;
  }
  return '';
}

/** Strict-output modes — anchor adjuncts skipped to keep their format rules clean. */
const MODES_WITHOUT_ANCHORS: ReadonlySet<ChatGraphState['intent']> = new Set([
  'edit_current_doc',
  'image_edit',
  'image',
  'chart',
]);

const EDIT_CURRENT_DOC_GUIDANCE =
  '\nDu hast eine Änderung am aktuellen Dokument angefordert. Antworte mit EINEM EINZIGEN kurzen Satz auf Deutsch, der bestätigt, was du gleich änderst (z.B. "Kürze den letzten Absatz."). Schreibe NICHT den geänderten Text aus — die Bearbeitung passiert direkt im Dokument. Keine Aufzählungen, keine Markdown-Formatierung, keine Quellenverweise.';

const SUMMARY_GUIDANCE =
  '\nDer*die Nutzer*in hat eine Zusammenfassung angefordert. Präsentiere die vorbereitete Zusammenfassung klar und strukturiert.';

const CHART_GUIDANCE = `\nDer*die Nutzer*in möchte ein Diagramm. Erstelle die Daten und gib sie als JSON-Block zurück.
Schreibe zuerst eine kurze Erklärung (1-2 Sätze), dann den JSON-Block in diesem Format:

\`\`\`chart
{"type":"bar","title":"Titel","data":[{"name":"A","wert":10},{"name":"B","wert":20}],"xKey":"name","yKeys":["wert"]}
\`\`\`

Regeln:
- type: "bar", "line", "area", "pie" oder "donut"
- data: Array mit Objekten, jedes hat einen xKey und mindestens einen yKey
- xKey: Name des Feldes für die X-Achse (z.B. "name", "monat", "jahr")
- yKeys: Array der Feldnamen für die Werte (z.B. ["wert", "wert2"])
- Verwende realistische, plausible Daten wenn keine konkreten Zahlen gegeben sind
- Der JSON-Block MUSS in \`\`\`chart ... \`\`\` eingeschlossen sein`;

const IMAGE_FAILED_GUIDANCE =
  '\nDie Bildgenerierung ist fehlgeschlagen. Entschuldige dich und biete an, es erneut zu versuchen.';

const IMAGE_EDIT_SUCCESS_GUIDANCE = `\nDu hast das angehängte Bild erfolgreich bearbeitet. Das Ergebnis wird dem*der Nutzer*in bereits angezeigt — du musst es NICHT erneut zeigen oder verlinken.

ABSOLUTE AUSGABE-REGEL für diese Antwort:
- NUR natürlicher deutscher Fließtext, 1-3 Sätze.
- KEIN JSON, KEINE geschweiften Klammern { }, KEINE eckigen Klammern [ ] um Inhalte, KEINE Schlüssel-Wert-Paare wie "edit": ..., KEINE Markdown-Code-Blöcke, KEINE Aufzählungen.
- Falls frühere Antworten in diesem Thread strukturierte Daten (JSON o.ä.) ausgegeben haben, ignoriere dieses Muster — es war ein Bug. Antworte ab jetzt ausschließlich in normaler Prosa.

Beispiel einer guten Antwort: "Ich habe die Person sichtbar älter wirken lassen — graue Haare und feine Falten, während Kleidung und Pose erhalten bleiben. Sag mir, falls du eine andere Anpassung möchtest."

Stütze dich für die Beschreibung auf den BILDVERGLEICH-Block oben (falls vorhanden); ansonsten halte dich an den Wunsch des*der Nutzer*in aus der letzten Nachricht. Verneine NICHT die Fähigkeit zur Bildbearbeitung — sie hat gerade stattgefunden.`;

const IMAGE_EDIT_FAILED_GUIDANCE =
  '\nDie Bildbearbeitung ist fehlgeschlagen. Entschuldige dich kurz in einem Satz und bitte um eine andere Formulierung oder ein anderes Bild. KEIN JSON, KEINE Code-Blöcke.';

const DIRECT_GUIDANCE =
  '\nDies ist eine direkte Anfrage ohne Recherche-Bedarf. Antworte natürlich und hilfsbereit aus dem verfügbaren Kontext.';

const SEARCH_GUIDANCE =
  '\nDu hast Recherche-Ergebnisse erhalten. Beantworte die Frage primär aus diesen Ergebnissen und zitiere sie inline.';

/**
 * Synthesis-mode guidance for multi-document chat.
 * Selected at classification time based on intent + doc count.
 *
 * `table`             — compare-style: markdown table + short synthesis
 * `per_doc_bullets`   — many-doc compare: bullets per doc + diff section
 * `grounded_prose`    — multi-doc background: narrative with mandatory grounding
 */
function getSynthesisGuidance(state: ChatGraphState): string {
  const mode = state.synthesisMode;
  const sources = state.documentSources ?? [];
  if (!mode || sources.length < 2) return '';

  const docList = sources.map((s, i) => `${i + 1}. **${s.label}** (Quelle ${i + 1})`).join('\n');

  if (mode === 'table') {
    return `\n\n## VERGLEICHS-MODUS\n\nDer*die Nutzer*in vergleicht ${sources.length} Dokumente:\n${docList}\n\nFormat der Antwort:\n1. Eine Markdown-Tabelle: Spalten = Dokumente (in obiger Reihenfolge), Zeilen = die Vergleichsdimensionen, die du selbst aus den Quellen ableitest (3–6 Dimensionen).\n2. Danach 2–4 Sätze Synthese: Übereinstimmungen, klare Unterschiede, mögliche Konflikte.\n3. Jede Zelle der Tabelle muss durch mindestens eine Inline-Quellenreferenz [N] gestützt sein.\n4. Wenn ein Dokument zu einer Dimension nichts sagt, schreibe "—" in die Zelle (nicht erfinden).\n5. Genderstern verwenden (Bürger*innen, der*die Sprecher*in).`;
  }

  if (mode === 'per_doc_bullets') {
    return `\n\n## MEHR-DOKUMENT-MODUS\n\nDer*die Nutzer*in arbeitet mit ${sources.length} Dokumenten:\n${docList}\n\nFormat der Antwort:\n1. Pro Dokument ein Abschnitt mit dem Dokumentnamen als Überschrift und 3–5 Bullets der Kernaussagen — jeweils inline zitiert [N].\n2. Anschließend ein Abschnitt **Gemeinsamkeiten**.\n3. Anschließend ein Abschnitt **Unterschiede**.\n4. Genderstern verwenden.`;
  }

  // grounded_prose
  return `\n\n## MEHR-DOKUMENT-KONTEXT\n\nDer*die Nutzer*in hat ${sources.length} Dokumente referenziert:\n${docList}\n\nAntworte als zusammenhängende Prosa, aber:\n1. Stütze jede Kernaussage durch eine Inline-Quellenreferenz [N].\n2. Wenn ein Dokument zur Frage relevant ist, muss es mindestens einmal zitiert werden — sonst kennzeichne explizit, dass es im jeweiligen Punkt schweigt.\n3. Mische nicht stillschweigend Quellen — der*die Leser*in soll erkennen können, welches Dokument welche Aussage stützt.\n4. Genderstern verwenden.`;
}

function getModeGuidance(state: ChatGraphState): string {
  switch (state.intent) {
    case 'edit_current_doc':
      return EDIT_CURRENT_DOC_GUIDANCE;
    case 'summary':
      return SUMMARY_GUIDANCE;
    case 'chart':
      return CHART_GUIDANCE;
    case 'image':
      return state.generatedImage
        ? `\nDu hast erfolgreich ein Bild generiert. Das Bild wurde dem*der Nutzer*in bereits angezeigt.\nBeschreibe kurz was auf dem Bild zu sehen ist basierend auf dem Prompt: "${state.imagePrompt || ''}"\nBiete an, Änderungen vorzunehmen oder ein neues Bild zu erstellen.`
        : IMAGE_FAILED_GUIDANCE;
    case 'image_edit':
      return state.generatedImage ? IMAGE_EDIT_SUCCESS_GUIDANCE : IMAGE_EDIT_FAILED_GUIDANCE;
    case 'direct':
    case 'save_as_doc':
      return DIRECT_GUIDANCE;
    case 'compare':
    case 'research':
    case 'search':
    case 'web':
    case 'examples':
    case 'pressemitteilung_examples':
    case 'sharepic':
    case 'modify_doc':
    case 'modify_board':
    case 'share_doc':
      return SEARCH_GUIDANCE;
    default:
      return SEARCH_GUIDANCE;
  }
}

const ANCHOR_ADJUNCTS: { [K in AnchorDescriptor['kind']]: string } = {
  currentDocument:
    '- Im Editor ist ein Dokument geöffnet (siehe AKTUELLES DOKUMENT). Wenn die Frage es konkret berührt, beziehe dich darauf. Schreibe das Dokument NICHT um, außer der*die Nutzer*in fragt explizit danach.',
  documentChat:
    '- Das Gespräch ist auf ausgewählte Dokumente des*der Nutzer*in begrenzt. Nutze deren Inhalt als primäre Antwortgrundlage; zitiere relevante Passagen.',
  documentMention:
    '- Der*die Nutzer*in hat Dokumente referenziert (REFERENZIERTE DOKUMENTE). Berücksichtige sie als zusätzlichen Kontext.',
  attachment:
    '- Hochgeladene Dateien sind oben eingebettet (ANGEHÄNGTE DOKUMENTE). Berücksichtige ihren Inhalt, soweit relevant.',
  board: '- Ein Board ist referenziert (BOARD-KONTEXT). Berücksichtige Spalten, Karten und Status.',
  image: '- Bilder sind angehängt (siehe Nachricht). Beziehe dich auf den Bildinhalt.',
};

function getAnchorAdjuncts(state: ChatGraphState): string {
  if (MODES_WITHOUT_ANCHORS.has(state.intent)) return '';

  const anchors = getActiveAnchors(state);
  const fragments = anchors.map((a) => ANCHOR_ADJUNCTS[a.kind]);
  if (fragments.length === 0) return '';

  // Docs-editor surface: when an open document AND retrieved search/notebook
  // results are both present (e.g. the user typed "@berlin …"), the open
  // document otherwise dominates the answer and the notebook is silently
  // ignored. Make co-equal synthesis explicit for this turn.
  const hasCurrentDocument = anchors.some((a) => a.kind === 'currentDocument');
  const coEqualLine =
    hasCurrentDocument && state.searchResults.length > 0
      ? '\n\nWichtig für den Dokument-Editor: Das AKTUELLE DOKUMENT und die SUCHERGEBNISSE sind hier gleichwertige Quellen — synthetisiere in der Regel über beide. Wenn die Frage aber klar eine Recherche-Aufgabe ist (z.B. ein explizit erwähntes Notebook wie @berlin) und sich erkennbar nicht auf das geöffnete Dokument bezieht, darfst du das Dokument für diese eine Antwort beiseitelassen und allein aus den Suchergebnissen antworten. Ein explizit angefragtes Notebook ignorierst du nie zugunsten des Dokuments.'
      : '';

  return `\n\n## ZUSÄTZLICHER KONTEXT\n\n${fragments.join('\n')}\n\nNutze die jeweils relevanten Quellen — keine ist exklusiv. Bei Recherche-Fragen sind Suchergebnisse die primäre Antwortgrundlage; offene/referenzierte Dokumente dienen als thematischer Kontext.${coEqualLine}`;
}

/**
 * Build the complete system message with agent role and search context.
 */
export async function buildSystemMessage(state: ChatGraphState): Promise<string> {
  // Composer paths (press, social-media): a sibling composer node has already
  // produced an intent-specific system prompt and stored it on state.responseText.
  // Use it verbatim — bypassing the generic search-context / anchor / citation
  // machinery that doesn't apply to a fresh content-creation turn.
  // Defensive: routing in ChatGraph already forks composer intents away from
  // respondNode, so this branch only fires if routing changes upstream.
  if (
    (state.intent === 'pressemitteilung_examples' || state.intent === 'examples') &&
    state.responseText
  ) {
    return state.responseText;
  }

  const {
    agentConfig,
    intent,
    threadAttachments,
    memoryContext,
    summaryContext,
    boardContext,
    documentMentionContext,
  } = state;
  const searchContext = await formatSearchContext(state, !!agentConfig.inlineSourceLinks);
  const perSourceContext = formatPerSourceContext(state);
  const currentDocumentContext = formatCurrentDocument(state);
  const attachmentContext = formatAttachmentContext(state);
  const imageContext = formatImageContext(state);
  const summaryContextFormatted = formatSummaryContext(summaryContext);
  const threadAttachmentsContext = formatThreadAttachmentsContext(threadAttachments);
  const memoryContextFormatted = formatMemoryContext(memoryContext);
  const chatHistoryFormatted = state.chatHistoryContext ? `\n\n${state.chatHistoryContext}` : '';
  const boardContextFormatted = formatBoardContext(boardContext);
  const docMentionContextFormatted = formatDocumentMentionContext(documentMentionContext);
  const localeContext = formatLocaleContext(state.userLocale);

  const intentGuidance =
    getModeGuidance(state) + getAnchorAdjuncts(state) + getSynthesisGuidance(state);

  const hasSources = state.searchResults.length > 0 && intent !== 'direct';
  // Citations are the canonical "what the model can cite as [N]" — derived
  // from the same CitableSource ordering the prompt block uses. Don't
  // recompute or filter independently here, or the model's [N] markers can
  // drift from the rendered Citation array (the original wolke bug).
  const sourceCount = state.citations.length;
  // Polished-content suppresses inline citations only when generating output;
  // research questions always cite inline regardless of contentType heuristics.
  const isPolishedContent = !!state.contentType && intent !== 'search';

  let citationInstruction = '';
  if (hasSources && isPolishedContent) {
    citationInstruction = `
5. Verwende die Suchergebnisse als Faktengrundlage, aber setze KEINE Inline-Quellenverweise [1], [2] etc. in den Text.
6. Der Text soll als fertiges, professionelles Dokument lesbar sein. Die Quellen werden separat angezeigt.
7. Erfinde KEINE Fakten — stütze dich auf die bereitgestellten Quellen.`;
  } else if (hasSources) {
    citationInstruction = `
5. Du hast genau ${sourceCount} Quelle(n). Verwende NUR [1] bis [${sourceCount}] als Quellenverweise. Höhere Nummern existieren NICHT.
6. Zitiere 1-2 Quellen pro Kernaussage — nicht jeder Satz braucht eine Referenz.
7. Setze die Referenz direkt nach der Aussage, z.B.: "Die Grünen fordern ein Tempolimit [1]."
8. Erfinde KEINE zusätzlichen Quellen oder Quellenverweise über [${sourceCount}] hinaus.`;
  }

  const today = formatGermanDate();

  // User profile instructions (additive — included in all modes)
  const userInstructionsFormatted = state.userInstructions
    ? `\n\n## PERSÖNLICHE ANWEISUNGEN\n\nDer*die Nutzer*in hat folgendes Profil hinterlegt:\n\n${state.userInstructions}\n\nBefolge diese Anweisungen bei allen Antworten.`
    : '';

  // Custom system prompt: replaces the entire agent prompt when set
  if (state.customSystemPrompt) {
    return `${state.customSystemPrompt}
Heutiges Datum: ${today}${localeContext}${userInstructionsFormatted}${memoryContextFormatted}${chatHistoryFormatted}${boardContextFormatted}${docMentionContextFormatted}${threadAttachmentsContext}${currentDocumentContext}${attachmentContext}${imageContext}${summaryContextFormatted}${searchContext}${perSourceContext}${hasSources ? `\n${citationInstruction}` : ''}`;
  }

  // Use a neutral, non-partisan system role for document summaries
  const NEUTRAL_SUMMARY_ROLE =
    'Du bist ein hilfreicher Assistent, der Dokumente objektiv und neutral zusammenfasst. ' +
    'Deine Zusammenfassungen sind sachlich, unparteiisch und geben den Inhalt des Dokuments ' +
    'korrekt wieder — unabhängig vom politischen Kontext.';
  const rawSystemRole = intent === 'summary' ? NEUTRAL_SUMMARY_ROLE : agentConfig.systemRole;
  const systemRole = localizePlaceholders(rawSystemRole, (state.userLocale as Locale) || 'de-DE');

  // Active-skill prompt fragment: appended only when the user's chat composer
  // had a /skill mention active for this turn. Each platform skill carries its
  // own spec (Insta 600 chars, Twitter 280, PM structure …) so the agent's
  // base systemRole stays platform-agnostic and slim.
  const activeSkill = state.activeSkillMention
    ? SKILLS.find((s) => s.mention === state.activeSkillMention)
    : undefined;
  const skillFragment =
    activeSkill && 'skillSystemPrompt' in activeSkill && activeSkill.skillSystemPrompt
      ? `\n\n## AKTIVE PLATTFORM: ${activeSkill.title}\n${activeSkill.skillSystemPrompt}`
      : '';

  // Monthly corpus-insight overlay for the Öffentlichkeitsarbeit (PR) agents:
  // an additive, subordinate block (current themes / active speakers / style /
  // fresh real examples) auto-refreshed from the agent's own corpus. No-op for
  // non-PR agents, for `summary` (neutral role), or when the kill-switch is set.
  // See services/agents/prAgentInsightService.ts.
  const insightsFragment =
    intent === 'summary' ? '' : await getPrAgentInsightFragment(agentConfig.identifier);

  return `${systemRole}${skillFragment}${insightsFragment}
Heutiges Datum: ${today}${localeContext}${userInstructionsFormatted}${intentGuidance}${memoryContextFormatted}${chatHistoryFormatted}${boardContextFormatted}${docMentionContextFormatted}${threadAttachmentsContext}${currentDocumentContext}${attachmentContext}${imageContext}${summaryContextFormatted}${searchContext}${perSourceContext}

## ANTWORT-REGELN
1. Beantworte NUR was gefragt wurde - keine ungebetene Zusatzinfo
2. ${state.complexity === 'complex' ? 'Strukturiere mit Überschriften, bis zu 6 Absätze' : state.complexity === 'moderate' ? '2-4 Absätze mit klarer Struktur' : 'Kurze, präzise Antworten (1-2 Absätze)'}
3. Antworte auf Deutsch
4. Erfinde keine Fakten oder Quellennamen
5. Erstelle KEINE Quellenliste/Quellenverzeichnis am Ende — Quellen werden automatisch in der Oberfläche angezeigt
6. Kompakte Formatierung: Maximal eine Leerzeile zwischen Absätzen. Keine doppelten Leerzeilen, keine horizontalen Trennlinien (---)${citationInstruction}`;
}

/**
 * Respond node implementation.
 *
 * This node prepares the context for response generation but does NOT stream.
 * The controller handles streaming using AI SDK v6's streamText + toDataStreamResponse.
 *
 * Returns:
 * - systemMessage: The complete system prompt with search context
 * - readyToStream: Flag indicating the graph has completed preparation
 */
export async function respondNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info(
    `[Respond] Preparing response context (intent: ${state.intent}, results: ${state.searchResults.length})`
  );

  try {
    // Build system message with search context (async for complex research cleaning)
    const systemMessage = await buildSystemMessage(state);

    const responseTimeMs = Date.now() - startTime;
    log.info(`[Respond] Context prepared in ${responseTimeMs}ms`);

    // Return the prepared context - streaming happens in controller
    return {
      responseText: systemMessage, // Store system message for controller to use
      streamingStarted: false, // Will be set true by controller when streaming starts
      responseTimeMs,
    };
  } catch (error) {
    log.error('[Respond] Error preparing context:', error instanceof Error ? error.message : error);

    return {
      responseText: '',
      responseTimeMs: Date.now() - startTime,
      error: `Response preparation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
