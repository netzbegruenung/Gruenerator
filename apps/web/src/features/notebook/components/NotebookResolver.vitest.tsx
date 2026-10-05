import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test-utils';

vi.mock('../../../components/common/LoginRequired/withAuthRequired', () => ({
  default: <P,>(Component: P) => Component,
}));
// The page itself is out of scope — what it is handed is the question here.
vi.mock('./NotebookPage', () => ({
  DynamicNotebookPage: ({ id }: { id: string }) => <p>page:{id}</p>,
  NotebookPageContent: () => <p>system</p>,
}));

const { NotebookResolver } = await import('./NotebookResolver');

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/notebooks/:idOrSlug" element={<NotebookResolver />} />
    </Routes>,
    { route }
  );

describe('NotebookResolver', () => {
  // MSW fails any unhandled request, so a resolve round trip would break these.
  it('hands a pretty slug straight to the page, without resolving it first', () => {
    renderAt('/notebooks/presseschau-Ab3xK9');

    expect(screen.getByText('page:presseschau-Ab3xK9')).toBeInTheDocument();
  });

  it('hands a UUID straight to the page', () => {
    renderAt('/notebooks/11111111-2222-3333-4444-555555555555');

    expect(screen.getByText('page:11111111-2222-3333-4444-555555555555')).toBeInTheDocument();
  });

  it('calls a segment without a slug tail unknown', () => {
    renderAt('/notebooks/gibtsnicht');

    expect(screen.getByText('Notebook "gibtsnicht" nicht gefunden.')).toBeInTheDocument();
  });
});
