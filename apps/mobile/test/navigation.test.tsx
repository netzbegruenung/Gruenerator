/**
 * Stack shape on the way back — the thing no screen test sees. Each case
 * renders a router whose layouts and redirects are the app's own files (the
 * screens are stubs) and asserts where `router.back()` lands.
 *
 * `expo-router` is mocked globally in `jest.setup.ts`; this file needs the
 * real one.
 */
import { useAgentStore } from '@gruenerator/chat/stores';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { renderRouter, act } from 'expo-router/testing-library';
import { useContext } from 'react';
import { Text } from 'react-native';

import FocusedLayout from '../app/(focused)/_layout';
import LegacyImageStudioRoute from '../app/(focused)/image-studio';
import LegacyImageStudioGalleryRoute from '../app/(focused)/image-studio/gallery';
import LegacyImageStudioCreateRoute from '../app/(focused)/image-studio-create/[...rest]';
import LegacyKiBildgenerierungRoute from '../app/(focused)/ki-bildgenerierung';
import LegacyNotebookChatRoute from '../app/(focused)/notebook-chat';
import LegacyNotebookDetailRoute from '../app/(focused)/notebook-detail';
import LegacyResearchRoute from '../app/(focused)/research';
import LegacyStickerDiscoverRoute from '../app/(focused)/sticker-entdecken';
import LegacyAllThreadsRoute from '../app/(fullscreen)/all-threads';
import LegacyImageStudioEditorRoute from '../app/(fullscreen)/image-studio-editor';
import LegacyWebviewEditorRoute from '../app/(fullscreen)/webview-editor';
import HomeLayout from '../app/(tabs)/_layout';
import NotFoundScreen from '../app/+not-found';
import * as NotebookLayout from '../app/notebook/[id]/_layout';
import { NotebookIdContext } from '../components/notebook/NotebookIdContext';
import { useChatAgentSelection } from '../hooks/useChatAgentSelection';
import { routeWithParams } from '../types/routes';
import { goHome } from '../utils/navigation';
import { threadRoute } from '../utils/threadRoute';

// Hoisted above the imports by babel-jest.
jest.unmock('expo-router');

const Stub = () => <Text>stub</Text>;

/**
 * The notebook id the page gets, as the real page reads it: the anchor page has
 * no params of its own (and expo-router 58 dropped `initialParams`), so the
 * layout hands the id down through `NotebookIdContext`.
 */
const notebookPageParams = jest.fn();
const NotebookPage = () => {
  notebookPageParams({ id: useContext(NotebookIdContext) });
  return <Text>notebook</Text>;
};

const tree = {
  _layout: () => <Stack />,
  '+not-found': NotFoundScreen,
  '(tabs)/_layout': HomeLayout,
  '(tabs)/start': Stub,
  '(focused)/_layout': FocusedLayout,
  // Alphabetically first in `(focused)` — the screen a misplaced anchor slides in.
  '(focused)/agents': Stub,
  '(focused)/chat-conversation': Stub,
  '(focused)/reel': Stub,
  '(focused)/scanner': Stub,
  '(focused)/vorlagen': Stub,
  '(focused)/marktplatz': Stub,
  '(focused)/sticker-entdecken': LegacyStickerDiscoverRoute,
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
function rootShape(r: Awaited<ReturnType<typeof renderRouter>>): string {
  const root = r.getRouterState() as { routes: Route[] } | undefined;
  return shape(root?.routes[0]?.state);
}

const openThread = (thread: Parameters<typeof threadRoute>[0]) => {
  const { href, withAnchor } = threadRoute(thread);
  router.push(href, { withAnchor });
};

describe('notebook chat: back always leads to the notebook (#4017)', () => {
  beforeEach(() => {
    notebookPageParams.mockClear();
  });

  it('a cold link to the chat opens with the notebook page beneath it', async () => {
    const r = await renderRouter(tree, { initialUrl: '/notebook/berlin-notebook/chat' });
    expect(rootShape(r)).toBe('[notebook/[id][index, chat]]');
    await act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
  });

  it('a notebook thread opened from the start page backs into its notebook, then home', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() =>
      openThread({ id: 't1', threadType: 'notebook', notebookCollectionIds: ['berlin-system'] })
    );
    expect(r.getPathname()).toBe('/notebook/berlin-notebook/chat');
    expect(rootShape(r)).toBe('[(tabs)[start], notebook/[id][index, chat]]');
    await act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
    // The page the anchor made knows which notebook it is.
    expect(notebookPageParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'berlin-notebook' })
    );
    await act(() => router.back());
    expect(r.getPathname()).toBe('/start');
  });

  it('a notebook thread opened from a chat backs into its notebook, then the chat', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() => router.push('/chat-conversation'));
    await act(() =>
      openThread({ id: 't1', threadType: 'notebook', notebookCollectionIds: ['berlin-system'] })
    );
    await act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
    await act(() => router.back());
    expect(r.getPathname()).toBe('/chat-conversation');
  });

  it('a question asked on the notebook page backs onto that same page, no second copy', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() => router.push(routeWithParams('/notebook/[id]', { id: 'berlin-notebook' })));
    await act(() => router.push(routeWithParams('/notebook/[id]/chat', { id: 'berlin-notebook' })));
    expect(rootShape(r)).toBe('[(tabs)[start], notebook/[id][index, chat]]');
    await act(() => router.back());
    await act(() => router.back());
    expect(r.getPathname()).toBe('/start');
  });

  it('a plain chat thread gets no anchor slid in beneath it', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() => openThread({ id: 't3', threadType: 'chat' }));
    expect(rootShape(r)).toBe('[(tabs)[start], (focused)[chat-conversation]]');
  });
});

describe('legacy notebook paths keep resolving', () => {
  it('/notebook-chat redirects into the nested chat, notebook beneath', async () => {
    const r = await renderRouter(tree, {
      initialUrl: '/notebook-chat?notebookId=berlin-notebook&threadId=t1',
    });
    expect(r.getPathname()).toBe('/notebook/berlin-notebook/chat');
    expect(r.getSearchParams()).toMatchObject({ threadId: 't1' });
    await act(() => router.back());
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
    expect(notebookPageParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'berlin-notebook' })
    );
  });

  it('/notebook-detail redirects to the notebook page', async () => {
    const r = await renderRouter(tree, {
      initialUrl: '/notebook-detail?notebookId=berlin-notebook&kind=system',
    });
    expect(r.getPathname()).toBe('/notebook/berlin-notebook');
  });
});

describe('tools and Wissen open on a stack, not as hidden tabs', () => {
  it('each tool backs out to home, and the next one does not sit on the last', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() => router.push('/(focused)/scanner'));
    await act(() => router.back());
    expect(r.getPathname()).toBe('/start');
    await act(() => router.push('/(focused)/reel'));
    expect(rootShape(r)).toBe('[(tabs)[start], (focused)[reel]]');
    await act(() => router.back());
    expect(r.getPathname()).toBe('/start');
  });

  it('Vorlagen and Wissen have a screen to go back to', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    for (const path of ['/(focused)/vorlagen', '/(focused)/wissen'] as const) {
      await act(() => router.push(path));
      expect(router.canGoBack()).toBe(true);
      await act(() => router.back());
      expect(r.getPathname()).toBe('/start');
    }
  });

  it('the tool paths are unchanged by the move (F0)', async () => {
    expect((await renderRouter(tree, { initialUrl: '/vorlagen' })).getPathname()).toBe('/vorlagen');
  });
});

describe('the old sticker Entdecken is the Marktplatz now', () => {
  it('/sticker-entdecken redirects to the Sticker tab, search kept', async () => {
    const r = await renderRouter(tree, { initialUrl: '/sticker-entdecken?q=sonne' });
    expect(r.getPathname()).toBe('/marktplatz');
    expect(r.getSearchParams()).toMatchObject({ art: 'sticker', q: 'sonne' });
  });
});

describe('going home leaves exactly one home', () => {
  it('from a fullscreen editor above a tool', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() => router.push('/(focused)/reel'));
    await act(() => router.push('/(fullscreen)/subtitle-editor'));
    await act(() => goHome());
    expect(rootShape(r)).toBe('[(tabs)[start]]');
  });

  it('from a cold link', async () => {
    const r = await renderRouter(tree, { initialUrl: '/subtitle-editor' });
    await act(() => goHome());
    expect(rootShape(r)).toBe('[(tabs)[start]]');
  });
});

describe('unknown paths', () => {
  it('a cold link to a path without a screen lands at home', async () => {
    const r = await renderRouter(tree, { initialUrl: '/gibt-es-nicht' });
    expect(r.getPathname()).toBe('/start');
    expect(rootShape(r)).toBe('[(tabs)[start]]');
  });

  it('pushed on top of a running app, it returns home without a second home', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() => router.push('/(focused)/reel'));
    await act(() => router.push('/gibt-es-nicht' as Href));
    expect(r.getPathname()).toBe('/start');
    expect(rootShape(r)).toBe('[(tabs)[start]]');
  });
});

describe('switching threads from the drawer', () => {
  it('swaps the open chat instead of stacking every thread looked at', async () => {
    const r = await renderRouter(tree, { initialUrl: '/start' });
    await act(() => router.push('/chat-conversation?threadId=a'));
    // What `drawerOpenMode` answers for a chat-to-chat switch.
    await act(() => router.replace('/chat-conversation?threadId=b'));
    await act(() => router.replace('/chat-conversation?threadId=c'));
    expect(rootShape(r)).toBe('[(tabs)[start], (focused)[chat-conversation]]');
    await act(() => router.back());
    expect(r.getPathname()).toBe('/start');
  });
});

describe('the agent store across a drawer swap', () => {
  /** The chat screen's store side effects, without the chat around them. */
  const ChatProbe = () => {
    const { agentId } = useLocalSearchParams<{ agentId?: string }>();
    useChatAgentSelection(agentId ?? null, 'de-DE');
    return <Text>chat</Text>;
  };
  const chatTree = { ...tree, '(focused)/chat-conversation': ChatProbe };
  const SAARLAND = 'gruenerator-oeffentlichkeitsarbeit-saarland';

  beforeEach(() => {
    useAgentStore.setState({
      selectedAgentId: null,
      selectedNotebookId: 'gruenerator-notebook',
      threadMode: 'chat',
    });
  });

  it('keeps the agent and its notebook when both threads use the same agent', async () => {
    expect(getSystemAgent(SAARLAND)?.defaultNotebookIds?.[0]).toBe('saarland-notebook');
    await renderRouter(chatTree, { initialUrl: '/start' });
    await act(() => router.push(`/chat-conversation?threadId=a&agentId=${SAARLAND}`));
    await act(() => useAgentStore.getState().setThreadMode('notebook'));
    await act(() => router.replace(`/chat-conversation?threadId=b&agentId=${SAARLAND}`));
    const state = useAgentStore.getState();
    expect(state.selectedAgentId).toBe(SAARLAND);
    expect(state.selectedNotebookId).toBe('saarland-notebook');
  });

  it('keeps the next agent when the agents differ', async () => {
    await renderRouter(chatTree, { initialUrl: '/start' });
    await act(() => router.push('/chat-conversation?threadId=a&agentId=gruenerator-universal'));
    await act(() => router.replace(`/chat-conversation?threadId=b&agentId=${SAARLAND}`));
    expect(useAgentStore.getState().selectedAgentId).toBe(SAARLAND);
    expect(useAgentStore.getState().selectedNotebookId).toBe('saarland-notebook');
  });

  // A native stack keeps the replaced screen mounted until its exit animation
  // ends, so the next chat writes the store before the old one cleans up.
  it('the outgoing chat cleaning up late leaves the next chat alone', async () => {
    const Chat = ({ agentId }: { agentId: string }) => {
      useChatAgentSelection(agentId, 'de-DE');
      return null;
    };
    const r = await render(<Chat key="a" agentId={SAARLAND} />);
    await act(() => useAgentStore.getState().setThreadMode('notebook'));
    await r.rerender(
      <>
        <Chat key="a" agentId={SAARLAND} />
        <Chat key="b" agentId={SAARLAND} />
      </>
    );
    await act(() => useAgentStore.getState().setThreadMode('notebook'));
    await r.rerender(<Chat key="b" agentId={SAARLAND} />);
    const state = useAgentStore.getState();
    expect(state.selectedAgentId).toBe(SAARLAND);
    expect(state.selectedNotebookId).toBe('saarland-notebook');
    expect(state.threadMode).toBe('notebook');
  });

  it('resets everything once the last chat is left', async () => {
    const r = await renderRouter(chatTree, { initialUrl: '/start' });
    await act(() => router.push(`/chat-conversation?threadId=a&agentId=${SAARLAND}`));
    await act(() => useAgentStore.getState().setThreadMode('notebook'));
    await act(() => router.replace(`/chat-conversation?threadId=b&agentId=${SAARLAND}`));
    await act(() => router.back());
    expect(r.getPathname()).toBe('/start');
    const state = useAgentStore.getState();
    expect(state.selectedAgentId).toBeNull();
    expect(state.selectedNotebookId).toBe('gruenerator-notebook');
    expect(state.threadMode).toBe('chat');
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
  ])('%s lands on %s', async (from, to) => {
    const r = await renderRouter(tree, { initialUrl: from });
    expect(r.getPathname()).toBe(to);
  });
});
