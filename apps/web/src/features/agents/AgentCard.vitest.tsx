import { type Agent } from '@gruenerator/shared/agents';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentCard from './AgentCard';

const mutate = vi.fn();
const showTrashUndo = vi.fn();

vi.mock('./api', () => ({
  useDeleteUserAgent: () => ({ mutate, isPending: false }),
}));

vi.mock('../trash/trashUndoToast', () => ({
  useTrashUndoToast: () => showTrashUndo,
}));

const agent = {
  id: '6f1c2e8a-0000-4000-8000-000000000001',
  identifier: 'pressestelle',
  title: 'Pressestelle',
  description: 'Schreibt Pressemitteilungen.',
} as Agent;

describe('AgentCard delete', () => {
  beforeEach(() => {
    mutate.mockReset();
    showTrashUndo.mockReset();
  });

  // DELETE addresses the agent by its identifier, the trash by its row uuid —
  // passing the identifier to the toast would make „Rückgängig" 404.
  it('deletes by identifier and offers undo by row uuid', async () => {
    mutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AgentCard agent={agent} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    await user.click(within(await screen.findByRole('menu')).getByText('Löschen'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      '„Pressestelle“ wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));

    expect(mutate).toHaveBeenCalledWith('pressestelle', expect.anything());
    expect(showTrashUndo).toHaveBeenCalledWith({
      kind: 'user_agent',
      id: agent.id,
      title: 'Pressestelle',
    });
  });
});
