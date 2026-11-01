/**
 * Guards the pnpm patch on `expo` (see `patchedDependencies` in
 * pnpm-workspace.yaml): a DOM component sends its props to the webview only
 * when they change or when the page reports `DOM_READY`, never on mount. Each
 * send is a synchronous main-thread hop, and the math rows mount one webview
 * per formula.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { createElement } from 'react';

type WebViewMessage = { nativeEvent: { data: string } };

const mockInjectJavaScript = jest.fn();
let mockOnMessage: ((event: WebViewMessage) => void) | null = null;

jest.mock('@expo/dom-webview', () => ({
  WebView: (props: { ref: { current: unknown }; onMessage: (event: WebViewMessage) => void }) => {
    props.ref.current = { injectJavaScript: mockInjectJavaScript };
    mockOnMessage = props.onMessage;
    return null;
  },
}));
jest.mock('react-native/Libraries/Core/Devtools/getDevServer', () => ({
  __esModule: true,
  default: () => ({ url: 'http://localhost:8081' }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { WebView } = require('expo/dom/internal') as {
  WebView: (props: Record<string, unknown>) => null;
};

const mathView = (content: string) =>
  createElement(WebView, { filePath: 'MathViewDOM.tsx', content, fontSize: 16 });

const propsMessages = () =>
  mockInjectJavaScript.mock.calls
    .map(([script]) => String(script))
    .filter((script) => script.includes('$$props'));

describe('expo DOM component props emit', () => {
  beforeEach(() => {
    mockInjectJavaScript.mockClear();
    mockOnMessage = null;
  });

  it('does not send props on mount', async () => {
    await render(mathView('E = mc^2'));
    expect(propsMessages()).toHaveLength(0);
  });

  it('does not resend unchanged props on a re-render', async () => {
    const view = await render(mathView('E = mc^2'));
    await view.rerender(mathView('E = mc^2'));
    expect(propsMessages()).toHaveLength(0);
  });

  it('sends changed props', async () => {
    const view = await render(mathView('E = mc^2'));
    await view.rerender(mathView('a^2 + b^2'));
    expect(propsMessages()).toHaveLength(1);
    expect(propsMessages()[0]).toContain('a^2 + b^2');
  });

  it('sends the current props once the page is ready', async () => {
    await render(mathView('E = mc^2'));
    await act(() =>
      mockOnMessage?.({
        nativeEvent: { data: JSON.stringify({ type: '$$dom_ready', data: null }) },
      })
    );
    expect(propsMessages()).toHaveLength(1);
    expect(propsMessages()[0]).toContain('E = mc^2');
  });
});
