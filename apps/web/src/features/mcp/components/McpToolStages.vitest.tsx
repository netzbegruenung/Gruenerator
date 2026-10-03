/**
 * Drei Stufen pro Werkzeug. „Nachfragen" hat keine Zeile, also schickt die
 * Auswahl `decision: null`; „Aus" und „Immer erlauben" schreiben die Zeile.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpToolStages } from './McpToolStages';

import { axe, render } from '@/test-utils';

const mutate = vi.fn();
let approvals: Array<{ scopeKey: string; decision?: 'allow' | 'deny' }> = [];
vi.mock('../hooks/useToolApprovals', () => ({
  useToolApprovals: () => ({ data: approvals }),
  useSetToolDecision: () => ({ mutate, isPending: false }),
}));

function renderStages() {
  return render(
    <McpToolStages
      serverId="s1"
      serverName="Demo"
      toolNames={['search', 'delete_all']}
      newTools={['delete_all']}
      onError={vi.fn()}
    />
  );
}

describe('McpToolStages', () => {
  beforeEach(() => {
    mutate.mockReset();
    approvals = [{ scopeKey: 'mcp:s1/search', decision: 'allow' }];
  });

  it('zeigt die gespeicherte Stufe, sonst „Nachfragen", und markiert Neues', async () => {
    const user = userEvent.setup();
    renderStages();
    await user.click(screen.getByText('Werkzeuge (2)'));

    const search = screen.getByRole('group', { name: 'Stufe für search' });
    expect((search.querySelector('input[value="allow"]') as HTMLInputElement).checked).toBe(true);
    const fresh = screen.getByRole('group', { name: 'Stufe für delete_all' });
    expect((fresh.querySelector('input[value="ask"]') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('neu')).toBeTruthy();
  });

  it('schreibt „Aus" als deny und „Nachfragen" als gelöschte Zeile', async () => {
    const user = userEvent.setup();
    renderStages();
    await user.click(screen.getByText('Werkzeuge (2)'));

    await user.click(screen.getAllByText('Aus')[1] as HTMLElement);
    expect(mutate).toHaveBeenLastCalledWith(
      { scopeKey: 'mcp:s1/delete_all', toolLabel: 'Demo · delete_all', decision: 'deny' },
      expect.anything()
    );

    await user.click(screen.getAllByText('Nachfragen')[0] as HTMLElement);
    expect(mutate).toHaveBeenLastCalledWith(
      { scopeKey: 'mcp:s1/search', toolLabel: 'Demo · search', decision: null },
      expect.anything()
    );
  });

  it('hat keine a11y-Verstösse', async () => {
    const user = userEvent.setup();
    const { container } = renderStages();
    await user.click(screen.getByText('Werkzeuge (2)'));
    expect(await axe(container)).toHaveNoViolations();
  });
});
