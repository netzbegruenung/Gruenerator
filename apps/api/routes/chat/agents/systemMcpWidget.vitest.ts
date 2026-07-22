import { describe, it, expect } from 'vitest';

import { resolveWidgetUri } from './systemMcpCatalog.js';

describe('resolveWidgetUri', () => {
  it('finds the OpenAI Apps SDK outputTemplate pointer on the result meta', () => {
    expect(
      resolveWidgetUri(undefined, { 'openai/outputTemplate': 'ui://widget/map.html' }, undefined)
    ).toBe('ui://widget/map.html');
  });

  it('finds the OpenAI Apps SDK pointer on the tool meta', () => {
    expect(
      resolveWidgetUri({ 'openai/outputTemplate': 'ui://widget/x.html' }, undefined, undefined)
    ).toBe('ui://widget/x.html');
  });

  it('finds the MCP-Apps ui.resourceUri convention', () => {
    expect(resolveWidgetUri({ ui: { resourceUri: 'ui://w/a.html' } }, undefined, undefined)).toBe(
      'ui://w/a.html'
    );
  });

  it('falls back to a ui:// resource block', () => {
    expect(
      resolveWidgetUri(undefined, undefined, [
        { uri: 'https://x' },
        { uri: 'ui://w/embedded.html' },
      ])
    ).toBe('ui://w/embedded.html');
  });

  it('prefers the result meta over the tool meta', () => {
    expect(
      resolveWidgetUri(
        { 'openai/outputTemplate': 'ui://tool.html' },
        { 'openai/outputTemplate': 'ui://result.html' },
        undefined
      )
    ).toBe('ui://result.html');
  });

  it('returns null when no ui:// pointer exists', () => {
    expect(resolveWidgetUri(undefined, undefined, undefined)).toBeNull();
    expect(
      resolveWidgetUri({ 'openai/outputTemplate': 'https://not-ui' }, undefined, [])
    ).toBeNull();
    expect(
      resolveWidgetUri({ ui: { resourceUri: 'http://x' } }, {}, [{ uri: 'https://y' }])
    ).toBeNull();
  });
});
