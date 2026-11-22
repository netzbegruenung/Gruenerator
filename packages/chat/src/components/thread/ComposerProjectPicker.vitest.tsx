import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '../../stores/chatStore';

import { ComposerProjectPicker } from './ComposerProjectPicker';

const state = vi.hoisted(() => ({ isEmpty: true }));
vi.mock('@assistant-ui/react', () => ({
  useAuiState: (sel: (s: unknown) => unknown) =>
    sel({ optional: { thread: { isEmpty: state.isEmpty } } }),
}));
vi.mock('@gruenerator/shared/groups', () => ({
  useUserGroups: () => ({
    data: [
      { id: 'g1', name: 'Wärmewende' },
      { id: 'g2', name: 'Verkehr' },
      { id: 'sys', name: 'Grünerator', is_system: true },
      { id: 'old', name: 'Wahlkampf 2025', archived_at: '2026-11-01T00:00:00Z' },
    ],
  }),
}));

describe('ComposerProjectPicker', () => {
  beforeEach(() => {
    state.isEmpty = true;
    useAgentStore.setState({ pendingGroup: null });
  });

  it('lists the projects but not the system or archived ones and stores the pick for thread creation', async () => {
    const user = userEvent.setup();
    render(<ComposerProjectPicker />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Wärmewende')).toBeInTheDocument();
    expect(screen.getByText('Verkehr')).toBeInTheDocument();
    expect(screen.queryByText('Grünerator')).not.toBeInTheDocument();
    expect(screen.queryByText('Wahlkampf 2025')).not.toBeInTheDocument();
    await user.click(screen.getByText('Verkehr'));
    expect(useAgentStore.getState().pendingGroup?.id).toBe('g2');
  });

  it('renders nothing once the chat has messages', () => {
    state.isEmpty = false;
    const { container } = render(<ComposerProjectPicker />);
    expect(container).toBeEmptyDOMElement();
  });
});
