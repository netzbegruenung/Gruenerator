/**
 * Discriminates a chat-graph resume request into the two supported kinds:
 *
 * - `ask_human`  — a human answered a clarification (legacy; body carries `resume`).
 * - `client_tool` — a client-executed tool (e.g. run_python) produced a result
 *   (body carries `toolName` + `result`).
 *
 * Pure and side-effect-free so the resume routing stays regression-tested as new
 * client tools are added. `toolName` takes precedence, so an explicit client-tool
 * resume is never mistaken for an ask_human answer.
 */
export type ResumeInput =
  | { kind: 'ask_human'; answer: string }
  | { kind: 'client_tool'; toolName: string; result: unknown };

export function resolveResumeInput(body: {
  resume?: string | undefined;
  toolName?: string | undefined;
  result?: unknown;
}): ResumeInput | null {
  if (typeof body.toolName === 'string' && body.toolName.length > 0) {
    return { kind: 'client_tool', toolName: body.toolName, result: body.result };
  }
  if (typeof body.resume === 'string') {
    return { kind: 'ask_human', answer: body.resume };
  }
  return null;
}
