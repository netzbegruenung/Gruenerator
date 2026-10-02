import { type TransformedCollection } from '@gruenerator/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../../test-utils';

import { HubHero } from './HubHero';

const collection = {
  id: 'nb-1',
  user_id: 'u1',
  name: 'Pressespiegel Lokal',
  description: null,
  custom_prompt: null,
  selection_mode: 'documents',
  auto_sync: false,
  remove_missing_on_sync: false,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  documents: [],
  document_count: 0,
  wolke_share_links: [],
  has_wolke_sources: false,
  documents_from_wolke: 0,
  labels: ['Presse'],
} satisfies TransformedCollection;

function setup(props: Partial<Parameters<typeof HubHero>[0]> = {}) {
  const onSave = vi.fn();
  const utils = render(
    <HubHero collection={collection} canEdit startEditingTitle={false} onSave={onSave} {...props} />
  );
  return { ...utils, onSave, user: userEvent.setup() };
}

describe('HubHero', () => {
  it('speichert einen neuen Namen mit Enter', async () => {
    const { user, onSave } = setup();

    await user.click(screen.getByRole('button', { name: /Pressespiegel Lokal/ }));
    const input = screen.getByRole('textbox', { name: 'Namen bearbeiten' });
    await user.clear(input);
    await user.type(input, 'Kreistag Juni{Enter}');

    expect(onSave).toHaveBeenCalledWith({ name: 'Kreistag Juni' });
    expect(screen.queryByRole('textbox', { name: 'Namen bearbeiten' })).not.toBeInTheDocument();
  });

  it('verwirft die Änderung mit Escape', async () => {
    const { user, onSave } = setup();

    await user.click(screen.getByRole('button', { name: /Pressespiegel Lokal/ }));
    await user.type(screen.getByRole('textbox', { name: 'Namen bearbeiten' }), ' neu{Escape}');

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pressespiegel Lokal');
  });

  it('speichert keinen leeren Namen', async () => {
    const { user, onSave } = setup();

    await user.click(screen.getByRole('button', { name: /Pressespiegel Lokal/ }));
    await user.clear(screen.getByRole('textbox', { name: 'Namen bearbeiten' }));
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });

  it('bricht die Beschreibung mit Shift+Enter um und speichert mit Enter', async () => {
    const { user, onSave } = setup();

    await user.click(screen.getByRole('button', { name: /Beschreibung bearbeiten/ }));
    await user.type(
      screen.getByRole('textbox', { name: 'Beschreibung bearbeiten' }),
      'Zeile 1{Shift>}{Enter}{/Shift}Zeile 2{Enter}'
    );

    expect(onSave).toHaveBeenCalledWith({ description: 'Zeile 1\nZeile 2' });
  });

  it('öffnet ein frisch angelegtes Notebook direkt im Namensfeld', () => {
    setup({ startEditingTitle: true });
    expect(screen.getByRole('textbox', { name: 'Namen bearbeiten' })).toHaveFocus();
  });

  it('zeigt Labels, Werkzeugleiste und Aktionen', () => {
    setup({
      toolbar: <button type="button">Suchen</button>,
      actions: <button type="button">+ Dateien hochladen</button>,
    });
    expect(screen.getByText('Presse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suchen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Dateien hochladen' })).toBeInTheDocument();
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
