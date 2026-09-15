/**
 * The Streamdown component map is a plain object, so every override receives
 * the hast `node` prop (the legacy react-markdown map goes through
 * memoizeMarkdownComponents, which strips it). An override that spreads its
 * rest props onto a DOM element must drop `node` first, or React sets
 * node="[object Object]" on the element.
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

  it('renders fenced code with its language class and without the node attribute', () => {
    const Code = streamdownComponents.code;
    const { container } = render(
      <Code className="language-python" node={hastNode}>
        print(1)
      </Code>
    );
    const el = container.querySelector('code');
    expect(el).toHaveClass('language-python');
    expect(el?.hasAttribute('node')).toBe(false);
  });
});
