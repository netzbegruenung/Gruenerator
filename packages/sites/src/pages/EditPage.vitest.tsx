import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
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
}));
vi.mock('../create/CreateFlow', () => ({ CreateFlow: () => <p>Erstell-Ablauf</p> }));
vi.mock('../preview/SitePreviewFrame', () => ({ SitePreviewFrame: () => <div /> }));
vi.mock('../components/editor', () => ({
  EditorLayout: ({ sidebar, preview }: { sidebar: unknown; preview: unknown }) => (
    <div>
      {sidebar as never}
      {preview as never}
    </div>
  ),
  EditorSidebar: () => <nav aria-label="Abschnitte" />,
  SectionNavigation: () => <nav aria-label="Abschnitte" />,
}));

import { EditPage } from './EditPage';

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
    render(<EditPage />);
    expect(
      screen.getByRole('heading', { name: 'Deine Website konnte nicht geladen werden' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Erstell-Ablauf')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(hoisted.refetch).toHaveBeenCalledTimes(1);
  });

  it('no site and no error renders the create flow', () => {
    setSite({});
    render(<EditPage />);
    expect(screen.getByText('Erstell-Ablauf')).toBeInTheDocument();
  });

  it('shows unsaved states in the editor header and warns on leave only while unsynced', () => {
    setSite({ site: siteRow });
    const ydoc: Y.Doc = seededDoc({});
    hoisted.session.current = { state: 'ready', ydoc, provider: {}, save: 'saving' };
    render(<EditPage />);
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
    render(<EditPage />);
    expect(
      screen.getByRole('heading', { name: 'Der Entwurf ist gerade nicht erreichbar' })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(unloadCancelled()).toBe(false);
  });
});
