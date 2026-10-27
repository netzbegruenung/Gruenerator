import { beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { useNotebookFilterStore } from '../../stores/notebookFilterStore';

import { NotebookChatFilterChips } from './NotebookChatFilterChips';

beforeEach(() => {
  useNotebookFilterStore.setState({ notebookId: null, keywordFilters: {}, collectionIds: null });
});

describe('NotebookChatFilterChips', () => {
  it('shows the active facets of this notebook, topics by their label', async () => {
    useNotebookFilterStore.setState({
      notebookId: 'hamburg',
      keywordFilters: { themes: ['klima'], content_type: ['presse'] },
    });
    await render(<NotebookChatFilterChips notebookId="hamburg" />);

    expect(screen.getByText('Klima & Umwelt')).toBeTruthy();
    expect(screen.getByText('presse')).toBeTruthy();
  });

  it('hides a selection that belongs to another notebook', async () => {
    useNotebookFilterStore.setState({
      notebookId: 'berlin',
      keywordFilters: { themes: ['klima'] },
    });
    await render(<NotebookChatFilterChips notebookId="hamburg" />);

    expect(screen.queryByText('Klima & Umwelt')).toBeNull();
  });

  it('drops a facet on tap, keeping the others', async () => {
    useNotebookFilterStore.setState({
      notebookId: 'hamburg',
      keywordFilters: { themes: ['klima', 'sicherheit'] },
    });
    await render(<NotebookChatFilterChips notebookId="hamburg" />);

    await fireEvent.press(screen.getByLabelText('Filter Klima & Umwelt entfernen'));

    expect(useNotebookFilterStore.getState().keywordFilters).toEqual({ themes: ['sicherheit'] });
    expect(screen.queryByText('Klima & Umwelt')).toBeNull();
  });

  it('shows a narrowed source selection and widens it back to all on tap', async () => {
    useNotebookFilterStore.setState({
      notebookId: 'gruene',
      keywordFilters: { themes: ['klima'] },
      collectionIds: ['grundsatz-system', 'gruenblog-system'],
    });
    await render(<NotebookChatFilterChips notebookId="gruene" />);

    await fireEvent.press(screen.getByLabelText('Filter Grundsatzprogramm, Grünblog entfernen'));

    expect(useNotebookFilterStore.getState().collectionIds).toBeNull();
    expect(useNotebookFilterStore.getState().keywordFilters).toEqual({ themes: ['klima'] });
  });
});
