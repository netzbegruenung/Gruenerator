/**
 * Discriminates a chat-graph resume request into the supported kinds:
 *
 * - `tool_approval` — die Person hat über zurückgehaltene Werkzeugaufrufe
 *   entschieden (body carries `toolApprovals`).
 * - `ask_human`  — a human answered a clarification (legacy; body carries `resume`).
 * - `client_tool` — a client-executed tool (e.g. run_python) produced a result
 *   (body carries `toolName` + `result`).
 *
 * Pure and side-effect-free so the resume routing stays regression-tested as new
 * client tools are added. Die Reihenfolge ist Vertrag: `toolApprovals` zuerst,
 * weil eine Freigabe-Antwort NIE als Klärungsantwort gelesen werden darf; danach
 * `toolName`, damit ein Client-Werkzeug nicht für eine ask_human-Antwort gilt.
 */
export interface ToolApprovalDecision {
  toolCallId: string;
  approved: boolean;
  optionId?: 'allow-once' | 'allow-always' | 'reject-once' | undefined;
  reason?: string | undefined;
}

export type ResumeInput =
  | { kind: 'tool_approval'; approvalTurnId?: string; decisions: ToolApprovalDecision[] }
  | { kind: 'ask_human'; answer: string }
  | { kind: 'client_tool'; toolName: string; result: unknown };

export function resolveResumeInput(body: {
  resume?: string | undefined;
  toolName?: string | undefined;
  result?: unknown;
  approvalTurnId?: string | undefined;
  toolApprovals?: ToolApprovalDecision[] | undefined;
}): ResumeInput | null {
  if (Array.isArray(body.toolApprovals) && body.toolApprovals.length > 0) {
    return {
      kind: 'tool_approval',
      ...(body.approvalTurnId != null && { approvalTurnId: body.approvalTurnId }),
      decisions: body.toolApprovals,
    };
  }
  if (typeof body.toolName === 'string' && body.toolName.length > 0) {
    return { kind: 'client_tool', toolName: body.toolName, result: body.result };
  }
  if (typeof body.resume === 'string') {
    return { kind: 'ask_human', answer: body.resume };
  }
  return null;
}
