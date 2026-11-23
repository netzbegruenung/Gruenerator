import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

type User = {
  default_startpage?: 'chat' | 'arbeiten';
  start_layout?: 'tabs' | 'combined';
  chat_background?: string;
};
const useAuthStore = create<{ user: User | null; hasServerConfirmed: boolean }>(() => ({
  user: null,
  hasServerConfirmed: true,
}));
vi.mock('../../stores/authStore', () => ({ useAuthStore }));

// The real tabs pull the chat runtime and Office/Docs; what matters here is
// which panel shows and that Chat keeps its state across a switch.
vi.mock('./tabs/WorkplaceChatTab', () => ({
  default: () => <input aria-label="Composer" />,
}));
vi.mock('./tabs/ArbeitenTab', () => ({
  default: () => <p>Arbeiten-Inhalt</p>,
}));

const { default: WorkplacePage } = await import('./WorkplacePage');

let navigateTo: (to: string | number) => void = () => {};
const Probe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  navigateTo = (to) => void (typeof to === 'number' ? navigate(to) : navigate(to));
  return <output data-testid="url">{location.pathname + location.search}</output>;
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/start/:tab?" element={<WorkplacePage />} />
        <Route path="/office" element={<p>Office</p>} />
      </Routes>
      <Probe />
    </MemoryRouter>
  );

// Which view shows: Chat (the composer) or Arbeiten. The sidebar switches them
// by path; its entries are tested with the menu data.
// One page: the chat view is not built until /start/chat is first opened.
const shows = () =>
  screen.queryByLabelText('Composer')?.closest('[hidden]') === null ? 'Chat' : 'Arbeiten';
const url = () => screen.getByTestId('url').textContent;

describe('WorkplacePage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { default_startpage: 'chat' }, hasServerConfirmed: true });
  });

  // The one-page layout is the default: /start always opens Arbeiten, the
  // start-page setting no longer picks the view, Chat stays reachable by path.
  it('opens Arbeiten on bare /start, whatever the start-page setting says', async () => {
    renderAt('/start');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(shows()).toBe('Arbeiten');
    expect(screen.queryByRole('navigation', { name: 'Workplace-Bereiche' })).toBeNull();
    // The hidden chat view is not built: it would cost a second composer and runtime.
    expect(screen.queryByLabelText('Composer')).toBeNull();
  });

  it('still opens Chat by path', () => {
    renderAt('/start/chat');
    expect(url()).toBe('/start/chat');
    expect(shows()).toBe('Chat');
  });

  it('switches views without remounting Chat, the home view at bare /start', async () => {
    renderAt('/start/chat');
    fireEvent.change(screen.getByLabelText('Composer'), { target: { value: 'Entwurf' } });

    act(() => navigateTo('/start'));
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(screen.getByLabelText('Composer')).not.toBeVisible();

    act(() => navigateTo('/start/chat'));
    expect(screen.getByLabelText('Composer')).toBeVisible();
    expect(screen.getByLabelText('Composer')).toHaveValue('Entwurf');
  });

  it('folds the home view spelled out into bare /start', () => {
    renderAt('/start/arbeiten?x=1');
    expect(url()).toBe('/start?x=1');
    expect(shows()).toBe('Arbeiten');
  });

  it('keeps an explicit path while the setting is unconfirmed', () => {
    useAuthStore.setState({ hasServerConfirmed: false });
    renderAt('/start/chat');
    expect(url()).toBe('/start/chat');
    expect(shows()).toBe('Chat');
  });

  it('comes back to Arbeiten after leaving the page from there', async () => {
    renderAt('/start/chat');
    act(() => navigateTo('/start'));
    act(() => navigateTo('/office'));
    expect(screen.getByText('Office')).toBeInTheDocument();

    act(() => navigateTo(-1));
    expect(url()).toBe('/start');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
  });

  it('forwards the old ?page= links to the view path', () => {
    renderAt('/start?page=chat&foo=1');
    expect(url()).toBe('/start/chat?foo=1');
  });

  it('forwards ?page= for the home view to bare /start', () => {
    renderAt('/start?page=arbeiten');
    expect(url()).toBe('/start');
  });

  it('sends an unknown view to /start', async () => {
    renderAt('/start/quatsch');
    expect(url()).toBe('/start');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
  });
});

describe('WorkplacePage with tabs', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { default_startpage: 'chat', start_layout: 'tabs' },
      hasServerConfirmed: true,
    });
  });

  it('opens the start-page setting on bare /start under the tab bar', () => {
    renderAt('/start');
    expect(shows()).toBe('Chat');
    expect(screen.getByRole('navigation', { name: 'Workplace-Bereiche' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  });

  it('follows the setting to Arbeiten', async () => {
    useAuthStore.setState({ user: { default_startpage: 'arbeiten', start_layout: 'tabs' } });
    renderAt('/start');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(shows()).toBe('Arbeiten');
  });

  it('folds the home tab spelled out into bare /start', () => {
    renderAt('/start/chat?x=1');
    expect(url()).toBe('/start?x=1');
    expect(shows()).toBe('Chat');
  });
});
