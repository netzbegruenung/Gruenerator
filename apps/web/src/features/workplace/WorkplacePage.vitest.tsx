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

const selected = () =>
  screen.getAllByRole('link').find((t) => t.getAttribute('aria-current') === 'page')?.textContent;
const url = () => screen.getByTestId('url').textContent;

describe('WorkplacePage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { default_startpage: 'chat' }, hasServerConfirmed: true });
  });

  it('opens the tab from the start-page setting on bare /start', () => {
    useAuthStore.setState({ user: { default_startpage: 'arbeiten' } });
    renderAt('/start');
    expect(selected()).toBe('Arbeiten');
  });

  it('lets the path override the setting', async () => {
    renderAt('/start/arbeiten');
    expect(selected()).toBe('Arbeiten');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
  });

  it('switches tabs without remounting Chat, the home tab at bare /start', async () => {
    renderAt('/start');
    fireEvent.change(screen.getByLabelText('Composer'), { target: { value: 'Entwurf' } });

    fireEvent.click(screen.getByRole('link', { name: 'Arbeiten' }));
    expect(url()).toBe('/start/arbeiten');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(screen.getByLabelText('Composer')).not.toBeVisible();

    fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
    expect(url()).toBe('/start');
    expect(screen.getByLabelText('Composer')).toHaveValue('Entwurf');
  });

  it('gives the other tab the segment when Arbeiten is home', () => {
    useAuthStore.setState({ user: { default_startpage: 'arbeiten' } });
    renderAt('/start');
    expect(screen.getByRole('link', { name: 'Arbeiten' })).toHaveAttribute('href', '/start');
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/start/chat');
  });

  it('folds the home tab spelled out into bare /start', () => {
    renderAt('/start/chat?x=1');
    expect(url()).toBe('/start?x=1');
    expect(selected()).toBe('Chat');
  });

  it('keeps an explicit path while the setting is unconfirmed', () => {
    useAuthStore.setState({ hasServerConfirmed: false });
    renderAt('/start/chat');
    expect(url()).toBe('/start/chat');
    expect(selected()).toBe('Chat');
  });

  it('comes back to Arbeiten after leaving the page from there', async () => {
    renderAt('/start');
    fireEvent.click(screen.getByRole('link', { name: 'Arbeiten' }));
    act(() => navigateTo('/office'));
    expect(screen.getByText('Office')).toBeInTheDocument();

    act(() => navigateTo(-1));
    expect(url()).toBe('/start/arbeiten');
    expect(selected()).toBe('Arbeiten');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
  });

  it('keeps the history clean when the current tab is clicked again', () => {
    renderAt('/start');
    fireEvent.click(screen.getByRole('link', { name: 'Arbeiten' }));
    fireEvent.click(screen.getByRole('link', { name: 'Arbeiten' }));
    act(() => navigateTo(-1));
    expect(url()).toBe('/start');
  });

  it('forwards the old ?page= links to the tab path', () => {
    renderAt('/start?page=arbeiten&foo=1');
    expect(url()).toBe('/start/arbeiten?foo=1');
    expect(selected()).toBe('Arbeiten');
  });

  it('forwards ?page= for the home tab to bare /start', () => {
    renderAt('/start?page=chat');
    expect(url()).toBe('/start');
  });

  it('sends an unknown tab to /start', () => {
    renderAt('/start/quatsch');
    expect(url()).toBe('/start');
    expect(selected()).toBe('Chat');
  });
});
