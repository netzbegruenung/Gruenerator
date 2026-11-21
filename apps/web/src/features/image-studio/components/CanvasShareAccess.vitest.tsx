import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasShareAccess } from './CanvasShareAccess';

import type { ShareNav } from '@ggraphic/editor/shell';

const sharing = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  setShareMode: { mutate: vi.fn(), isPending: false },
  setSharePermission: { mutate: vi.fn() },
  shareWithGroup: { mutate: vi.fn(), isPending: false },
  updateGroupPermission: { mutate: vi.fn() },
  unshareFromGroup: { mutate: vi.fn() },
  updatePermission: { mutate: vi.fn() },
  revokeAccess: { mutate: vi.fn() },
}));

vi.mock('../hooks/useCanvasSharing', () => ({
  useCanvasSharing: () => ({
    collaborators: [],
    shareSettings: { share_mode: 'authenticated', share_permission: 'viewer', is_public: false },
    userGroups: [],
    canvasGroups: [],
    isLoading: false,
    setShareMode: sharing.setShareMode,
    setSharePermission: sharing.setSharePermission,
    shareWithGroup: sharing.shareWithGroup,
    updateGroupPermission: sharing.updateGroupPermission,
    unshareFromGroup: sharing.unshareFromGroup,
    updatePermission: sharing.updatePermission,
    revokeAccess: sharing.revokeAccess,
    ...sharing.state,
  }),
}));

const person = (id: string, grantedBy: string | null) => ({
  type: 'user' as const,
  user_id: id,
  display_name: `Person ${id}`,
  email: `${id}@example.org`,
  permission_level: 'viewer' as const,
  granted_at: '2026-11-01',
  granted_by: grantedBy,
});

const nav: ShareNav = {
  openPage: vi.fn(),
  back: vi.fn(),
  close: vi.fn(),
  captureImage: vi.fn(() => Promise.resolve(null)),
};

const renderAccess = (isOwner = true) =>
  render(<CanvasShareAccess canvasId="c1" isOwner={isOwner} canEdit nav={nav} />);

const group = {
  group_id: 'g1',
  group_name: 'KV Rhein-Sieg',
  permission_level: 'editor',
  shared_at: '',
};

beforeEach(() => {
  sharing.state = {};
  vi.clearAllMocks();
});

describe('CanvasShareAccess (owner)', () => {
  it('renders a row per project and the link row', () => {
    sharing.state = { canvasGroups: [group] };
    renderAccess();
    expect(screen.getByText('KV Rhein-Sieg')).toBeInTheDocument();
    expect(screen.getByLabelText('Zugriff für KV Rhein-Sieg')).toHaveValue('editor');
    expect(screen.getByText('Alle Grünen mit dem Link')).toBeInTheDocument();
    expect(screen.getByLabelText('Zugriff über den Link')).toHaveValue('viewer');
    expect(screen.getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument();
  });

  it('removes a project via the role select', async () => {
    sharing.state = { canvasGroups: [group] };
    renderAccess();
    await userEvent.selectOptions(screen.getByLabelText('Zugriff für KV Rhein-Sieg'), 'remove');
    expect(sharing.unshareFromGroup.mutate).toHaveBeenCalledWith('g1');
  });

  it('switches the link off at once when nobody joined through it', async () => {
    renderAccess();
    await userEvent.selectOptions(screen.getByLabelText('Zugriff über den Link'), 'off');
    expect(sharing.setShareMode.mutate).toHaveBeenCalledWith('private');
  });

  it('asks before switching the link off when people joined through it', async () => {
    sharing.state = { collaborators: [person('a', 'auto:share_link'), person('b', 'u9')] };
    renderAccess();
    await userEvent.selectOptions(screen.getByLabelText('Zugriff über den Link'), 'off');
    expect(sharing.setShareMode.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/1 Person verliert den Zugriff/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Link ausschalten' }));
    expect(sharing.setShareMode.mutate).toHaveBeenCalledWith('private');
  });

  it('keeps the link on when the confirmation is cancelled', async () => {
    sharing.state = { collaborators: [person('a', 'auto:share_link')] };
    renderAccess();
    await userEvent.selectOptions(screen.getByLabelText('Zugriff über den Link'), 'off');
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(sharing.setShareMode.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens the people page from the people row', async () => {
    sharing.state = {
      collaborators: [person('a', 'auto:share_link'), person('b', 'auto:share_link')],
    };
    renderAccess();
    await userEvent.click(screen.getByRole('button', { name: /2 Personen über den Link/ }));
    expect(nav.openPage).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Personen mit Zugriff' })
    );
  });

  it('labels mixed access and hides the row without people', () => {
    sharing.state = { collaborators: [person('a', 'auto:share_link'), person('b', 'u9')] };
    const view = renderAccess();
    expect(screen.getByText('2 Personen mit Zugriff')).toBeInTheDocument();
    view.unmount();
    sharing.state = {};
    renderAccess();
    expect(screen.queryByText(/Personen/)).toBeNull();
  });

  it('adds a project as viewer through the inline select', async () => {
    sharing.state = { userGroups: [{ id: 'g2', name: 'OV Bonn', role: 'member' }] };
    renderAccess();
    await userEvent.click(screen.getByRole('button', { name: 'Projekt hinzufügen' }));
    await userEvent.selectOptions(screen.getByLabelText('Projekt auswählen'), 'g2');
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(sharing.shareWithGroup.mutate).toHaveBeenCalledWith({
      groupId: 'g2',
      permissionLevel: 'viewer',
    });
  });

  it('shows skeleton rows while loading and a message on failure', () => {
    sharing.state = { isLoading: true };
    const view = renderAccess();
    expect(screen.getByLabelText('Freigaben werden geladen')).toHaveAttribute('aria-busy', 'true');
    view.unmount();
    sharing.state = { shareSettings: null };
    renderAccess();
    expect(screen.getByRole('alert')).toHaveTextContent('nicht geladen werden');
  });

  it('copies the canvas link and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAccess();
    await userEvent.click(screen.getByRole('button', { name: 'Link kopieren' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/studio/canvas/c1`);
    expect(await screen.findByRole('button', { name: 'Kopiert' })).toBeInTheDocument();
  });
});

describe('CanvasShareAccess (not the owner)', () => {
  it('shows no management controls, only the role line and the link button', () => {
    renderAccess(false);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Projekt hinzufügen')).toBeNull();
    expect(screen.getByText('Du kannst dieses Design bearbeiten')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument();
  });
});
