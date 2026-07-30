'use client';

import { type ComponentProps, type ComponentType, type ReactNode } from 'react';

import { UI_TOOL_NAMES, type UiToolName } from '../../lib/toolRegistry';
import { isSearchProgressTool } from '../../lib/toolStatusLine';
import { ToolNarration } from '../message-parts/ToolNarration';
import { ToolCallUI } from '../ToolCallUI';

import { AskHumanToolUI } from './AskHumanToolUI';
import { McpToolUI } from './McpToolUI';
import { PressemitteilungExamplesToolRender } from './PressemitteilungExamplesToolRender';
import { ResearchToolRender } from './ResearchToolRender';
import { RunPythonToolUI } from './RunPythonToolUI';

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
      {render(props)}
    </>
  );
  return Wrapped;
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
