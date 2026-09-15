/**
 * Confirm Action Service
 *
 * Helpers for building pending actions that need user confirmation,
 * chart extraction from markdown responses, and SSE emission.
 */

import { createLogger } from '../../../utils/logger.js';

import { pendingActionStore } from './pendingActionStore.js';

import type { SSEWriter } from './sseHelpers.js';
import type {
  ChatGraphState,
  PendingAction,
  ChartData,
  SearchIntent,
  ConfirmActionType,
} from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ChatGraphController');

const GREEN_CHART_COLORS = ['#005538', '#8AC9B0', '#52907A', '#B1E0C9', '#003D28', '#6BAA91'];

export function extractChartFromResponse(text: string): ChartData | null {
  const match = text.match(/```chart\s*\n?([\s\S]*?)```/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1].trim()) as ChartData;
    if (data.type && data.data && data.xKey && data.yKeys) {
      if (!data.colors) data.colors = GREEN_CHART_COLORS;
      return data;
    }
    return null;
  } catch {
    log.warn('[ChatGraph] Failed to parse chart JSON from response');
    return null;
  }
}

export const CONFIRM_ACTION_CONFIG: Record<
  ConfirmActionType,
  { title: string; description: string; icon: string; confirmLabel: string }
> = {
  save_as_doc: {
    title: 'Dokument erstellen',
    description: 'Die Antwort wird als neues Dokument gespeichert.',
    icon: 'file-text',
    confirmLabel: 'Dokument erstellen',
  },
  modify_doc: {
    title: 'Dokument bearbeiten',
    description: 'Das erwähnte Dokument wird mit dem neuen Inhalt aktualisiert.',
    icon: 'pencil',
    confirmLabel: 'Aktualisieren',
  },
  modify_board: {
    title: 'Board bearbeiten',
    description: 'Die Aufgaben werden zum Board hinzugefügt.',
    icon: 'kanban',
    confirmLabel: 'Hinzufügen',
  },
  share_doc: {
    title: 'Dokument teilen',
    description: 'Das Dokument wird mit der Gruppe geteilt.',
    icon: 'share-2',
    confirmLabel: 'Teilen',
  },
  create_group: {
    title: 'Gruppe erstellen',
    description: 'Eine neue Gruppe wird angelegt, mit dir als Administrator*in.',
    icon: 'users',
    confirmLabel: 'Erstellen',
  },
  join_group: {
    title: 'Gruppe beitreten',
    description: 'Du trittst der Gruppe über den Einladungslink bei.',
    icon: 'user-plus',
    confirmLabel: 'Beitreten',
  },
  add_cloud_connection: {
    title: 'Wolke-Verbindung hinzufügen',
    description: 'Der Freigabe-Link wird deinem Konto hinzugefügt — lesend.',
    icon: 'cloud',
    confirmLabel: 'Verbinden',
  },
  attach_wolke_folder: {
    title: 'Wolke-Ordner ins Notebook übernehmen',
    description:
      'Der Ordner wird ans Notebook gehängt; die ersten Dateien werden sofort ausgelesen (OCR), der Rest erscheint im Notebook unter „Neue Dateien".',
    icon: 'folder-input',
    confirmLabel: 'Übernehmen',
  },
  set_notebook_visibility: {
    title: 'Sichtbarkeit des Notebooks ändern',
    description:
      'Wer das Notebook lesen und bearbeiten darf. „Mit Anmeldung" heißt: alle angemeldeten Personen dieser Instanz.',
    icon: 'eye',
    confirmLabel: 'Ändern',
  },
  share_notebook: {
    title: 'Notebook teilen',
    description: 'Das Notebook wird mit dem Projekt geteilt — die Mitglieder können es lesen.',
    icon: 'share-2',
    confirmLabel: 'Teilen',
  },
  set_group_visibility: {
    title: 'Sichtbarkeit des Projekts ändern',
    description:
      'Öffentlich heißt: das Projekt erscheint unter „Projekte entdecken" und andere können um Aufnahme bitten. Privat heißt: Beitritt nur per Einladungslink.',
    icon: 'eye',
    confirmLabel: 'Ändern',
  },
  create_recurring_task: {
    title: 'Wiederkehrende Aufgabe einrichten',
    description:
      'Die Aufgabe läuft danach von selbst im angegebenen Takt und liefert dir jedes Mal ein Ergebnis. Bearbeiten und löschen geht jederzeit unter „Wiederkehrende Aufgaben".',
    icon: 'repeat',
    confirmLabel: 'Einrichten',
  },
  create_user_agent: {
    title: 'Grünerator-Agent anlegen',
    description:
      'Der Agent wird mit der entworfenen Rolle angelegt und ist danach unter „Meine Agenten" in der Agentura nutzbar. Rolle, Werkzeuge und Notebooks lassen sich jederzeit dort oder im Chat ändern.',
    icon: 'bot',
    confirmLabel: 'Anlegen',
  },
  share_user_agent: {
    title: 'Grünerator-Agent teilen',
    description:
      'Der Agent wird mit dem Projekt geteilt — die Mitglieder können ihn im Chat benutzen, aber nicht bearbeiten.',
    icon: 'share-2',
    confirmLabel: 'Teilen',
  },
};

/**
 * Below this, `fullText` is a confirmation sentence and not a document.
 *
 * `modify_doc` REPLACES the document with the answer text, so a prompt that
 * stops asking for the full rewrite silently turns the edit into a deletion —
 * which is exactly what ARTEFACT_CONFIRM_ONLY did to this intent between
 * 27b8a205a and the commit adding this guard. The prompt (ARTEFACT_REWRITE_FULL
 * in respondNode) is the fix; this is the floor under it, because a prompt
 * regression is invisible from here and the loss is not recoverable.
 *
 * 400 chars is deliberately far below any real document and far above every
 * confirmation sentence the three lanes produced ("Ich habe das Ziel auf 100
 * Teilnehmende angepasst und den Vermerk ergänzt." is 84).
 */
export const MIN_MODIFY_DOC_CONTENT_CHARS = 400;

export function buildPendingAction(opts: {
  intent: SearchIntent;
  threadId: string;
  userId: string;
  fullText: string;
  searchQuery: string | null;
  docMentionIds: string[] | undefined;
  boardIds: string[] | undefined;
  documentSubtype: string | null;
}): PendingAction | null {
  const {
    intent,
    threadId,
    userId,
    fullText,
    searchQuery,
    docMentionIds,
    boardIds,
    documentSubtype,
  } = opts;
  const base = {
    actionId: `action_${Date.now()}`,
    threadId,
    userId,
    preview: fullText.slice(0, 200),
    createdAt: Date.now(),
  };

  switch (intent) {
    case 'save_as_doc':
      return {
        ...base,
        type: 'save_as_doc',
        title: 'Antwort als Dokument speichern',
        payload: {
          content: fullText,
          title: searchQuery || 'Neues Dokument',
          subtype: documentSubtype || 'docs',
        },
      };
    case 'modify_doc':
      if (!docMentionIds?.length) return null;
      if (fullText.trim().length < MIN_MODIFY_DOC_CONTENT_CHARS) {
        log.warn(
          `[ChatGraph] modify_doc suppressed: answer is ${fullText.trim().length} chars, ` +
            `below the ${MIN_MODIFY_DOC_CONTENT_CHARS}-char floor for a document replacement`
        );
        return null;
      }
      return {
        ...base,
        type: 'modify_doc',
        title: 'Dokument aktualisieren',
        payload: { docId: docMentionIds[0], newContent: fullText },
      };
    case 'modify_board':
      if (!boardIds?.length) return null;
      return {
        ...base,
        type: 'modify_board',
        title: 'Board aktualisieren',
        payload: { boardId: boardIds[0], rows: [], responseText: fullText },
      };
    case 'compare':
    case 'pressemitteilung_examples':
    case 'sharepic':
    case 'search':
    case 'research':
    case 'examples':
    case 'web':
    case 'image':
    case 'image_edit':
    case 'summary':
    case 'chart':
    case 'share_doc':
    case 'produktion':
    case 'direct':
    case 'greeting':
    case 'edit_current_doc':
      // edit_current_doc auto-applies via the docs editor's BlockNote AI
      // extension (triggered by the controller's `trigger_doc_edit` SSE
      // event). No HITL confirmation card — the editor's undo stack is the
      // safety net.
      return null;
    default:
      return null;
  }
}

/**
 * Emit confirm_action SSE event and persist pending action.
 */
export async function emitConfirmAction(opts: {
  sse: SSEWriter;
  actualThreadId: string;
  userId: string;
  fullText: string;
  finalState: ChatGraphState;
  classifiedState: ChatGraphState;
  rawDocMentionIds?: string[];
  rawBoardIds?: string[];
}): Promise<void> {
  const {
    sse,
    actualThreadId,
    userId,
    fullText,
    finalState,
    classifiedState,
    rawDocMentionIds,
    rawBoardIds,
  } = opts;

  const pendingAction = buildPendingAction({
    intent: finalState.intent,
    threadId: actualThreadId,
    userId,
    fullText,
    searchQuery: classifiedState.searchQuery,
    // Prefer the raw @-mention ids from the request; fall back to the classifier-
    // injected target (Tier-2.7 follow-up edit on the thread's last created doc,
    // where the id comes from lastToolContext, not a re-mention).
    docMentionIds: rawDocMentionIds?.length ? rawDocMentionIds : classifiedState.docMentionIds,
    boardIds: rawBoardIds,
    documentSubtype: classifiedState.documentSubtype || null,
  });

  if (!pendingAction) return;

  const ssePayload = CONFIRM_ACTION_CONFIG[pendingAction.type];

  let metadataEntries: Array<{ key: string; value: string }>;
  switch (pendingAction.type) {
    case 'save_as_doc':
      metadataEntries = [
        { key: 'Titel', value: pendingAction.payload.title },
        { key: 'Typ', value: pendingAction.payload.subtype },
        { key: 'Länge', value: `${fullText.length} Zeichen` },
      ];
      break;
    case 'modify_doc':
      metadataEntries = [{ key: 'Dokument', value: pendingAction.payload.docId }];
      break;
    case 'share_doc':
      metadataEntries = [
        { key: 'Dokument', value: pendingAction.payload.docTitle },
        { key: 'Gruppe', value: pendingAction.payload.groupName },
        {
          key: 'Berechtigung',
          value: pendingAction.payload.permissionLevel === 'editor' ? 'Bearbeiten' : 'Nur lesen',
        },
      ];
      break;
    case 'modify_board':
      metadataEntries = [{ key: 'Board', value: pendingAction.payload.boardId }];
      break;
    default:
      // Tool-initiated types (create_group/join_group) never come through the
      // single-pass buildPendingAction; keep the switch total for the union.
      metadataEntries = [];
      break;
  }

  sse.send('confirm_action', {
    actionId: pendingAction.actionId,
    type: pendingAction.type,
    title: ssePayload.title,
    description: ssePayload.description,
    icon: ssePayload.icon,
    metadata: metadataEntries,
    confirmLabel: ssePayload.confirmLabel,
    cancelLabel: 'Abbrechen',
    threadId: actualThreadId,
  });

  await pendingActionStore.store(pendingAction);
  log.info(`[ChatGraph] Confirm action stored: ${pendingAction.actionId} (${pendingAction.type})`);
}

/** Fresh pending-action id (backend runtime — Date.now/Math.random are fine here). */
export function newActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Store + emit a `confirm_action` for a TOOL-initiated pending action (agentic
 * loop). Reuses the same `CONFIRM_ACTION_CONFIG` card and Redis store as the
 * single-pass path; the tool builds the `PendingAction` (an EXISTING type —
 * `modify_board` for add-card, `share_doc` for share) and supplies the preview
 * rows. Execution is unchanged: `confirmController.executeAction` runs on POST.
 */
export async function emitToolConfirmAction(
  sse: SSEWriter,
  action: PendingAction,
  metadata: Array<{ key: string; value: string }>
): Promise<void> {
  const cfg = CONFIRM_ACTION_CONFIG[action.type];
  sse.send('confirm_action', {
    actionId: action.actionId,
    type: action.type,
    title: cfg.title,
    description: cfg.description,
    icon: cfg.icon,
    metadata,
    confirmLabel: cfg.confirmLabel,
    cancelLabel: 'Abbrechen',
    threadId: action.threadId,
  });
  await pendingActionStore.store(action);
  log.info(`[ChatGraph] Tool confirm action stored: ${action.actionId} (${action.type})`);
}
