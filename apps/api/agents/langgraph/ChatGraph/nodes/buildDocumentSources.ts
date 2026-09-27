/**
 * Build the unified DocumentSource[] from raw input refs.
 *
 * Runs at the top of classification so every downstream node sees the same
 * normalized list. Pure (no LLM, no I/O) so it's safe to call unconditionally.
 *
 * Also picks the synthesisMode based on intent + doc count so respondNode
 * can format the answer appropriately for multi-doc cases.
 */

import {
  NOTEBOOK_COLLECTION_MAP,
  resolveNotebookCollections,
} from '../../../../config/notebookCollectionMap.js';

import type {
  ChatGraphState,
  DocumentSource,
  SearchIntent,
  SynthesisMode,
  WolkeFileRef,
  ConnectFileRef,
} from '../types.js';

const COMPARE_VERB_PATTERN =
  /\b(vergleich|unterschied|pro\s+und\s+contra|gegenüber|im\s+vergleich|versus|vs\.?|gemeinsamkeit|abweichung|kontrast|stell.*gegenüber)/i;

/**
 * Detect explicit comparison intent in the user message.
 * Same keyword family as detectComplexity but lifted to the intent layer.
 */
export function hasCompareVerbs(text: string): boolean {
  return COMPARE_VERB_PATTERN.test(text);
}

/**
 * Pick the answer-shape mode for multi-doc cases.
 *  - intent === 'compare' + ≤3 docs → table
 *  - intent === 'compare' + >3 docs → per_doc_bullets
 *  - ≥2 doc sources, not compare    → grounded_prose
 *  - otherwise                       → null (existing behaviour)
 */
export function pickSynthesisMode(intent: SearchIntent, docCount: number): SynthesisMode {
  if (intent === 'compare') {
    return docCount > 3 ? 'per_doc_bullets' : 'table';
  }
  if (docCount >= 2) {
    return 'grounded_prose';
  }
  return null;
}

interface BuildOpts {
  documentIds: string[];
  documentChatIds: string[];
  docMentionIds: string[];
  notebookIds: string[];
  wolkeFiles: WolkeFileRef[];
  connectFiles: ConnectFileRef[];
  threadAttachments: ChatGraphState['threadAttachments'];
  currentDocument: ChatGraphState['currentDocument'];
  /** documentId → Dateiname für Anhänge, die in DIESEM Turn hochgeladen wurden
   *  und deshalb noch in keiner `threadAttachments`-Zeile stehen. */
  documentChatLabels?: Record<string, string> | undefined;
}

/**
 * Normalize all per-turn document refs into a single DocumentSource[].
 * Order: explicit user mentions first (datei → dokumentchat → @doc → notebook),
 * then ambient context last (attachments → currentDocument). This order is
 * what the labeled per-doc blocks in respondNode will mirror.
 */
export function buildDocumentSources(opts: BuildOpts): DocumentSource[] {
  const sources: DocumentSource[] = [];
  // An attachment that was vectorized carries its Qdrant id — that id is what
  // arrives here as a documentChatId, so the file's real name is recoverable.
  const nameByDocumentId = new Map([
    // Anhänge früherer Turns …
    ...(opts.threadAttachments ?? [])
      .filter((a) => !a.isImage && a.documentId)
      .map((a) => [a.documentId as string, a.name] as const),
    // … und die dieses Turns, die es noch in keine Anhang-Zeile geschafft
    // haben (die entsteht erst nach der Antwort). Zuletzt, damit der frische
    // Name gewinnt, falls dieselbe id in beiden steht.
    ...Object.entries(opts.documentChatLabels ?? {}),
  ]);
  let unnamed = 0;
  /**
   * A label for a source we only know by id.
   *
   * Never a slice of the id. `Dokument a13dc241` was rendered into the system
   * prompt by getSynthesisGuidance ("1. **Dokument a13dc241** (Quelle 1)"), the
   * model read it as the document's identifier and handed it to `read_artifact`
   * — which passed it to `WHERE id = $2::uuid` and got 22P02 back. Twice in one
   * turn on 13.08.2026. A truncated identifier is not an identifier, and the
   * eight characters told the reader nothing a counter doesn't.
   */
  const fallbackLabel = (noun: string): string => `${noun} ${++unnamed}`;

  for (const id of opts.documentIds) {
    sources.push({
      kind: 'document',
      id,
      label: nameByDocumentId.get(id) ?? fallbackLabel('Datei'),
    });
  }

  for (const id of opts.documentChatIds) {
    sources.push({
      kind: 'document_chat',
      id,
      label: nameByDocumentId.get(id) ?? fallbackLabel('Dokument'),
    });
  }

  for (const id of opts.docMentionIds) {
    // The open document is already represented by the `current_doc` source
    // below — its content is injected directly into the prompt and it has no
    // separate Qdrant index to retrieve from. Skip it here so it isn't fanned
    // out as a phantom 0-result search source. Mirrors classifierNode.ts:150-152.
    if (id === opts.currentDocument?.id) continue;
    sources.push({
      kind: 'doc_mention',
      id,
      label: nameByDocumentId.get(id) ?? fallbackLabel('Dokument'),
    });
  }

  for (const id of opts.notebookIds) {
    const collectionIds = resolveNotebookCollections([id]);
    const known = id in NOTEBOOK_COLLECTION_MAP;
    sources.push({
      kind: 'notebook',
      id,
      label: notebookLabel(id),
      ...(known ? { collectionIds } : {}),
    });
  }

  for (const ref of opts.wolkeFiles) {
    sources.push({
      kind: 'wolke',
      id: `wolke:${ref.shareLinkId}:${ref.path}`,
      label: ref.name,
      wolke: ref,
    });
  }

  for (const ref of opts.connectFiles) {
    sources.push({
      kind: 'connect',
      id: `connect:${ref.provider}:${ref.fileId}`,
      label: ref.name,
      connect: ref,
    });
  }

  for (const att of opts.threadAttachments ?? []) {
    if (att.isImage) continue;
    sources.push({ kind: 'attachment', id: att.id, label: att.name });
  }

  if (opts.currentDocument) {
    sources.push({
      kind: 'current_doc',
      id: opts.currentDocument.id,
      label: opts.currentDocument.title || 'Aktuelles Dokument',
    });
  }

  return sources;
}

function notebookLabel(id: string): string {
  return id.replace(/-notebook$/, '').replace(/-/g, ' ');
}
