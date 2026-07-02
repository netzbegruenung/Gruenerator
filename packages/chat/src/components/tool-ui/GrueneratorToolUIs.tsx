'use client';

import type { Toolkit } from '@assistant-ui/react';
import { ToolCallUI } from '../ToolCallUI';
import { AskHumanToolUI } from './AskHumanToolUI';
import { RunPythonToolUI } from './RunPythonToolUI';
import { PressemitteilungExamplesToolRender } from './PressemitteilungExamplesToolRender';
import { ResearchToolRender } from './ResearchToolRender';
import { UI_TOOL_NAMES, type UiToolName } from '../../lib/toolRegistry';

function createToolRender(toolName: string) {
  return ({ args, result }: { args: Record<string, unknown>; result?: unknown }) => (
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
const DEDICATED_RENDERS: Partial<Record<UiToolName, Toolkit[string]>> = {
  research: {
    render: ({ args, result }) => <ResearchToolRender args={args ?? {}} result={result} />,
  },
  gruenerator_pressemitteilung_examples: {
    render: ({ args, result }) => (
      <PressemitteilungExamplesToolRender args={args ?? {}} result={result} />
    ),
  },
  ask_human: {
    render: ({ args, result, addResult }) => (
      <AskHumanToolUI args={args ?? {}} result={result} addResult={addResult} />
    ),
  },
  run_python: {
    render: ({ args, result }) => <RunPythonToolUI args={args ?? {}} result={result} />,
  },
};

export const grueneratorToolkit: Toolkit = Object.fromEntries(
  UI_TOOL_NAMES.options.map((name) => [
    name,
    DEDICATED_RENDERS[name] ?? { render: createToolRender(name) },
  ])
);
