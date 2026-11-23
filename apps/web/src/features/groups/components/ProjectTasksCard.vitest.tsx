import { type RecurringTask } from '@gruenerator/contracts';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectTasksCard } from './ProjectTasksCard';

const tasks = vi.hoisted(() => ({ value: [] as RecurringTask[] }));
vi.mock('../../recurring-tasks/api', () => ({
  useRecurringTasks: () => ({ data: tasks.value }),
}));

const enabled = vi.hoisted(() => ({ value: true }));
vi.mock('../../recurring-tasks/useScheduledTasksEnabled', () => ({
  useScheduledTasksEnabled: () => enabled.value,
}));

const task = (id: string, groupId: string | null): RecurringTask =>
  ({
    id,
    title: `Aufgabe ${id}`,
    groupId,
    enabled: true,
    recurrence: { frequency: 'daily', hour: 9, minute: 0 },
  }) as RecurringTask;

describe('ProjectTasksCard', () => {
  beforeEach(() => {
    enabled.value = true;
  });

  it('renders nothing while „Geplante Aufgaben“ is off', () => {
    enabled.value = false;
    tasks.value = [task('a', 'g1')];
    const { container } = renderWithProviders(<ProjectTasksCard groupId="g1" archived={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Geplant')).not.toBeInTheDocument();
  });

  it('lists only the tasks of this project and links „+ Aufgabe“ with the project preselected', async () => {
    tasks.value = [task('a', 'g1'), task('b', 'g2'), task('c', null)];
    const { container } = renderWithProviders(<ProjectTasksCard groupId="g1" archived={false} />);
    expect(screen.getByText('Aufgabe a')).toBeInTheDocument();
    expect(screen.queryByText('Aufgabe b')).not.toBeInTheDocument();
    expect(screen.queryByText('Aufgabe c')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Aufgabe$/ })).toHaveAttribute(
      'href',
      '/wiederkehrend/neu?projekt=g1'
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows an invitation when the project has no task yet', () => {
    tasks.value = [task('b', 'g2')];
    renderWithProviders(<ProjectTasksCard groupId="g1" archived={false} />);
    expect(screen.getByText(/regelmäßig etwas für dieses Projekt/)).toBeInTheDocument();
  });

  it('offers no new task in an archived project', () => {
    tasks.value = [];
    renderWithProviders(<ProjectTasksCard groupId="g1" archived />);
    expect(screen.queryByRole('link', { name: /Aufgabe$/ })).not.toBeInTheDocument();
  });

  it('shows the tasks of an archived project as paused (#5951)', () => {
    tasks.value = [task('a', 'g1')];
    renderWithProviders(<ProjectTasksCard groupId="g1" archived />);
    expect(screen.getByText(/Pausiert, solange das Projekt archiviert ist/)).toBeInTheDocument();
    expect(screen.getByText(/· pausiert/)).toBeInTheDocument();
  });
});
