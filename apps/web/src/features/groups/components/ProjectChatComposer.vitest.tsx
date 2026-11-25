import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectChatComposer } from './ProjectChatComposer';

// The real composer needs the hoisted chat runtime; here only the wiring counts.
vi.mock('../../workplace/components/ChatInner', () => ({
  default: (props: { projectId?: string; teamShared?: boolean }) => (
    <p>
      composer {props.projectId} team={String(props.teamShared)}
    </p>
  ),
}));

describe('ProjectChatComposer', () => {
  it('uses the start composer with this project, shared in the project by default', async () => {
    const { user, container } = renderWithProviders(<ProjectChatComposer groupId="g1" />);
    expect(screen.getByText('composer g1 team=true')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Im Projekt teilen' })).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('switch', { name: 'Im Projekt teilen' }));
    expect(screen.getByText('composer g1 team=false')).toBeInTheDocument();
    expect(screen.getByText('Privat – nutzt trotzdem das Wissen des Projekts')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
