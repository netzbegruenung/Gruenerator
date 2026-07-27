import { describe, expect, it } from 'vitest';

import { actionUrlToRoute, documentIdFromUrl } from './actionUrl';

/**
 * Backend `action_url`s are web paths. Getting the document ones wrong sends a
 * notification tap to a route expo-router has no screen for, and the tap does
 * nothing — the regression behind `d9234a224 route mobile notification links`.
 */

describe('documentIdFromUrl', () => {
  it.each(['/document/abc123', '/docs/abc123', '/office/abc123'])(
    'extracts the id from %s',
    (url) => {
      expect(documentIdFromUrl(url)).toBe('abc123');
    }
  );

  it('stops at a query string or hash', () => {
    expect(documentIdFromUrl('/document/abc123?tab=chat')).toBe('abc123');
    expect(documentIdFromUrl('/document/abc123#heading')).toBe('abc123');
  });

  it('stops at a nested path segment', () => {
    expect(documentIdFromUrl('/office/abc123/versions')).toBe('abc123');
  });

  it('handles Notion-style slugs, which carry dashes', () => {
    expect(documentIdFromUrl('/document/kampagnenplan-berlin-a1b2c3')).toBe(
      'kampagnenplan-berlin-a1b2c3'
    );
  });

  it('returns null for non-document routes', () => {
    expect(documentIdFromUrl('/chat/thread-1')).toBeNull();
    expect(documentIdFromUrl('/gruppen/42')).toBeNull();
  });

  it('anchors at the start — a document path nested deeper is not a match', () => {
    expect(documentIdFromUrl('/share/document/abc123')).toBeNull();
  });

  it('returns null when the id is missing', () => {
    expect(documentIdFromUrl('/document/')).toBeNull();
    expect(documentIdFromUrl('/document')).toBeNull();
  });

  it('does not match a prefix that merely starts the same', () => {
    expect(documentIdFromUrl('/documents/abc123')).toBeNull();
  });
});

describe('actionUrlToRoute', () => {
  it('routes a document url to the fullscreen editor with the id as a param', () => {
    expect(actionUrlToRoute('/office/abc123?tab=chat')).toEqual({
      pathname: '/(fullscreen)/doc-editor',
      params: { id: 'abc123' },
    });
  });

  it('passes any other path straight through', () => {
    expect(actionUrlToRoute('/chat/thread-1')).toBe('/chat/thread-1');
  });
});
