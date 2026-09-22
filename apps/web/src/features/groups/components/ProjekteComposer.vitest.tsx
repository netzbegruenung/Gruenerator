import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-utils';

import { ProjekteComposer } from './ProjekteComposer';

import type { GroupSummary } from '@gruenerator/shared/groups';

const projekte: GroupSummary[] = [
  { id: 'projekt-1', name: 'Wahlkampf', role: 'admin', isAdmin: true, group_type: 'personal' },
];

function setup() {
  const onCreate = vi.fn();
  const view = renderWithProviders(
    <ProjekteComposer projekte={projekte} isCreating={false} onCreate={onCreate} />
  );
  return { ...view, onCreate, input: screen.getByRole('textbox') };
}

describe('ProjekteComposer', () => {
  it('does not create a Projekt when Enter is pressed on text that matches nothing (#3498)', async () => {
    const { user, onCreate, input } = setup();
    await user.type(input, 'schreibe mir eine pressemitteilung{Enter}');
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Auswahl bestätigen' })).toBeDisabled();
  });

  it('creates once a create row is chosen with the arrow key', async () => {
    const { user, onCreate, input } = setup();
    await user.type(input, 'OV Kommunikation{ArrowDown}{Enter}');
    expect(onCreate).toHaveBeenCalledWith('OV Kommunikation', 'personal');
  });

  it('creates from an explicit click on a create row', async () => {
    const { user, onCreate, input } = setup();
    await user.type(input, 'OV Kommunikation');
    await user.click(screen.getByRole('button', { name: /als Gruppe erstellen/ }));
    expect(onCreate).toHaveBeenCalledWith('OV Kommunikation', 'standard');
  });

  it('still preselects a matching Projekt, so Enter opens it instead of creating', async () => {
    const { user, onCreate, input } = setup();
    await user.type(input, 'wahl{Enter}');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
