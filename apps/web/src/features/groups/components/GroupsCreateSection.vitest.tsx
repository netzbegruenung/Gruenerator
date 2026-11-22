import { describe, expect, it, vi } from 'vitest';

import GroupsCreateSection from './GroupsCreateSection';

import { renderWithProviders, screen } from '@/test-utils';

function setup(initialName = '') {
  const onCreateGroup = vi.fn();
  const view = renderWithProviders(
    <GroupsCreateSection
      isOpen
      onOpenChange={vi.fn()}
      onCreateGroup={onCreateGroup}
      isCreatingGroup={false}
      isCreateGroupError={false}
      createGroupError={null}
      initialName={initialName}
    />
  );
  return { ...view, onCreateGroup };
}

describe('GroupsCreateSection', () => {
  it('hands name, description and chosen files to the creator', async () => {
    const { user, onCreateGroup } = setup('Wärmewende');
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Wärmewende');

    await user.type(
      screen.getByRole('textbox', { name: /Worum geht es in diesem Projekt/ }),
      'Material für den Ortsverband'
    );
    const file = new File(['x'], 'konzept.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Dateien für das Projekt auswählen'), file);
    expect(screen.getByText('konzept.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Projekt erstellen' }));

    expect(onCreateGroup).toHaveBeenCalledWith('Wärmewende', [], {
      description: 'Material für den Ortsverband',
      files: [file],
    });
  });

  it('lets a chosen file be removed again', async () => {
    const { user, onCreateGroup } = setup('Test');
    const file = new File(['x'], 'weg.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Dateien für das Projekt auswählen'), file);
    await user.click(screen.getByRole('button', { name: 'weg.pdf entfernen' }));
    await user.click(screen.getByRole('button', { name: 'Projekt erstellen' }));
    expect(onCreateGroup).toHaveBeenCalledWith('Test', [], {
      description: '',
      files: [],
    });
  });

  it('always offers the invite field and hands typed addresses over', async () => {
    const { user, onCreateGroup } = setup('Team');
    await user.type(screen.getByPlaceholderText('name@beispiel.de'), 'mia@beispiel.de{Enter}');
    await user.click(screen.getByRole('button', { name: 'Erstellen & einladen' }));
    expect(onCreateGroup).toHaveBeenCalledWith('Team', ['mia@beispiel.de'], {
      description: '',
      files: [],
    });
  });
});
