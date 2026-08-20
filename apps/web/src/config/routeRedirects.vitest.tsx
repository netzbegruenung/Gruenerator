/**
 * The `/notebook/:id` → `/notebooks/:id` hop used to rebuild the target from the
 * id alone, dropping the query string and the router state along the way. A
 * notebook thread row links with `?thread=<id>`, so the conversation id never
 * reached the page and every such link opened a blank start page instead.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LegacyNotebookIdRedirectComponent } from './routes';

function LandingProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="state">{JSON.stringify(location.state)}</span>
    </div>
  );
}

function renderRedirectFrom(entry: string, state?: unknown) {
  render(
    <MemoryRouter initialEntries={[state === undefined ? entry : { pathname: entry, state }]}>
      <Routes>
        <Route path="/notebook/:id" element={<LegacyNotebookIdRedirectComponent />} />
        <Route path="/notebooks/:idOrSlug" element={<LandingProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LegacyNotebookIdRedirect', () => {
  it('keeps the thread the link points at', () => {
    renderRedirectFrom('/notebook/abc-123?thread=t-42');
    expect(screen.getByTestId('path')).toHaveTextContent('/notebooks/abc-123');
    expect(screen.getByTestId('search')).toHaveTextContent('?thread=t-42');
  });

  it('carries the router state across the hop', () => {
    // How the sidebar resumes a locally cached notebook conversation.
    renderRedirectFrom('/notebook/abc-123', { resumeNotebookChat: true });
    expect(screen.getByTestId('state')).toHaveTextContent('{"resumeNotebookChat":true}');
  });

  it('still redirects a bare legacy link', () => {
    renderRedirectFrom('/notebook/abc-123');
    expect(screen.getByTestId('path')).toHaveTextContent('/notebooks/abc-123');
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();
  });
});
