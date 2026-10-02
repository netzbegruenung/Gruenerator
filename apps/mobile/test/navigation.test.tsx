/**
 * Stack shape on the way back — the thing no screen test sees. Each case
 * renders a router whose layouts and redirects are the app's own files (the
 * screens are stubs) and asserts where `router.back()` lands.
 *
 * `expo-router` is mocked globally in `jest.setup.ts`; this file needs the
 * real one.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { renderRouter, act } from 'expo-router/testing-library';
import { Text } from 'react-native';

import FocusedLayout from '../app/(focused)/_layout';
import LegacyImageStudioRoute from '../app/(focused)/image-studio';
import LegacyImageStudioGalleryRoute from '../app/(focused)/image-studio/gallery';
import LegacyImageStudioCreateRoute from '../app/(focused)/image-studio-create/[...rest]';
import LegacyKiBildgenerierungRoute from '../app/(focused)/ki-bildgenerierung';
import LegacyNotebookChatRoute from '../app/(focused)/notebook-chat';
import LegacyNotebookDetailRoute from '../app/(focused)/notebook-detail';
import LegacyResearchRoute from '../app/(focused)/research';
import LegacyAllThreadsRoute from '../app/(fullscreen)/all-threads';
import LegacyImageStudioEditorRoute from '../app/(fullscreen)/image-studio-editor';
import LegacyWebviewEditorRoute from '../app/(fullscreen)/webview-editor';
import HomeLayout from '../app/(tabs)/_layout';
import * as NotebookLayout from '../app/notebook/[id]/_layout';
import { routeWithParams } from '../types/routes';
import { goHome } from '../utils/navigation';
import { threadRoute } from '../utils/threadRoute';

// Hoisted above the imports by babel-jest.
jest.unmock('expo-router');

const Stub = () => <Text>stub</Text>;

/** The notebook page's own params, as the real page reads them. */
let notebookPageParams: Record<string, unknown> = {};
const NotebookPage = () => {
  notebookPageParams = useLocalSearchParams();
  return <Text>notebook</Text>;
};

const tree = {
  _layout: () => <Stack />,
  '(tabs)/_layout': HomeLayout,
  '(tabs)/start': Stub,
  '(focused)/_layout': FocusedLayout,
  // Alphabetically first in `(focused)` — the screen a misplaced anchor slides in.
  '(focused)/agents': Stub,
  '(focused)/chat-conversation': Stub,
  '(focused)/reel': Stub,
  '(focused)/scanner': Stub,
  '(focused)/vorlagen': Stub,
  '(focused)/wissen': Stub,
  '(fullscreen)/_layout': () => <Stack />,
  '(fullscreen)/subtitle-editor': Stub,
  '(focused)/bild-editor': Stub,
  '(focused)/ki-bildgenerierung': LegacyKiBildgenerierungRoute,
  '(focused)/image-studio/index': LegacyImageStudioRoute,
  '(focused)/image-studio/gallery': LegacyImageStudioGalleryRoute,
  '(focused)/image-studio-create/[...rest]': LegacyImageStudioCreateRoute,
  '(focused)/research': LegacyResearchRoute,
  '(fullscreen)/all-threads': LegacyAllThreadsRoute,
  '(fullscreen)/image-studio-editor': LegacyImageStudioEditorRoute,
  '(fullscreen)/webview-editor': LegacyWebviewEditorRoute,
  '(focused)/notebook-chat': LegacyNotebookChatRoute,
  '(focused)/notebook-detail': LegacyNotebookDetailRoute,
  'notebook/[id]/_layout': NotebookLayout,
  'notebook/[id]/index': NotebookPage,
  'notebook/[id]/chat': Stub,
};

type Route = { name: string; state?: { routes: Route[] } };
/** `[(tabs)[start], notebook/[id][index, chat]]` — the root stack, nested. */
function shape(state: { routes: Route[] } | undefined): string {
  if (!state) return '';
  return `[${state.routes.map((r) => r.name + shape(r.state)).join(', ')}]`;
}
function rootShape(r: ReturnType<typeof renderRouter>): string {
  const root = r.getRouterState() as { routes: Route[] } | undefined;
  return shape(root?.routes[0]?.state);
}

const openThread = (thread: Parameters<typeof threadRoute>[0]) => {
  const { href, withAnchor } = threadRoute(thread);
  router.push(href, { withAnchor });
};

describe('notebook chat: back always leads to the notebook (#4017)', () => {
  beforeEach(() => {
    notebookPageParams = {};
  });

  it('a cold link to the chat opens with the notebook page beneath it', () => {
    const r = renderRouter(tree, { initialUrl: '/notebook/berlin-notebook/chat' });
    expect(rootShape(r)).toBe('[notebook/[id][index, chat]]');
    act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
  });

  it('a notebook thread opened from the start page backs into its notebook, then home', () => {
    const r = renderRouter(tree, { initialUrl: '/start' });
    act(() =>
      openThread({ id: 't1', threadType: 'notebook', notebookCollectionId: 'berlin-system' })
    );
    expect(r.getPathname()).toBe('/notebook/berlin-notebook/chat');
    expect(rootShape(r)).toBe('[(tabs)[start], notebook/[id][index, chat]]');
    act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
    // The page the anchor made knows which notebook it is.
    expect(notebookPageParams).toMatchObject({ id: 'berlin-notebook' });
    act(() => router.back());
    expect(r.getPathname()).toBe('/start');
  });

  it('a notebook thread opened from a chat backs into its notebook, then the chat', () => {
    const r = renderRouter(tree, { initialUrl: '/start' });
    act(() => router.push('/chat-conversation'));
    act(() =>
      openThread({ id: 't1', threadType: 'notebook', notebookCollectionId: 'berlin-system' })
    );
    act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
    act(() => router.back());
    expect(r.getPathname()).toBe('/chat-conversation');
  });

  it('a question asked on the notebook page backs onto that same page, no second copy', () => {
    const r = renderRouter(tree, { initialUrl: '/start' });
    act(() => router.push(routeWithParams('/notebook/[id]', { id: 'berlin-notebook' })));
    act(() => router.push(routeWithParams('/notebook/[id]/chat', { id: 'berlin-notebook' })));
    expect(rootShape(r)).toBe('[(tabs)[start], notebook/[id][index, chat]]');
    act(() => router.back());
    act(() => router.back());
    expect(r.getPathname()).toBe('/start');
  });

  it('a plain chat thread gets no anchor slid in beneath it', () => {
    const r = renderRouter(tree, { initialUrl: '/start' });
    act(() => openThread({ id: 't3', threadType: 'chat' }));
    expect(rootShape(r)).toBe('[(tabs)[start], (focused)[chat-conversation]]');
  });
});

describe('legacy notebook paths keep resolving', () => {
  it('/notebook-chat redirects into the nested chat, notebook beneath', () => {
    const r = renderRouter(tree, {
      initialUrl: '/notebook-chat?notebookId=berlin-notebook&threadId=t1',
    });
    expect(r.getPathname()).toBe('/notebook/berlin-notebook/chat');
    expect(r.getSearchParams()).toMatchObject({ threadId: 't1' });
    act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
    expect(notebookPageParams).toMatchObject({ id: 'berlin-notebook' });
  });

  it('/notebook-detail redirects to the notebook page', () => {
    const r = renderRouter(tree, {
      initialUrl: '/notebook-detail?notebookId=berlin-notebook&kind=system',
    });
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
  });
});

describe('tools and Wissen open on a stack, not as hidden tabs', () => {
  it('each tool backs out to home, and the next one does not sit on the last', () => {
    const r = renderRouter(tree, { initialUrl: '/start' });
    act(() => router.push('/(focused)/scanner'));
    act(() => router.back());
    expect(r.getPathname()).toBe('/start');
    act(() => router.push('/(focused)/reel'));
    expect(rootShape(r)).toBe('[(tabs)[start], (focused)[reel]]');
    act(() => router.back());
    expect(r.getPathname()).toBe('/start');
  });

  it('Vorlagen and Wissen have a screen to go back to', () => {
    const r = renderRouter(tree, { initialUrl: '/start' });
    for (const path of ['/(focused)/vorlagen', '/(focused)/wissen'] as const) {
      act(() => router.push(path));
      expect(router.canGoBack()).toBe(true);
      act(() => router.back());
      expect(r.getPathname()).toBe('/start');
    }
  });

  it('the tool paths are unchanged by the move (F0)', () => {
    expect(renderRouter(tree, { initialUrl: '/vorlagen' }).getPathname()).toBe('/vorlagen');
  });
});

describe('going home leaves exactly one home', () => {
  it('from a fullscreen editor above a tool', () => {
    const r = renderRouter(tree, { initialUrl: '/start' });
    act(() => router.push('/(focused)/reel'));
    act(() => router.push('/(fullscreen)/subtitle-editor'));
    act(() => goHome());
    expect(rootShape(r)).toBe('[(tabs)[start]]');
  });

  it('from a cold link', () => {
    const r = renderRouter(tree, { initialUrl: '/subtitle-editor' });
    act(() => goHome());
    expect(rootShape(r)).toBe('[(tabs)[start]]');
  });
});

describe('retired screens keep their URLs (#4025)', () => {
  it.each([
    ['/ki-bildgenerierung', '/bild-editor'],
    ['/image-studio', '/bild-editor'],
    ['/image-studio/gallery', '/start'],
    ['/image-studio-create/ki-input', '/bild-editor'],
    ['/image-studio-create/result', '/bild-editor'],
    ['/image-studio-editor', '/bild-editor'],
    ['/webview-editor', '/bild-editor'],
    ['/research', '/wissen'],
    ['/all-threads', '/start'],
  ])('%s lands on %s', (from, to) => {
    const r = renderRouter(tree, { initialUrl: from });
    expect(r.getPathname()).toBe(to);
  });
});
