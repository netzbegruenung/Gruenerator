/**
 * `chat_history` — recall of the user's own past work. Runs its OWN retrieval
 * (not searchNode, which targets party documents/web) and writes
 * `searchResults` directly.
 */

import { buildChatThreadSlug } from '@gruenerator/shared/utils';

import { extractTextContent } from '../messageHelpers.js';
import {
  recallPastChats,
  recallOfficeDocuments,
  recallReels,
  rerankRecall,
  getThreadRecallContext,
  formatPastChatsBlock,
  formatOfficeDocsBlock,
  formatReelsBlock,
  getSpaceRecallScope,
} from '../pastChatRecallService.js';
import { PROGRESS_MESSAGES } from '../sseHelpers.js';

import type { ChatGraphState, SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SearchResultPayload, SSEWriter } from '../sseHelpers.js';

export async function runChatHistoryBranch(opts: {
  state: ChatGraphState;
  sse: SSEWriter;
  threadId: string | null;
}): Promise<ChatGraphState> {
  const { sse } = opts;
  let finalState = opts.state;

  // Recall the user's own past work — chat threads (deep-reading the top
  // match), office documents (docs/presentations/sheets) and reels
  // (subtitled videos, matched on their spoken transcript).
  const userId = finalState.agentConfig.userId;
  if (!userId) return finalState;

  sse.send('search_start', { message: 'Durchsuche frühere Inhalte…' });
  const query =
    finalState.searchQuery ||
    (finalState.messages.length
      ? (extractTextContent(finalState.messages[finalState.messages.length - 1].content) as string)
      : '');
  const dateFrom = finalState.detectedFilters?.date_from;
  const dateTo = finalState.detectedFilters?.date_to;
  // Space scope: restrict recall to the current Space's chats + roster.
  // null ist hier der definierte Normalfall — ein Thread ohne Space
  // liefert ihn ohnehin.
  const spaceScope = opts.threadId
    ? // swallow-ok: scheitert die Einengung, sucht der Recall ungescopet weiter statt den Turn abzubrechen
      await getSpaceRecallScope(opts.threadId, userId).catch(() => null)
    : null;
  const [rawChats, rawOfficeDocs, rawReels] = await Promise.all([
    recallPastChats(userId, query, {
      limit: 5,
      ...(opts.threadId != null && { excludeThreadId: opts.threadId }),
      ...(dateFrom && { startDate: new Date(`${dateFrom}T00:00:00.000Z`) }),
      // Das Fenster ist INKLUSIV erzeugt (`parseRelativeDateRange`), die
      // SQL-Klausel ist `created_at <= $n`, und `new Date('2026-07-30')`
      // ist Mitternacht. Beides zusammen machte aus jedem Ein-Tages-Fenster
      // („gestern") einen einzigen Zeitpunkt: nur eine Nachricht, die
      // exakt um 00:00:00 UTC geschrieben wurde, konnte noch treffen — und
      // „letzte Woche" verlor den ganzen Sonntag. Genau die „0 Treffer →
      // keine Quellen gefunden"-Antwort, gegen die diese Stufe gebaut ist.
      ...(dateTo && { endDate: new Date(`${dateTo}T23:59:59.999Z`) }),
      ...(spaceScope && { threadIds: spaceScope.threadIds }),
    }),
    // BEKANNTE LÜCKE: das Datumsfenster geht nur an den Chat-Recall.
    // `searchOfficeContent`/`searchReels` nehmen keine Datumsparameter, ein
    // Durchreichen wäre also eine Änderung an beiden Suchdiensten und ihrem
    // SQL — eigener Schnitt. Folge heute: „meine Dokumente vom letzten
    // Monat" filtert die CHATS auf den Monat, die Dokumente und Reels aber
    // nicht. Das untertreibt nie (es fehlt kein Treffer), es übertreibt.
    recallOfficeDocuments(userId, query, 5),
    recallReels(userId, query, 5),
  ]);
  // Cross-source rerank so the most relevant few survive across chats +
  // office content + reels, rather than 5 of each.
  const {
    chats: hits,
    officeDocs,
    reels,
  } = await rerankRecall(query, rawChats, rawOfficeDocs, 6, rawReels);

  const deepRead = hits[0] ? await getThreadRecallContext(hits[0].threadId, userId) : null;

  const searchResults: SearchResult[] = [
    ...hits.map((h) => ({
      source: 'chat_history',
      title: h.threadTitle ?? 'Unbenannter Chat',
      content: h.snippet,
      url: `/chat/${h.threadSlugSuffix ? buildChatThreadSlug(h.threadTitle, h.threadSlugSuffix) : h.threadId}`,
    })),
    ...officeDocs.map((d) => ({
      source: 'office_document',
      title: d.title ?? 'Unbenanntes Dokument',
      content: d.snippet || d.kind,
      url: d.url,
    })),
    ...reels.map((r) => ({
      source: 'reel',
      title: r.title,
      content: r.snippet || 'Reel',
      url: r.url,
    })),
  ];

  const contextBlocks = [
    spaceScope?.rosterBlock ?? '',
    hits.length ? formatPastChatsBlock(hits, deepRead) : '',
    formatOfficeDocsBlock(officeDocs),
    formatReelsBlock(reels),
  ].filter(Boolean);
  finalState = {
    ...finalState,
    searchResults,
    chatHistoryContext: contextBlocks.length ? contextBlocks.join('\n\n') : null,
  } as ChatGraphState;

  const payloadResults: SearchResultPayload[] = searchResults.map((r) => ({
    source: r.source,
    title: r.title,
    content: r.content,
    ...(r.url != null && { url: r.url }),
  }));
  sse.send('search_complete', {
    message: PROGRESS_MESSAGES.searchComplete(searchResults.length),
    resultCount: searchResults.length,
    results: payloadResults,
  });

  return finalState;
}
