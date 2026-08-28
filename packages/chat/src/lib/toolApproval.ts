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
