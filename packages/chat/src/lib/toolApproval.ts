/**
 * Die Wahlmöglichkeiten einer Werkzeug-Freigabe — an EINER Stelle, weil der
 * Livestream und die Wiederherstellung nach einem Reload dieselbe Karte zeigen
 * müssen. `kind` ist das Vokabular von assistant-ui.
 */
export const TOOL_APPROVAL_OPTIONS = [
  { id: 'allow-once', kind: 'allow-once', label: 'Einmal erlauben' },
  {
    id: 'allow-always',
    kind: 'allow-always',
    label: 'Immer erlauben',
    description: 'Dieses Werkzeug läuft künftig ohne Rückfrage.',
  },
  { id: 'reject-once', kind: 'reject-once', label: 'Ablehnen' },
] as const satisfies ReadonlyArray<{
  id: string;
  kind: 'allow-once' | 'allow-always' | 'reject-once' | 'reject-always';
  label: string;
  description?: string;
}>;

export type ToolApprovalOptionId = (typeof TOOL_APPROVAL_OPTIONS)[number]['id'];

/**
 * Ablehnen mit optionaler Begründung: das Modell bekommt sie als „Vom Nutzer
 * abgelehnt: …" zurück (approvalResume) und kann es anders versuchen, statt zu
 * raten, was nicht gepasst hat.
 */
export const REJECT_REASON_PLACEHOLDER = 'Was soll stattdessen passieren? (optional)';
export const REJECT_REASON_MAX_LENGTH = 500;

/**
 * Der Zustand eines Freigabe-Gates, wie ihn beide Plattformen lesen. Lag bis
 * 08/2026 in der Web-Karte und war damit für Native unerreichbar — Mobile hatte
 * deshalb gar keine Freigabe-Oberfläche und zeigte ein wartendes Werkzeug als
 * Shimmer, der nie auflöste.
 */
export interface ToolApprovalState {
  id: string;
  approved?: boolean;
  reason?: string;
  optionId?: string;
  resolution?: 'cancelled' | 'expired';
}

/** Ist das Gate entschieden (erlaubt, abgelehnt, abgebrochen, abgelaufen)? */
export function isApprovalDecided(approval: ToolApprovalState): boolean {
  return approval.approved !== undefined || approval.resolution !== undefined;
}

/** Was die eingeklappte Pille nach der Entscheidung sagt. */
export function approvalDecidedLabel(approval: ToolApprovalState): string {
  if (approval.resolution === 'expired') return 'Abgelaufen';
  if (approval.resolution === 'cancelled') return 'Abgebrochen';
  if (approval.approved === false) return 'Abgelehnt';
  return approval.optionId === 'allow-always' ? 'Immer erlaubt' : 'Erlaubt';
}

/**
 * Eine gespeicherte Freigabe-Pause: `metadata.pendingApproval` (die letzte des
 * Zuges) oder ein Eintrag aus `metadata.decidedApprovals` (die davor, #5051).
 */
export interface PersistedApprovalPause {
  approvalTurnId: string;
  calls: Array<{
    toolCallId: string;
    toolName: string;
    args?: Record<string, unknown>;
    title?: string;
    serverName?: string;
  }>;
  resolved?: boolean | 'expired';
  /** Mit `resolved: true` gespeichert (`approvalResume`): was entschieden wurde. */
  decisions?: Array<{
    toolCallId: string;
    approved: boolean;
    optionId?: string;
    reason?: string;
  }>;
}

export interface DecidedApprovalPill {
  readonly type: 'tool-call';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, never>;
  readonly result: { approved: boolean };
  readonly approval: ToolApprovalState & { readonly options: typeof TOOL_APPROVAL_OPTIONS };
  readonly title?: string;
  readonly serverName?: string;
}

/**
 * Entschiedene Freigaben → die eingeklappten Pillen („Tabelle auswerten ·
 * Erlaubt"), die live über der Karte des Aufrufs standen, je toolCallId des
 * Aufrufs. Eigene Id, weil der ausgeführte Aufruf dieselbe toolCallId als Karte
 * trägt; ein Ergebnis, damit der Part nicht als offen gilt. Web und Native
 * bauen damit dieselben Pillen.
 */
export function decidedApprovalPills(
  pauses: ReadonlyArray<PersistedApprovalPause | undefined>
): Map<string, DecidedApprovalPill> {
  const pills = new Map<string, DecidedApprovalPill>();
  for (const pause of pauses) {
    if (pause?.resolved !== true) continue;
    for (const decision of pause.decisions ?? []) {
      const call = pause.calls.find((c) => c.toolCallId === decision.toolCallId);
      if (!call) continue;
      pills.set(call.toolCallId, {
        type: 'tool-call',
        toolCallId: `${call.toolCallId}__approval`,
        toolName: call.toolName,
        args: {},
        result: { approved: decision.approved },
        approval: {
          id: call.toolCallId,
          options: TOOL_APPROVAL_OPTIONS,
          approved: decision.approved,
          ...(decision.optionId != null ? { optionId: decision.optionId } : {}),
          ...(decision.reason != null ? { reason: decision.reason } : {}),
        },
        ...(call.title != null && { title: call.title }),
        ...(call.serverName != null && { serverName: call.serverName }),
      });
    }
  }
  return pills;
}

/**
 * Eigene Werkzeuge mit Freigabe-Gate: der Server schickt für sie weder Titel
 * noch Dienst, der Katalogname allein sagt Nutzer*innen nichts.
 * Neues internes Werkzeug → auch `INTERNAL_TOOL_LABELS` in apps/web/src/features/mcp/lib/toolApprovalsApi.ts.
 */
const INTERNAL_APPROVAL_DISPLAY: Record<string, { title: string; description: string }> = {
  tabelle_auswerten: {
    title: 'Tabelle auswerten',
    description: 'Der Grünerator erzeugt dafür Python-Code und führt ihn in deinem Browser aus.',
  },
};

export function internalApprovalDisplay(
  toolName: string
): { title: string; description: string } | null {
  return INTERNAL_APPROVAL_DISPLAY[toolName] ?? null;
}
