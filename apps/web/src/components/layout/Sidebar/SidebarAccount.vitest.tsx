import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test-utils';

import SidebarAccount from './SidebarAccount';

vi.mock('../../../features/notifications/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: { pages: [[{ id: 'n1' }]] }, hasNextPage: false }),
}));
vi.mock('../../../features/auth/hooks/useProfileData', () => ({
  useProfile: () => ({ data: null }),
}));
vi.mock('../../../features/notifications/components/NotificationList', () => ({
  default: () => <p>notification list</p>,
}));

describe('SidebarAccount notifications', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'u1', email: 'u1@example.org' } as never });
  });

  // The list is a lazy chunk since #5891: it has to arrive when the popover opens.
  it('loads the notification list when the bell opens', async () => {
    renderWithProviders(<SidebarAccount sidebarExpanded openRef={{ current: false }} />);
    expect(screen.queryByText('notification list')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Benachrichtigungen: 1 ungelesen' }));
    expect(await screen.findByText('notification list')).toBeInTheDocument();
  });
});
