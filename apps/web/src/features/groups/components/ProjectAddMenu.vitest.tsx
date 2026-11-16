import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectAddMenu } from './ProjectAddMenu';

function setup(canAddLink: boolean) {
  const onPickExisting = vi.fn();
  const utils = renderWithProviders(
    <ProjectAddMenu
      groupId="g1"
      canAddLink={canAddLink}
      onPickExisting={onPickExisting}
      onFileAdded={vi.fn()}
      onTextAdded={vi.fn()}
      onError={vi.fn()}
    />
  );
  return { ...utils, onPickExisting };
}

describe('ProjectAddMenu', () => {
  it('is one button whose menu replaces the old header buttons', async () => {
    const { user, container } = setup(true);
    expect(screen.queryByRole('button', { name: 'Datei hinzufügen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(items).toEqual([
      'Datei',
      'Text',
      'Notebook',
      'Rezept',
      'Agent',
      'Doc, Sheet, Board …',
      'Link',
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the existing-content dialog in the picked category, links only for admins', async () => {
    const { user, onPickExisting } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(screen.queryByRole('menuitem', { name: 'Link' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Rezept' }));
    expect(onPickExisting).toHaveBeenCalledWith('recipes');
  });

  it('opens the text dialog from the menu', async () => {
    const { user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Text' }));
    expect(await screen.findByRole('dialog', { name: 'Text hinzufügen' })).toBeInTheDocument();
  });
});
