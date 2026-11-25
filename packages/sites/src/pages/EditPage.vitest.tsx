import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Y from 'yjs';

import { seededDoc } from '../draft/testDoc';

const hoisted = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    site: { current: {} as Record<string, unknown> },
    session: { current: {} as Record<string, unknown> },
    listeners,
    refetch: vi.fn(),
  };
});

function setSession(next: Record<string, unknown>) {
  hoisted.session.current = next;
  act(() => hoisted.listeners.forEach((l) => l()));
}

vi.mock('../hooks/useSite', () => ({
  useSite: () => hoisted.site.current,
  useSiteByHandle: () => hoisted.site.current,
  CurrentSiteProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../draft/useSiteDraftSession', () => ({
  useSiteDraftSession: () =>
    useSyncExternalStore(
      (l) => {
        hoisted.listeners.add(l);
        return () => hoisted.listeners.delete(l);
      },
      () => hoisted.session.current
    ),
}));
vi.mock('../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', display_name: 'Anna Beispiel', locale: 'de-DE' } }),
  useSitesPaths: () => ({
    overview: '/sites',
    create: '/sites/erstellen',
    site: (handle: string) => `/sites/${handle}`,
  }),
}));
vi.mock('../preview/SitePreviewFrame', () => ({ SitePreviewFrame: () => <div /> }));

import { EditPage } from './EditPage';

function EditAtParam() {
  return <EditPage handle={useParams<{ handle: string }>().handle ?? ''} />;
}

function Where() {
  return <span data-testid="pfad">{useLocation().pathname}</span>;
}

/** The editor under /sites/<handle>, with the overview one step behind it. */
function renderAt(handle = 'anna') {
  return render(
    <MemoryRouter initialEntries={['/sites', `/sites/${handle}`]} initialIndex={1}>
      <Routes>
        <Route path="/sites" element={<Where />} />
        <Route
          path="/sites/:handle"
          element={
            <>
              <Where />
              <EditAtParam />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const siteRow = { id: 's1', subdomain: 'anna', legal: null };

function setSite(over: Record<string, unknown>) {
  hoisted.site.current = {
    site: null,
    isLoading: false,
    error: null,
    refetch: hoisted.refetch,
    ...over,
  };
}

function unloadCancelled(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('EditPage', () => {
  beforeEach(() => {
    hoisted.refetch.mockReset();
  });

  it('a load error shows the error state with retry, not the create screen', async () => {
    setSite({ error: new Error('boom') });
    renderAt();
    expect(
      screen.getByRole('heading', { name: 'Deine Website konnte nicht geladen werden' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Erstell-Ablauf')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(hoisted.refetch).toHaveBeenCalledTimes(1);
  });

  it('no site under the address shows not found with a way to the overview', async () => {
    setSite({});
    renderAt('bert');
    expect(screen.getByRole('heading', { name: 'Website nicht gefunden' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zu deinen Websites' }));
    expect(screen.getByTestId('pfad')).toHaveTextContent('/sites');
  });

  it('moves to the current address when the site answers under another one', () => {
    setSite({ site: siteRow });
    hoisted.session.current = { state: 'preparing' };
    renderAt('s1');
    expect(screen.getByTestId('pfad')).toHaveTextContent('/sites/anna');
  });

  it('shows unsaved states in the editor header and warns on leave only while unsynced', () => {
    setSite({ site: siteRow });
    const ydoc: Y.Doc = seededDoc({});
    hoisted.session.current = { state: 'ready', ydoc, provider: {}, save: 'saving' };
    renderAt();
    expect(screen.getByRole('status')).toHaveTextContent('Wird gespeichert …');
    expect(unloadCancelled()).toBe(true);

    setSession({ state: 'ready', ydoc, provider: {}, save: 'saved' });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(unloadCancelled()).toBe(false);

    setSession({ state: 'ready', ydoc, provider: {}, save: 'offline' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Offline – Änderungen bleiben auf diesem Gerät'
    );
    expect(unloadCancelled()).toBe(true);
  });

  it('an unavailable draft shows its own message and retries the session', async () => {
    const retry = vi.fn();
    setSite({ site: siteRow });
    hoisted.session.current = { state: 'unavailable', retry };
    renderAt();
    expect(
      screen.getByRole('heading', { name: 'Der Entwurf ist gerade nicht erreichbar' })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(unloadCancelled()).toBe(false);
  });

  it('the back button leads to the overview', async () => {
    setSite({ site: siteRow });
    hoisted.session.current = {
      state: 'ready',
      ydoc: seededDoc({}),
      provider: {},
      save: 'saved',
    };
    renderAt();
    expect(screen.queryByText('Grünerator Sites')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(screen.getByTestId('pfad')).toHaveTextContent('/sites');
  });
});
