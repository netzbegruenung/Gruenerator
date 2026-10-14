import { beforeEach, describe, expect, it } from 'vitest';

import { dropTabPayload, readTabPayload, tabUrl } from './tabHandoff';

describe('tabHandoff', () => {
  beforeEach(() => localStorage.clear());

  it('carries a payload to the page that follows the url, until it is dropped', () => {
    const url = tabUrl('/studio/freitext', { prompt: 'Hitze', photos: [] })!;
    const search = url.slice(url.indexOf('?'));
    expect(url.startsWith('/studio/freitext?handoff=')).toBe(true);
    expect(readTabPayload(search)).toEqual({ prompt: 'Hitze', photos: [] });
    expect(readTabPayload(search)).not.toBeNull();
    dropTabPayload(search);
    expect(readTabPayload(search)).toBeNull();
  });

  it('knows nothing without an id', () => {
    expect(readTabPayload('')).toBeNull();
    expect(readTabPayload('?handoff=nope')).toBeNull();
  });

  it('sweeps payloads nobody picked up', () => {
    localStorage.setItem('studio-handoff:old:1', '{}');
    tabUrl('/bild-editor', {});
    expect(localStorage.getItem('studio-handoff:old:1')).toBeNull();
  });
});
