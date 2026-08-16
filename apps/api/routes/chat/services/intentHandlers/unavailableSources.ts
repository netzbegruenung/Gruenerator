/**
 * Reporting for sources the user attached that could not be read. Shared by the
 * search branch and the resume pipeline.
 */

import { sendChatWarning } from '../sseHelpers.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';

/** Human label for a `<kind>:<id>` source key, for user- and model-facing copy. */
const SOURCE_KIND_LABELS: Record<string, string> = {
  wolke: 'Wolke-Datei',
  connect: 'verbundene Datei',
  doc_mention: 'verlinktes Dokument',
  notebook: 'Notizbuch',
};

function labelForSource(source: string): string {
  const kind = source.split(':')[0] ?? '';
  return SOURCE_KIND_LABELS[kind] ?? 'Quelle';
}

/**
 * Report sources the user explicitly attached that could not be read.
 *
 * Feeds BOTH channels from one fact: the warning is the telemetry signal, the
 * degradation note makes the answer itself say which source is missing —
 * otherwise the model quietly answers as though the file had never existed.
 */
export function reportUnavailableSources(
  sse: SSEWriter,
  state: ChatGraphState,
  sources: string[],
  needsReauth = false
): void {
  const labels = [...new Set(sources.map(labelForSource))].join(', ');
  // An expired connection is the one case the user can fix, so it gets its own
  // code and an actionable message instead of "try again later".
  if (needsReauth) {
    sendChatWarning(
      sse,
      'connect_reauth_required',
      `${labels}: Die Verbindung ist abgelaufen — bitte in den Einstellungen neu verbinden.`
    );
  } else {
    sendChatWarning(
      sse,
      'source_unavailable',
      `${labels} konnte nicht gelesen werden — die Antwort entstand ohne diese Quelle.`
    );
  }
  state.degradationNotes = [
    ...(state.degradationNotes ?? []),
    {
      code: needsReauth ? 'connect_reauth_required' : 'source_unavailable',
      modelHint: needsReauth
        ? `Die Verbindung zu dieser Quelle ist abgelaufen: ${labels}. Sag das ehrlich und weise darauf hin, dass sie in den Einstellungen neu verbunden werden muss.`
        : `Diese vom Nutzer angegebene(n) Quelle(n) konnten NICHT gelesen werden: ${labels}. Sag das ehrlich und tu nicht so, als hättest du ihren Inhalt gesehen.`,
    },
  ];
}
