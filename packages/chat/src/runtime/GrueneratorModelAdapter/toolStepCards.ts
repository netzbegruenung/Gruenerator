import { formatNamespacedToolLabel } from '../../lib/toolMappings';

import type { ToolCallPart } from './types';

/** Display titles for agentic loop steps (tool_step_start events). */
const TOOL_STEP_TITLES: Record<string, string> = {
  read_sharepic_state: 'Lese aktuellen Zustand…',
  apply_sharepic_ops: 'Wende Änderung an…',
  restore_version: 'Stelle Version wieder her…',
  rezept_laden: 'Lade Schreibvorgaben…',
};

/** `tool_step_start` payload of the agentic loop. */
export interface ToolStepStartData {
  stepId: string;
  toolName: string;
  args?: Record<string, unknown>;
  title?: string;
  serverName?: string;
  narration?: string;
}

/** `tool_step_result` payload of the agentic loop. */
export interface ToolStepResultData {
  stepId: string;
  toolName: string;
  ok: boolean;
  summary?: string;
  result?: Record<string, unknown>;
}

/**
 * The card title: a server-provided title; else the legacy mcpToolNode
 * `mcp_tool` server/tool label; else the sharepic-specific map; else a generic
 * label derived from the (possibly MCP-namespaced) name.
 */
export function toolStepTitle(data: ToolStepStartData): string {
  const { toolName, args, title, serverName } = data;
  return (
    title ??
    (toolName === 'mcp_tool'
      ? `${(args?.server as string) ?? 'MCP'}${args?.tool ? ` · ${args.tool as string}` : ''}`
      : (TOOL_STEP_TITLES[toolName] ?? `${formatNamespacedToolLabel(toolName, serverName)}…`))
  );
}

/** A fresh, result-less card for a `tool_step_start`. */
export function buildToolStepCard(
  data: ToolStepStartData,
  title: string,
  narration?: string
): ToolCallPart {
  const toolArgs = { query: title, ...(data.args ?? {}) };
  return {
    type: 'tool-call',
    toolCallId: data.stepId,
    toolName: data.toolName,
    args: toolArgs as Record<string, string | number | boolean | null>,
    argsText: JSON.stringify(toolArgs),
    ...(narration ? { narration } : {}),
  };
}

/**
 * Stamp a `tool_step_result` onto its card. Returns a NEW card (replace by
 * identity so memoized consumers re-render). The rich per-tool result is kept
 * so the tool-ui card renders from the real tool output; `ok`/`summary` are
 * folded in for the generic status chip. A system MCP tool may ship an MCP-Apps
 * widget: its `ui://` pointer is lifted onto `mcp.app` so assistant-ui's mcpApp
 * renderer mounts the sandboxed widget iframe in place of the normal card.
 */
export function applyToolStepResult(card: ToolCallPart, data: ToolStepResultData): ToolCallPart {
  const { ok, summary, result } = data;
  const uiResource = (result as { uiResource?: { uri?: unknown; mimeType?: unknown } })?.uiResource;
  const widgetUri =
    uiResource && typeof uiResource.uri === 'string' && uiResource.uri.startsWith('ui://')
      ? uiResource.uri
      : null;
  return {
    ...card,
    result: { ...(result ?? {}), ok, ...(summary ? { summary } : {}) },
    ...(widgetUri
      ? {
          mcp: {
            app: {
              resourceUri: widgetUri,
              ...(typeof uiResource?.mimeType === 'string'
                ? { mimeType: uiResource.mimeType }
                : {}),
            },
          },
        }
      : {}),
  };
}

/** The status-line message once a step reports back. */
export function toolStepResultMessage(data: ToolStepResultData): string {
  return data.summary ?? (data.ok ? 'Änderung angewendet' : 'Schritt fehlgeschlagen');
}
