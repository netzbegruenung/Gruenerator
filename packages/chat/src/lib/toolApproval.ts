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
