/**
 * The Streamdown component map is a plain object, so every override receives
 * the hast `node` prop (the legacy react-markdown map goes through
 * memoizeMarkdownComponents, which strips it). An override that spreads its
 * rest props onto a DOM element must drop `node` first, or React sets
 * node="[object Object]" on the element.
 *
 * Fenced code is told apart by the wrapper's `data-block` marker, not by a
 * `language-*` class — the block path is covered in StreamdownCodeBlock.vitest.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { streamdownComponents } from './streamdownComponents';

const hastNode = { type: 'element', tagName: 'code', properties: {}, children: [] };

describe('streamdownComponents.code', () => {
  it('renders inline code without leaking the hast node onto the element', () => {
    const Code = streamdownComponents.code;
    const { container } = render(
      <Code className="" node={hastNode}>
        arr[1]
      </Code>
    );
    const el = container.querySelector('code');
    expect(el).toHaveTextContent('arr[1]');
    expect(el?.hasAttribute('node')).toBe(false);
  });

  it('treats a code element without the data-block marker as inline, whatever its class', () => {
    const Code = streamdownComponents.code;
    const { container } = render(
      <Code className="language-python" node={hastNode}>
        x
      </Code>
    );
    expect(container.querySelector('code')).toHaveClass('bg-code-inline-bg');
    expect(container.querySelector('[data-streamdown="code-block"]')).toBeNull();
  });
});
