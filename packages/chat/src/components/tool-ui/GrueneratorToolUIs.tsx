'use client';

import { useAuiState } from '@assistant-ui/react';
import { type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { useShallow } from 'zustand/shallow';

import { selectApprovalLabels, type PartLike } from '../../lib/narrationView';
import { UI_TOOL_NAMES, type UiToolName } from '../../lib/toolRegistry';
import { isSearchProgressTool } from '../../lib/toolStatusLine';
import { ToolNarration } from '../message-parts/ToolNarration';
import { ToolCallUI } from '../ToolCallUI';

import { AskHumanToolUI } from './AskHumanToolUI';
import { McpToolUI } from './McpToolUI';
import { PressemitteilungExamplesToolRender } from './PressemitteilungExamplesToolRender';
import { ResearchToolRender } from './ResearchToolRender';
import { RunPythonToolUI } from './RunPythonToolUI';
import { ToolApprovalCard, type ToolApprovalState } from './ToolApprovalCard';

import type { Toolkit } from '@assistant-ui/react';

// The persistent planner narration (split-gather mode) renders above every tool
// card, whatever its dedicated renderer, so the between-tool prose stays visible
// in document order. `toolCallId` is always present on assistant-ui's render
// props; ToolNarration no-ops when the part carries no narration.
type ToolRender = NonNullable<Toolkit[string]['render']>;
type ToolRenderProps = ComponentProps<ToolRender>;

function withNarration(render: (props: ToolRenderProps) => ReactNode): ToolRender {
  const Wrapped: ComponentType<ToolRenderProps> = (props) => (
    <>
      <ToolNarration toolCallId={props.toolCallId} />
      {renderApproval(props) ?? render(props)}
    </>
  );
  return Wrapped;
}

/**
 * Trägt der Part ein Freigabe-Gate, ersetzt die Karte den normalen Render:
 * solange nichts entschieden ist, gibt es kein Ergebnis zu zeigen, und nach der
 * Entscheidung erzählt die Pille, was passiert ist.
 */
function renderApproval(props: ToolRenderProps): ReactNode {
  const approval = (props as { approval?: ToolApprovalState }).approval;
  if (!approval) return null;
  return <ApprovalGate {...props} approval={approval} />;
}

/**
 * Holt Anzeigename und Dienst vom rohen Part — derselbe Kanal wie bei
 * `ToolNarration`: assistant-uis typisierte Render-Props führen die beiden
 * Felder nicht, auf `message.parts` überleben sie live wie nach dem Reload.
 * Ohne sie zeigt die Karte nur den Katalognamen `m<key>__<tool>` und
 * verschweigt, welcher verbundene Dienst angesprochen wird.
 */
function ApprovalGate(props: ToolRenderProps & { approval: ToolApprovalState }): ReactNode {
  const labels = useAuiState(
    useShallow((s) =>
      selectApprovalLabels((s.message?.parts ?? []) as ReadonlyArray<PartLike>, props.toolCallId)
    )
  );
  return (
    <ToolApprovalCard
      toolName={props.toolName}
      args={(props.args ?? {}) as Record<string, unknown>}
      approval={props.approval}
      respondToApproval={props.respondToApproval}
      {...(labels.title != null && { title: labels.title })}
      {...(labels.serverName != null && { serverName: labels.serverName })}
    />
  );
}

function createToolRender(toolName: string) {
  return ({ args, result }: ToolRenderProps) => (
    <ToolCallUI
      toolName={toolName}
      args={args ?? {}}
      state={result ? 'result' : 'call'}
      result={result}
    />
  );
}

// Tools with a dedicated render (own loading state or interactive flow);
// everything else in UI_TOOL_NAMES routes through ToolCallUI → registry.
const DEDICATED_RENDERS: Partial<Record<UiToolName, (props: ToolRenderProps) => ReactNode>> = {
  research: ({ args, result }) => <ResearchToolRender args={args ?? {}} result={result} />,
  gruenerator_pressemitteilung_examples: ({ args, result }) => (
    <PressemitteilungExamplesToolRender args={args ?? {}} result={result} />
  ),
  ask_human: ({ args, result, addResult }) => (
    <AskHumanToolUI args={args ?? {}} result={result} addResult={addResult} />
  ),
  run_python: ({ args, result }) => <RunPythonToolUI args={args ?? {}} result={result} />,
  mcp_tool: ({ args, result }) => <McpToolUI args={args ?? {}} result={result} />,
};

// Retrieval steps report through the shimmering status line above the message
// (StreamingStatusLine → selectSearchStatusLabel), so they draw no card at all.
// Their narration is prose, not chrome, and still renders in document order.
const renderNothing = () => null;

export const grueneratorToolkit: Toolkit = Object.fromEntries(
  UI_TOOL_NAMES.options.map((name) => [
    name,
    {
      render: withNarration(
        isSearchProgressTool(name)
          ? renderNothing
          : (DEDICATED_RENDERS[name] ?? createToolRender(name))
      ),
    },
  ])
);

/**
 * Für Werkzeuge, deren Namen erst zur Laufzeit entstehen — die Konnektor-Werkzeuge
 * heissen `m<serverKey>__<tool>` und stehen in keiner Registry. Ohne diesen
 * Eintrag rendert assistant-ui sie gar nicht: weder Karte noch Freigabe.
 */
export const GrueneratorToolFallback: ToolRender = withNarration((props) => (
  <ToolCallUI
    toolName={props.toolName}
    args={props.args ?? {}}
    state={props.result ? 'result' : 'call'}
    result={props.result}
  />
));
