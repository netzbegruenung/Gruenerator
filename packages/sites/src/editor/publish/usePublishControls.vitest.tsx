import {
  buildSiteSnapshot,
  siteDraftToSnapshotSource,
  type SiteLegalDraft,
} from '@gruenerator/contracts';
import { setSiteField } from '@gruenerator/contracts/site-ydoc';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  togglePublish: vi.fn(),
  deleteSite: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  publicOrigin: { current: 'https://grsites.de' as string | null },
}));

vi.mock('../../hooks/useSite', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSite: () => ({
    togglePublish: hoisted.togglePublish,
    deleteSite: hoisted.deleteSite,
    publicOrigin: hoisted.publicOrigin.current,
  }),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => hoisted.toast }));
vi.mock('../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: 'de-DE' } }),
}));

import { BASE_DRAFT } from '../../draft/testDoc';
import { enqueueLegalSave, registerLegalFlusher } from '../../hooks/legalSaveGate';
import { SitePublishError, type SiteData } from '../../hooks/useSite';
import { useEditorStore } from '../../stores/editorStore';
import { renderWithDraft } from '../../test/renderWithDraft';

import { usePublishControls } from './usePublishControls';

const LEGAL: SiteLegalDraft = {
  name: 'Anna Beispiel',
  street: 'Musterweg 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'anna@example.org',
};

function fakeProvider(initial = 0) {
  const listeners = new Set<() => void>();
  const provider = {
    unsyncedChanges: initial,
    on: (_e: string, fn: () => void) => listeners.add(fn),
    off: (_e: string, fn: () => void) => listeners.delete(fn),
  };
  return {
    provider: provider as never,
    set(n: number) {
      provider.unsyncedChanges = n;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

function snapshot() {
  const built = buildSiteSnapshot(siteDraftToSnapshotSource(BASE_DRAFT, LEGAL), 'de-DE');
  if (!built.ok) throw new Error('fixture invalid');
  return built.snapshot;
}

function site(over: Partial<SiteData> = {}): SiteData {
  return {
    id: 's1',
    subdomain: 'anna',
    is_published: false,
    legal: LEGAL,
    published_snapshot: null,
    ...over,
  } as SiteData;
}

const onShowLive = vi.fn();

function Harness({ site: s, provider }: { site: SiteData; provider: never }) {
  const { menu, button } = usePublishControls({ site: s, provider, onShowLive });
  return (
    <>
      {menu}
      {button}
    </>
  );
}

function setup(s: SiteData, provider = fakeProvider().provider) {
  return renderWithDraft(<Harness site={s} provider={provider} />);
}

// The menu trigger is the site name: BASE_DRAFT's title.
const MENU = { name: /Mustermensch|Neuer Titel/ };

describe('usePublishControls', () => {
  beforeEach(() => {
    hoisted.togglePublish.mockReset().mockResolvedValue({});
    hoisted.deleteSite.mockReset().mockResolvedValue(undefined);
    hoisted.toast.error.mockReset();
    hoisted.toast.success.mockReset();
    hoisted.publicOrigin.current = 'https://grsites.de';
    useEditorStore.setState({ focusedField: null, selection: null, sidebarTab: null });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await enqueueLegalSave('s1', () => Promise.resolve(true));
  });

  it('labels the publish button for each state', () => {
    const a = setup(site());
    expect(screen.getByRole('button', { name: 'Veröffentlichen' })).toBeEnabled();
    a.unmount();

    const b = setup(site({ is_published: true, published_snapshot: snapshot() }));
    expect(screen.getByRole('button', { name: 'Veröffentlicht' })).toBeDisabled();
    b.unmount();

    const c = setup(site({ is_published: true, published_snapshot: snapshot() }));
    act(() => setSiteField(c.ydoc, 'site_title', 'Neuer Titel'));
    expect(screen.getByRole('button', { name: 'Änderungen veröffentlichen' })).toBeEnabled();
  });

  it('names the state and address at the top of the site menu', async () => {
    const { user } = setup(site({ is_published: true, published_snapshot: snapshot() }));
    await user.click(screen.getByRole('button', MENU));
    expect(await screen.findByText('Live · aktuell')).toBeInTheDocument();
    expect(screen.getByText('grsites.de/anna')).toBeInTheDocument();
  });

  it('offers the live state in the canvas once there is one', async () => {
    onShowLive.mockReset();
    const { user } = setup(site({ is_published: true, published_snapshot: snapshot() }));
    await user.click(screen.getByRole('button', MENU));
    await user.click(await screen.findByRole('menuitem', { name: 'Live-Stand ansehen' }));
    expect(onShowLive).toHaveBeenCalledTimes(1);
  });

  it('issues block publishing and list "Impressum: Name"', async () => {
    const { user } = setup(site({ legal: { ...LEGAL, name: '' } }));
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    expect(await screen.findByRole('button', { name: /Impressum: Name/ })).toBeInTheDocument();
    expect(hoisted.togglePublish).not.toHaveBeenCalled();
  });

  it('clicking an issue focuses legal.name', async () => {
    const { user } = setup(site({ legal: { ...LEGAL, name: '' } }));
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await user.click(await screen.findByRole('button', { name: /Impressum: Name/ }));
    expect(useEditorStore.getState().focusedField).toEqual({
      panel: 'legal',
      path: 'legal.name',
    });
    expect(screen.queryByRole('button', { name: /Impressum: Name/ })).toBeNull();
  });

  it('does not hand the focus back to the publish button after picking an issue', async () => {
    const { user } = setup(site({ legal: { ...LEGAL, name: '' } }));
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await user.click(await screen.findByRole('button', { name: /Impressum: Name/ }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Impressum: Name/ })).toBeNull()
    );
    expect(screen.getByRole('button', { name: 'Veröffentlichen' })).not.toHaveFocus();
  });

  it('publish waits for sync before calling the API', async () => {
    const p = fakeProvider(2);
    const { user } = setup(site(), p.provider);
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(hoisted.togglePublish).not.toHaveBeenCalled();
    p.set(0);
    await waitFor(() =>
      expect(hoisted.togglePublish).toHaveBeenCalledWith({ id: 's1', publish: true })
    );
  });

  it('refuses after the sync timeout and says so', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = fakeProvider(1);
    const { user } = setup(site(), p.provider);
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(hoisted.toast.error).toHaveBeenCalledWith(
      'Noch nicht alles gespeichert. Prüfe deine Verbindung und versuche es noch einmal.'
    );
    expect(hoisted.togglePublish).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Veröffentlichen' })).toBeEnabled();
  });

  it('waits for a pending Impressum save before publishing', async () => {
    let finish: (ok: boolean) => void = () => {};
    const unregister = registerLegalFlusher(() => {
      void enqueueLegalSave('s1', () => new Promise<boolean>((resolve) => (finish = resolve)));
    });
    const { user } = setup(site());
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(hoisted.togglePublish).not.toHaveBeenCalled();
    finish(true);
    await waitFor(() => expect(hoisted.togglePublish).toHaveBeenCalled());
    unregister();
  });

  it('does not publish when the Impressum save failed', async () => {
    const unregister = registerLegalFlusher(() => {
      void enqueueLegalSave('s1', () => Promise.resolve(false));
    });
    const { user } = setup(site());
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await waitFor(() => expect(hoisted.toast.error).toHaveBeenCalled());
    expect(hoisted.togglePublish).not.toHaveBeenCalled();
    unregister();
  });

  it('lists the issues of a server 422 and focuses a field from them', async () => {
    hoisted.togglePublish.mockRejectedValue(
      new SitePublishError('Veröffentlichen nicht möglich', [
        { path: 'legal.city', message: 'Ort fehlt' },
      ])
    );
    const { user } = setup(site());
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await user.click(await screen.findByRole('button', { name: 'Impressum: Ort: Ort fehlt' }));
    expect(useEditorStore.getState().focusedField).toEqual({
      panel: 'legal',
      path: 'legal.city',
    });
  });

  it('jumps from an issue in a card to its block and opens the form', async () => {
    const tile = (id: string, link: string) => ({ id, text: 'Los', link, imageUrl: '' });
    const blocks = [
      { id: 'hero', type: 'hero' as const },
      { id: 'ac1', type: 'actions' as const, items: [tile('a', '#kontakt')] },
      { id: 'ac2', type: 'actions' as const, items: [tile('b', '#a'), tile('c', 'javascript:x')] },
    ];
    hoisted.togglePublish.mockRejectedValue(
      new SitePublishError('Veröffentlichen nicht möglich', [
        { path: 'blocks.ac2.items.c.link', message: 'Link muss mit https:// beginnen' },
      ])
    );
    const { user } = renderWithDraft(<Harness site={site()} provider={fakeProvider().provider} />, {
      blocks,
    });
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Aktionen 2, Kachel 2: Link: Link muss mit https:// beginnen',
      })
    );
    expect(useEditorStore.getState()).toMatchObject({
      selection: { blockId: 'ac2', itemId: 'c' },
      elementPanel: 'details',
      focusedField: { panel: 'ac2', path: 'blocks.ac2.items.c.link' },
    });
  });

  it('shows the 503 message and publishes nothing else', async () => {
    const { SitesApiError } = await import('../../utils/errorHandler');
    hoisted.togglePublish.mockRejectedValue(
      new SitesApiError(503, 'Der Entwurf konnte nicht gelesen werden')
    );
    const { user } = setup(site());
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await waitFor(() =>
      expect(hoisted.toast.error).toHaveBeenCalledWith(
        'Veröffentlichen gerade nicht möglich',
        'Der Entwurf konnte nicht gelesen werden'
      )
    );
  });

  it('unpublishes after a confirmation', async () => {
    const { user } = setup(site({ is_published: true, published_snapshot: snapshot() }));
    await user.click(screen.getByRole('button', MENU));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Veröffentlichung zurückziehen' })
    );
    expect(hoisted.togglePublish).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Zurückziehen' }));
    expect(hoisted.togglePublish).toHaveBeenCalledWith({ id: 's1', publish: false });
  });

  it('opens the live page at origin/subdomain in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user } = setup(site({ is_published: true, published_snapshot: snapshot() }));
    await user.click(screen.getByRole('button', MENU));
    await user.click(await screen.findByRole('menuitem', { name: 'Live-Seite öffnen' }));
    expect(open).toHaveBeenCalledWith('https://grsites.de/anna', '_blank', 'noopener');
    open.mockRestore();
  });

  it('offers no live page or unpublish while unpublished', async () => {
    const { user } = setup(site());
    await user.click(screen.getByRole('button', MENU));
    expect(await screen.findByRole('menuitem', { name: 'Website löschen' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Live-Seite öffnen' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Veröffentlichung zurückziehen' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Live-Stand ansehen' })).toBeNull();
    expect(screen.getByText('Nicht veröffentlicht')).toBeInTheDocument();
  });

  it('deletes only after the in-page confirmation', async () => {
    const { user } = setup(site());
    await user.click(screen.getByRole('button', MENU));
    await user.click(await screen.findByRole('menuitem', { name: 'Website löschen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Website löschen?' });
    expect(dialog).toHaveTextContent(
      'Die Website ist sofort offline und liegt 30 Tage im Papierkorb.'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(hoisted.deleteSite).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', MENU));
    await user.click(await screen.findByRole('menuitem', { name: 'Website löschen' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Löschen' })
    );
    expect(hoisted.deleteSite).toHaveBeenCalledWith('s1');
  });

  it('double click publishes once and blocks unpublish while publishing', async () => {
    let finish: () => void = () => {};
    hoisted.togglePublish.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { user, ydoc } = setup(site({ is_published: true, published_snapshot: snapshot() }));
    act(() => setSiteField(ydoc, 'site_title', 'Neuer Titel'));
    // Same tick, before React re-renders: only the ref guard can stop the second click.
    const button = screen.getByRole('button', { name: 'Änderungen veröffentlichen' });
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(hoisted.togglePublish).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', MENU));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Veröffentlichung zurückziehen' })
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Zurückziehen' })
    );
    expect(hoisted.togglePublish).toHaveBeenCalledTimes(1);
    finish();
  });

  it('labels the whole-Impressum issue in German', async () => {
    const { user } = setup(site({ legal: null }));
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    expect(await screen.findByRole('button', { name: /^Impressum: / })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Das fehlt noch/ })).toBeInTheDocument();
  });
});
