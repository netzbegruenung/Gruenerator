'use client';

import type { Toolkit } from '@assistant-ui/react';
import { ToolCallUI } from '../ToolCallUI';

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

export const grueneratorToolkit: Toolkit = {
  gruenerator_search: { render: createToolRender('gruenerator_search') },
  web_search: { render: createToolRender('web_search') },
  research: { render: createToolRender('research') },
  gruenerator_examples_search: { render: createToolRender('gruenerator_examples_search') },
};
