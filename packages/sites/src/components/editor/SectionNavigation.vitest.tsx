import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderWithDraft } from '../../test/renderWithDraft';
import { useEditorStore } from '../../stores/editorStore';

import { SectionNavigation } from './SectionNavigation';

describe('SectionNavigation', () => {
  beforeEach(() => useEditorStore.setState({ activeSection: 'hero' }));

  it('marks a hidden section with "ausgeblendet"', () => {
    renderWithDraft(<SectionNavigation />, { hidden: ['actions'] });
    expect(screen.getByRole('button', { name: /Aktionen/ })).toHaveTextContent('ausgeblendet');
    expect(screen.getByRole('button', { name: /Themen/ })).not.toHaveTextContent('ausgeblendet');
  });

  it('opens the Einstellungen and Impressum panels', async () => {
    const { user } = renderWithDraft(<SectionNavigation />);
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
    expect(useEditorStore.getState().activeSection).toBe('settings');
    await user.click(screen.getByRole('button', { name: 'Impressum' }));
    expect(useEditorStore.getState().activeSection).toBe('legal');
  });
});
