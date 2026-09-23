import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import GroupDetailSection from './GroupDetailSection';

import type * as SharedApi from '@gruenerator/shared/api';

/**
 * GlitchTip #590. Opening `/projekte/<uuid>` for a group you are not a member
 * of answers 403 — the designed outcome, not a fault. The component used to
 * bail on `!data` *before* its error branch, so a failed query rendered `null`
 * and the user got a blank page.
 *
 * Both cases below therefore fail on the pre-fix component (each renders
 * nothing), and they discriminate: 403 must reach the calm "no access" panel
 * while any other failure keeps the red error box.
 */

const FORBIDDEN = {
  status: 403,
  body: { message: 'Du bist nicht Mitglied dieser Gruppe.' },
};

const SERVER_ERROR = { status: 500, body: { message: 'Datenbank nicht erreichbar.' } };

// Every `groups.*` call answers the same way, which covers the sibling queries
// this component mounts (user groups, shared content) besides `getDetails`.
const respondWith = (response: unknown) => ({
  groups: new Proxy({}, { get: () => () => Promise.resolve(response) }),
});

const getContractsClientMock = vi.fn<() => unknown>();

// Keep `apiErrorFromResponse` and `isApiErrorWithStatus` real — the status
// travelling from the response into the render branch is the thing under test.
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedApi>()),
  // Cast at the mock boundary: the stub answers the `groups.*` calls this
  // component makes, not the client's full surface.
  getContractsClient: () =>
    getContractsClientMock() as ReturnType<typeof SharedApi.getContractsClient>,
}));

// Opens a Hocuspocus websocket on mount; irrelevant here and unavailable in jsdom.
vi.mock('../hooks/useGroupPresence', () => ({
  useGroupPresence: () => ({ onlineMembers: [], provider: null }),
}));

vi.mock('../../../hooks/useAuth', () => ({
  useOptimizedAuth: () => ({
    user: { id: 'user-1', email: 'test@example.org' },
    isAuthenticated: true,
    loading: false,
  }),
  default: () => ({ user: null, isAuthenticated: false, loading: false }),
}));

function renderSection() {
  return renderWithProviders(
    <GroupDetailSection
      groupId="002bef3e-711f-4047-b719-e6b58ffce082"
      onSuccessMessage={vi.fn()}
      onErrorMessage={vi.fn()}
    />
  );
}

describe('GroupDetailSection', () => {
  it('shows a "no access" panel on 403 instead of a blank page', async () => {
    getContractsClientMock.mockReturnValue(respondWith(FORBIDDEN));

    renderSection();

    expect(await screen.findByText('Kein Zugriff auf dieses Projekt')).toBeInTheDocument();
    // The backend's own wording, which the old bare `Error` threw away.
    expect(screen.getByText('Du bist nicht Mitglied dieser Gruppe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zu meinen Projekten' })).toBeInTheDocument();
  });

  it('keeps the red error box for a failure that is not an access decision', async () => {
    getContractsClientMock.mockReturnValue(respondWith(SERVER_ERROR));

    renderSection();

    expect(await screen.findByText(/Fehler beim Laden der Gruppendetails/)).toBeInTheDocument();
    expect(screen.queryByText('Kein Zugriff auf dieses Projekt')).not.toBeInTheDocument();
  });

  it('has no a11y violations in the no-access state', async () => {
    getContractsClientMock.mockReturnValue(respondWith(FORBIDDEN));

    const { container } = renderSection();
    await screen.findByText('Kein Zugriff auf dieses Projekt');

    expect(await axe(container)).toHaveNoViolations();
  });
});
