import { render } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { UI_TOOL_NAMES } from '../../lib/toolRegistry';
import { isSearchProgressTool } from '../../lib/toolStatusLine';

import { grueneratorToolkit } from './GrueneratorToolUIs';

// The toolkit itself needs no assistant-ui runtime; only ToolNarration reads one.
// Stubbing the state hook is what lets a single tool render be exercised in
// isolation, which is the whole point of this guard.
vi.mock('@assistant-ui/react', () => ({ useAuiState: () => null }));

// ComponentProps, not Parameters<>: a render may legally be a class component,
// which has no call signature.
type RenderProps = ComponentProps<NonNullable<(typeof grueneratorToolkit)[string]['render']>>;

function renderTool(name: string, over: Partial<RenderProps> = {}) {
  const Render = grueneratorToolkit[name]?.render;
  if (!Render) throw new Error(`no render registered for ${name}`);
  const props = {
    toolCallId: `call-${name}`,
    toolName: name,
    args: {},
    argsText: '',
    status: { type: 'running' },
    addResult: () => {},
    ...over,
  } as unknown as RenderProps;
  return render(<Render {...props} />);
}

/**
 * Retrieval reports through the shimmering status line, never through a card —
 * that is the whole of #2213. The rule lives in exactly one expression in
 * `GrueneratorToolUIs.tsx`, and until now nothing held it: `isSearchProgressTool`
 * was unit-tested as a predicate, but not the fact that the toolkit obeys it. A
 * refactor could have re-attached a renderer and stayed green.
 */
describe('grueneratorToolkit — retrieval draws no card', () => {
  const searchTools = UI_TOOL_NAMES.options.filter((n) => isSearchProgressTool(n));

  it('covers the tools it claims to cover', () => {
    // Positive control for the loop below: an empty filter would make every
    // "renders nothing" assertion vacuously true.
    expect(searchTools).toContain('web_search');
    expect(searchTools.length).toBeGreaterThanOrEqual(4);
  });

  it.each(searchTools)('%s renders nothing while running', (name) => {
    expect(renderTool(name).container).toBeEmptyDOMElement();
  });

  it.each(searchTools)('%s renders nothing once it has a result', (name) => {
    const { container } = renderTool(name, {
      status: { type: 'complete' },
      result: { citations: [{ title: 'Treffer', url: 'https://example.org' }] },
    } as Partial<RenderProps>);
    expect(container).toBeEmptyDOMElement();
  });

  it('still draws a card for a non-retrieval tool', () => {
    // The counter-control: proves the harness renders at all, so the assertions
    // above measure the suppression rather than a broken setup.
    expect(renderTool('generate_image').container).not.toBeEmptyDOMElement();
  });
});
