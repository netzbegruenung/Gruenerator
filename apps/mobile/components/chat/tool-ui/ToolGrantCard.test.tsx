import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { lightTheme } from '../../../theme/colors';

import { ToolGrantCard } from './ToolGrantCard';

const mockAnswerToolGrant =
  jest.fn<
    (
      ...args: unknown[]
    ) => Promise<{ status: 'resolved'; scope: string } | { status: 'error'; message: string }>
  >();

jest.mock('@gruenerator/chat', () => ({
  TOOL_GRANT_OPTIONS: [
    { scope: 'denied', label: 'Ablehnen' },
    { scope: 'session', label: 'Nur dieses Gespräch' },
    { scope: 'always', label: 'Immer' },
  ],
  answerToolGrant: (...args: unknown[]) => mockAnswerToolGrant(...args),
  toolGrantResolvedLabel: (scope: string) =>
    scope === 'denied' ? 'Abgeschaltet' : 'Für dieses Gespräch freigegeben',
  toolGrantSubtitle: () => 'Die neuen Werkzeuge bleiben ungenutzt, bis du sie freigibst.',
  toolGrantTitle: (g: { serverName: string }) => `${g.serverName} bietet neue Werkzeuge an`,
  toolGrantTools: (g: { added: string[]; changed: string[] }) => [...g.changed, ...g.added],
}));

const grant = {
  serverId: 's1',
  serverName: 'Demo',
  added: ['themes-get_theme'],
  changed: [],
  threadId: 't1',
};

describe('ToolGrantCard (native)', () => {
  beforeEach(() => {
    mockAnswerToolGrant.mockReset().mockResolvedValue({ status: 'resolved', scope: 'session' });
  });

  it('shows the server, the tools and the three scopes', () => {
    render(<ToolGrantCard grant={grant} theme={lightTheme} />);
    expect(screen.getByText('Demo bietet neue Werkzeuge an')).toBeTruthy();
    expect(screen.getByText('themes-get_theme')).toBeTruthy();
    for (const label of ['Ablehnen', 'Nur dieses Gespräch', 'Immer']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('answers "only this conversation" and collapses to the badge', async () => {
    render(<ToolGrantCard grant={grant} theme={lightTheme} />);
    fireEvent.press(screen.getByLabelText('Nur dieses Gespräch'));

    expect(mockAnswerToolGrant).toHaveBeenCalledWith(grant, 't1', 'session');
    await waitFor(() => expect(screen.getByText('Für dieses Gespräch freigegeben')).toBeTruthy());
  });

  it('keeps the buttons and shows the error when the answer fails', async () => {
    mockAnswerToolGrant.mockResolvedValue({ status: 'error', message: 'Kaputt' });
    render(<ToolGrantCard grant={grant} theme={lightTheme} />);
    fireEvent.press(screen.getByLabelText('Immer'));

    await waitFor(() => expect(screen.getByText('Kaputt')).toBeTruthy());
    expect(screen.getByLabelText('Immer')).toBeTruthy();
  });

  it('renders an answered card as a badge after reload', () => {
    render(<ToolGrantCard grant={{ ...grant, resolved: 'denied' }} theme={lightTheme} />);
    expect(screen.getByText('Abgeschaltet')).toBeTruthy();
  });
});
