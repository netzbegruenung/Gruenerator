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

  it('opens a chat thread in the chat', () => {
    expect(actionUrlToRoute('/chat/thread-1')).toEqual({
      pathname: '/(focused)/chat-conversation',
      params: { threadId: 'thread-1' },
    });
  });

  it.each(['/vorlagen', '/notebook/berlin-notebook', '/projekte/g1'])(
    'pushes %s unchanged — the app has a screen at that path',
    (url) => {
      expect(actionUrlToRoute(url)).toBe(url);
    }
  );

  it.each([
    '/boards/b1?card=c1',
    '/wiederkehrend?task=t1',
    '/notebooks/n1/bearbeiten',
    '/vorlagen-neu',
  ])('opens %s in the web viewer instead of an unmatched route', (url) => {
    expect(actionUrlToRoute(url)).toEqual({
      pathname: '/(fullscreen)/web-viewer',
      params: { path: url },
    });
  });
});

describe('actionUrlToRoute for projects', () => {
  it('maps legacy /gruppen/<id> links to the project screen', () => {
    expect(actionUrlToRoute('/gruppen/g1')).toEqual({
      pathname: '/(focused)/projekte/[id]',
      params: { id: 'g1' },
    });
  });

  it('maps a bare /gruppen to the project list', () => {
    expect(actionUrlToRoute('/gruppen')).toBe('/(focused)/projekte');
  });

  it('pushes /projekte/<id>?beitrag=<share> unchanged so the screen reads beitrag', () => {
    expect(actionUrlToRoute('/projekte/g1?beitrag=s1')).toBe('/projekte/g1?beitrag=s1');
  });
});
