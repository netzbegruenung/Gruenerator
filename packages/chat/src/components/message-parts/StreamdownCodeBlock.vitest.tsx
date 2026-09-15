/**
 * The Streamdown renderer draws fenced code in Streamdown's own chrome
 * (CodeBlock: container, language header, actions bar) with our Pyodide
 * actions added to that bar. These tests pin the dispatch (chart / mermaid /
 * code), the `controls.code` switch and the spreadsheet collapse + auto-run,
 * rendering the block directly — Streamdown's context defaults stand in for
 * the primitive.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StreamdownContext, type StreamdownContextType } from 'streamdown';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamdownComponents } from '../../lib/streamdownComponents';
import { useChatConfigStore, type RunPython } from '../../stores/chatConfigStore';
import { usePythonFileStore } from '../../stores/pythonFileStore';

import { StreamdownCodeBlock } from './StreamdownCodeBlock';

const actionButtons = (container: HTMLElement) =>
  container.querySelectorAll('[data-streamdown="code-block-actions"] button');

afterEach(() => {
  useChatConfigStore.getState().configure();
  usePythonFileStore.getState().clear();
});

describe('StreamdownCodeBlock', () => {
  it('renders a fenced block in Streamdown chrome with copy and download controls', () => {
    const { container } = render(<StreamdownCodeBlock code="print(1)" language="python" />);

    const block = container.querySelector('[data-streamdown="code-block"]');
    expect(block).toHaveAttribute('data-language', 'python');
    expect(container.querySelector('[data-streamdown="code-block-header"]')).toHaveTextContent(
      'python'
    );
    expect(container).toHaveTextContent('print(1)');
    expect(container.querySelector('[data-streamdown="code-block-copy-button"]')).not.toBeNull();
    expect(actionButtons(container)).toHaveLength(2);
    // No Run button without a host-injected runPython.
    expect(screen.queryByRole('button', { name: 'Code ausführen' })).toBeNull();
  });

  it('hides the copy and download controls when controls.code is off', () => {
    const context: StreamdownContextType = {
      codeBlockMaxHeight: 400,
      controls: { code: false },
      isAnimating: false,
      lineNumbers: true,
      mode: 'streaming',
      shikiTheme: ['github-light', 'github-dark'],
      tableMaxHeight: 300,
    };
    const { container } = render(
      <StreamdownContext.Provider value={context}>
        <StreamdownCodeBlock code="print(1)" language="python" />
      </StreamdownContext.Provider>
    );

    expect(container.querySelector('[data-streamdown="code-block"]')).not.toBeNull();
    expect(container.querySelector('[data-streamdown="code-block-actions"]')).toBeNull();
  });

  it('offers "Ausführen" for python once the host injected runPython', async () => {
    const runPython = vi.fn<RunPython>().mockResolvedValue({
      ok: true,
      stdout: '42',
      figures: [],
      files: [],
      error: null,
      traceback: null,
      durationMs: 1,
    });
    useChatConfigStore.getState().configure({ runPython });
    const user = userEvent.setup();
    const { container } = render(<StreamdownCodeBlock code="print(42)" language="python" />);

    await user.click(screen.getByRole('button', { name: 'Code ausführen' }));

    expect(runPython).toHaveBeenCalledWith('print(42)', [], expect.anything());
    expect(await screen.findByText('Ergebnis')).toBeInTheDocument();
    expect(container).toHaveTextContent('42');
  });

  it('collapses a spreadsheet script by default, auto-runs it once and shows the result', async () => {
    const runPython = vi.fn<RunPython>().mockResolvedValue({
      ok: true,
      stdout: 'Summe: 7',
      figures: [],
      files: [],
      error: null,
      traceback: null,
      durationMs: 1,
    });
    useChatConfigStore.getState().configure({ runPython });
    usePythonFileStore
      .getState()
      .setFile({ name: 'umsatz.csv', mimeType: 'text/csv', bytes: new ArrayBuffer(0) });
    const user = userEvent.setup();
    // Mis-tagged fence (no language) that operates on the pre-loaded df.
    const { container } = render(<StreamdownCodeBlock code="print(df.sum())" language="text" />);

    // Treated as python for the header, body hidden until expanded.
    expect(container.querySelector('[data-streamdown="code-block"]')).toHaveAttribute(
      'data-language',
      'python'
    );
    expect(container.querySelector('[data-streamdown="code-block-body"]')).toHaveClass('hidden');
    expect(await screen.findByText('Summe: 7')).toBeInTheDocument();
    expect(runPython).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Code anzeigen/ }));
    expect(container.querySelector('[data-streamdown="code-block-body"]')).not.toHaveClass(
      'hidden'
    );
  });

  it('renders a mermaid block in the same container with its header', () => {
    const { container } = render(<StreamdownCodeBlock code="graph TD; A-->B" language="mermaid" />);

    expect(container.querySelector('[data-streamdown="code-block"]')).toHaveAttribute(
      'data-language',
      'mermaid'
    );
    expect(container.querySelector('[data-streamdown="code-block-header"]')).toHaveTextContent(
      'mermaid'
    );
    // Raw source shows until beautiful-mermaid has rendered.
    expect(container).toHaveTextContent('graph TD; A-->B');
  });

  it('renders a chart payload as a chart, not as a code block', () => {
    const payload = JSON.stringify({ type: 'bar', data: [], xKey: 'x', yKeys: ['y'] });
    const { container } = render(<StreamdownCodeBlock code={payload} language="chart" />);

    expect(container.querySelector('[data-streamdown="code-block"]')).toBeNull();
  });
});

describe('streamdownComponents.code → StreamdownCodeBlock', () => {
  it('dispatches a data-block code element to the Streamdown chrome', () => {
    const Code = streamdownComponents.code;
    const { container } = render(
      <Code className="language-py" data-block="true" node={{ type: 'element' }}>
        {'print(1)\n'}
      </Code>
    );

    expect(container.querySelector('[data-streamdown="code-block"]')).toHaveAttribute(
      'data-language',
      'python'
    );
  });
});
