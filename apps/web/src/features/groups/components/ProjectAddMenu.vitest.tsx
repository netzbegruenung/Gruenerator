import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectAddMenu } from './ProjectAddMenu';

function setup(canAddLink: boolean) {
  const onPickExisting = vi.fn();
  const onAddLink = vi.fn();
  const utils = renderWithProviders(
    <ProjectAddMenu
      groupId="g1"
      onPickExisting={onPickExisting}
      {...(canAddLink && { onAddLink })}
      onFileAdded={vi.fn()}
      onTextAdded={vi.fn()}
      onError={vi.fn()}
    />
  );
  return { ...utils, onPickExisting, onAddLink };
}

describe('ProjectAddMenu', () => {
  it('puts picking existing content first, then what is created new', async () => {
    const { user, container } = setup(true);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(items).toEqual(['Vorhandenes hinzufügen …', 'Datei hochladen', 'Text', 'Link']);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the picker; links only for admins', async () => {
    const { user, onPickExisting } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(screen.queryByRole('menuitem', { name: 'Link' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Vorhandenes hinzufügen …' }));
    expect(onPickExisting).toHaveBeenCalledTimes(1);
  });

  it('opens the text dialog from the menu', async () => {
    const { user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Text' }));
    expect(await screen.findByRole('dialog', { name: 'Text hinzufügen' })).toBeInTheDocument();
  });
});
