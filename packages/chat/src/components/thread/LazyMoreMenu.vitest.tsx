/**
 * The "Mehr Optionen" menu of a thread row mounts only on first use.
 *
 * Every mounted Radix menu root registers a capture-phase `keydown` listener on
 * `document` (and re-adds pointer listeners on each keystroke). With one menu
 * per thread, users with thousands of threads paid ~20 ms per keypress anywhere
 * in the app. The rows now render a plain button until the menu is opened.
 */
import { ThreadListPrimitive } from '@assistant-ui/react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrueneratorChatRuntimeProvider } from '../../runtime/GrueneratorChatRuntime';
import { useChatConfigStore } from '../../stores/chatConfigStore';

import { GrueneratorThreadListItem } from './ThreadListItem';

vi.mock('../../hooks/useChatCollaboration', () => ({
  useChatCollaboration: () => ({
    provider: null,
    typingUsers: [],
    setTyping: () => {},
    broadcastNewMessage: () => {},
  }),
}));

function makeThreads(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Unterhaltung ${i + 1}`,
    slugSuffix: `slug${i}`,
    agentId: 'gruenerator-universal',
    threadType: 'chat',
    status: 'regular',
    lastMessage: 'x',
    accessType: 'owner',
    updatedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
  }));
}

function configureFetch(count: number) {
  const threads = makeThreads(count);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  useChatConfigStore.getState().configure({
    fetch: async (url: string) => {
      if (url === '/api/chat-service/threads') return json(threads);
      return json({});
    },
    onUnauthorized: () => {},
  });
}

function Sidebar() {
  return (
    <GrueneratorChatRuntimeProvider userId="u1" activePath="/chat" onNavigate={() => {}}>
      <nav data-testid="sidebar">
        <ThreadListPrimitive.Root>
          <ThreadListPrimitive.Items components={{ ThreadListItem: GrueneratorThreadListItem }} />
        </ThreadListPrimitive.Root>
      </nav>
    </GrueneratorChatRuntimeProvider>
  );
}

/** Renders `count` rows and counts capture-phase keydown listeners added to document. */
async function countCaptureKeydownListeners(count: number) {
  configureFetch(count);
  const spy = vi.spyOn(document, 'addEventListener');
  render(<Sidebar />);
  const sidebar = await screen.findByTestId('sidebar');
  await within(sidebar).findByText(`Unterhaltung ${count}`);
  expect(within(sidebar).getAllByLabelText('Mehr Optionen')).toHaveLength(count);
  const added = spy.mock.calls.filter(([type, , options]) => {
    const capture = typeof options === 'boolean' ? options : options?.capture;
    return type === 'keydown' && capture === true;
  }).length;
  spy.mockRestore();
  cleanup();
  return added;
}

async function renderRows(count: number) {
  configureFetch(count);
  const user = userEvent.setup();
  render(<Sidebar />);
  const sidebar = await screen.findByTestId('sidebar');
  const title = await within(sidebar).findByText('Unterhaltung 1');
  const row = title.closest('a')!.parentElement!;
  return { user, trigger: within(row).getByLabelText('Mehr Optionen') };
}

describe('LazyMoreMenu — Thread-Zeilen-Menü wird erst bei Bedarf gemountet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registriert keine keydown-Capture-Listener pro Zeile', async () => {
    // Compared against a single row instead of asserting zero: the runtime
    // provider or other primitives may add their own document listeners, but
    // none of them may scale with the number of rows.
    const withOne = await countCaptureKeydownListeners(1);
    const withMany = await countCaptureKeydownListeners(8);
    expect(withMany).toBe(withOne);
  });

  it('öffnet das Menü per Klick mit seinen Einträgen', async () => {
    const { user, trigger } = await renderRows(3);
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(trigger);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Anheften')).toBeInTheDocument();
    expect(within(menu).getByText('Löschen')).toBeInTheDocument();
  });

  it('öffnet das Menü per Enter auf dem fokussierten Button', async () => {
    const { user, trigger } = await renderRows(3);
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Anheften')).toBeInTheDocument();
    expect(within(menu).getByText('Löschen')).toBeInTheDocument();
  });

  it('öffnet bei Touch erst auf Tippen, nicht schon beim Aufsetzen (Scrollen)', async () => {
    const { trigger } = await renderRows(3);

    fireEvent.pointerDown(trigger, { pointerType: 'touch', button: 0 });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});
