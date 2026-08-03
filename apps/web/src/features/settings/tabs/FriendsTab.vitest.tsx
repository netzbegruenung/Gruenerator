import { GRUENERATOR_FRIENDS } from '@gruenerator/shared/avatar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FriendsTab from './FriendsTab';

import type * as UiModule from '@gruenerator/ui';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen } from '@/test-utils';

/**
 * Die Frage hier ist, WER zur Wahl steht: Im Einrichtungsschritt nur der
 * Dreier, im Bereich selbst die ganze Truppe. Der Rest des Bereichs (Profil,
 * Wolke, Speichern) ist gemockt — er entscheidet über diese Frage nichts mit.
 */

const updateAvatar = vi.fn<(id: number) => Promise<unknown>>().mockResolvedValue({});
let shareLinks: unknown[] = [];
let avatarRobotId: number | null = 1;

vi.mock('@/features/auth/hooks/useProfileData', () => ({
  QUERY_KEYS: { profile: (id: string) => ['profileData', id] },
  useProfile: () => ({ data: { avatar_robot_id: avatarRobotId } }),
}));

vi.mock('@gruenerator/wolke', () => ({
  useShareLinks: () => ({ data: shareLinks }),
  fetchShareLinks: vi.fn(),
  wolkeKeys: { shareLinks: () => ['wolke', 'shareLinks'] },
}));

vi.mock('@/features/auth/services/profileApiService', () => ({
  profileApiService: { updateAvatar: (id: number) => updateAvatar(id), getProfile: vi.fn() },
}));

vi.mock('@/stores/profileStore', () => ({
  useProfileStore: (selector: (s: { updateAvatarOptimistic: () => Promise<void> }) => unknown) =>
    selector({ updateAvatarOptimistic: () => Promise.resolve() }),
}));

vi.mock('@gruenerator/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof UiModule>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  shareLinks = [];
  avatarRobotId = 1;
  updateAvatar.mockClear();
  useAuthStore.setState({ user: { id: 'u1' } as never });
});

describe('FriendsTab', () => {
  it('offers only the three starters in the setup step', () => {
    renderWithProviders(<FriendsTab starterOnly />);

    expect(screen.getAllByRole('button')).toHaveLength(3);
    for (const name of ['Feuri', 'Robosam', 'Schildi']) {
      expect(screen.getByRole('button', { name: `${name} auswählen` })).toBeInTheDocument();
    }
  });

  it('offers the whole cast in the settings section', () => {
    renderWithProviders(<FriendsTab />);

    expect(screen.getAllByRole('button')).toHaveLength(GRUENERATOR_FRIENDS.length);
  });

  it('marks the stored friend as the chosen one', () => {
    avatarRobotId = 3;
    renderWithProviders(<FriendsTab />);

    const pressed = screen.getAllByRole('button', { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('Schildi auswählen');
  });

  it('saves the clicked friend', async () => {
    const { user } = renderWithProviders(<FriendsTab />);

    await user.click(screen.getByRole('button', { name: 'Robosam auswählen' }));
    expect(updateAvatar).toHaveBeenCalledWith(2);
  });

  it('keeps Wolki locked until the Wolke is connected', () => {
    renderWithProviders(<FriendsTab />);

    expect(
      screen.getByRole('button', { name: /Wolki — verbinde deine Wolke zum Freischalten/ })
    ).toBeDisabled();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<FriendsTab />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
