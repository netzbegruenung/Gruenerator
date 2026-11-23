import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

type User = { default_startpage?: 'chat' | 'arbeiten'; chat_background?: string };
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
const shows = () =>
  screen.getByLabelText('Composer').closest('[hidden]') === null ? 'Chat' : 'Arbeiten';
const url = () => screen.getByTestId('url').textContent;

describe('WorkplacePage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { default_startpage: 'chat' }, hasServerConfirmed: true });
  });

  it('opens the view from the start-page setting on bare /start', async () => {
    useAuthStore.setState({ user: { default_startpage: 'arbeiten' } });
    renderAt('/start');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(shows()).toBe('Arbeiten');
  });

  it('lets the path override the setting', async () => {
    renderAt('/start/arbeiten');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(shows()).toBe('Arbeiten');
  });

  it('switches views without remounting Chat, the home view at bare /start', async () => {
    renderAt('/start');
    fireEvent.change(screen.getByLabelText('Composer'), { target: { value: 'Entwurf' } });

    act(() => navigateTo('/start/arbeiten'));
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(screen.getByLabelText('Composer')).not.toBeVisible();

    act(() => navigateTo('/start'));
    expect(screen.getByLabelText('Composer')).toBeVisible();
    expect(screen.getByLabelText('Composer')).toHaveValue('Entwurf');
  });

  it('folds the home view spelled out into bare /start', () => {
    renderAt('/start/chat?x=1');
    expect(url()).toBe('/start?x=1');
    expect(shows()).toBe('Chat');
  });

  it('keeps an explicit path while the setting is unconfirmed', () => {
    useAuthStore.setState({ hasServerConfirmed: false });
    renderAt('/start/chat');
    expect(url()).toBe('/start/chat');
    expect(shows()).toBe('Chat');
  });

  it('comes back to Arbeiten after leaving the page from there', async () => {
    renderAt('/start');
    act(() => navigateTo('/start/arbeiten'));
    act(() => navigateTo('/office'));
    expect(screen.getByText('Office')).toBeInTheDocument();

    act(() => navigateTo(-1));
    expect(url()).toBe('/start/arbeiten');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
  });

  it('forwards the old ?page= links to the view path', () => {
    renderAt('/start?page=arbeiten&foo=1');
    expect(url()).toBe('/start/arbeiten?foo=1');
  });

  it('forwards ?page= for the home view to bare /start', () => {
    renderAt('/start?page=chat');
    expect(url()).toBe('/start');
  });

  it('sends an unknown view to /start', () => {
    renderAt('/start/quatsch');
    expect(url()).toBe('/start');
    expect(shows()).toBe('Chat');
  });
});
