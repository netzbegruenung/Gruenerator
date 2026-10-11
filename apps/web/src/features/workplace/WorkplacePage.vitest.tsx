import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

type User = { default_startpage?: 'chat' | 'arbeiten'; chat_background?: string };
const useAuthStore = create<{ user: User | null }>(() => ({ user: null }));
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

let navigateTo: (to: string) => void = () => {};
const Probe = () => {
  const location = useLocation();
  navigateTo = useNavigate();
  return <output data-testid="url">{location.pathname + location.search}</output>;
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <WorkplacePage />
      <Probe />
    </MemoryRouter>
  );

const selected = () =>
  screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

describe('WorkplacePage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { default_startpage: 'chat' } });
  });

  it('opens the tab from the start-page setting', () => {
    useAuthStore.setState({ user: { default_startpage: 'arbeiten' } });
    renderAt('/start');
    expect(selected()).toBe('Arbeiten');
  });

  it('lets ?page= override the setting and then drops the param', async () => {
    renderAt('/start?page=arbeiten');
    expect(selected()).toBe('Arbeiten');
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(screen.getByTestId('url').textContent).toBe('/start');
  });

  it('switches tabs without remounting Chat', async () => {
    renderAt('/start');
    fireEvent.change(screen.getByLabelText('Composer'), { target: { value: 'Entwurf' } });

    fireEvent.click(screen.getByRole('tab', { name: 'Arbeiten' }));
    expect(await screen.findByText('Arbeiten-Inhalt')).toBeVisible();
    expect(screen.getByLabelText('Composer')).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByLabelText('Composer')).toHaveValue('Entwurf');
    expect(screen.getByTestId('url').textContent).toBe('/start');
  });

  it('follows a ?page= link while already open', () => {
    renderAt('/start');
    act(() => navigateTo('/start?page=arbeiten'));
    expect(selected()).toBe('Arbeiten');
  });

  it('moves between tabs with the arrow keys', () => {
    renderAt('/start');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Chat' }), { key: 'ArrowRight' });
    expect(selected()).toBe('Arbeiten');
    expect(screen.getByRole('tab', { name: 'Arbeiten' })).toHaveFocus();
  });
});
