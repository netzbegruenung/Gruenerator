/**
 * The `/notebook/:id` → `/notebooks/:id` hop used to rebuild the target from the
 * id alone, dropping the query string and the router state along the way. A
 * notebook thread row links with `?thread=<id>`, so the conversation id never
 * reached the page and every such link opened a blank start page instead.
 */
import { render, screen } from '@testing-library/react';
import { Suspense, type ComponentType } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  LegacyNotebookIdRedirectComponent,
  RetiredStudioCategoryRedirectComponent,
  VorlagenMeineRedirectComponent,
  routes,
} from './routes';

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

describe('VorlagenMeineRedirect', () => {
  function renderMeine(entry: string) {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/vorlagen/meine" element={<VorlagenMeineRedirectComponent />} />
          <Route path="/vorlagen" element={<LandingProbe />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('opens the gallery with the Meine-Vorlagen filter', () => {
    renderMeine('/vorlagen/meine');
    expect(screen.getByTestId('path')).toHaveTextContent('/vorlagen');
    expect(screen.getByTestId('search')).toHaveTextContent('?cat=meine');
  });

  it('keeps other query parameters', () => {
    renderMeine('/vorlagen/meine?utm=mail');
    expect(screen.getByTestId('search')).toHaveTextContent('?utm=mail&cat=meine');
  });
});

describe('RetiredStudioCategoryRedirect', () => {
  function renderStudioRedirectFrom(entry: string) {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/studio/:category" element={<RetiredStudioCategoryRedirectComponent />} />
          <Route
            path="/studio/:category/:type"
            element={<RetiredStudioCategoryRedirectComponent />}
          />
          <Route path="/studio" element={<LandingProbe />} />
          <Route path="/vorlagen" element={<LandingProbe />} />
          <Route path="/studio/bild" element={<LandingProbe />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('sends the retired profile-picture template to the Profilbild tool', async () => {
    const entry = routes.find((r) => r.path === '/studio/templates/profilbild');
    const Redirect = entry!.component as ComponentType;
    render(
      <MemoryRouter initialEntries={['/studio/templates/profilbild']}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/studio/templates/profilbild" element={<Redirect />} />
            <Route path="/studio/profilbild" element={<LandingProbe />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );
    expect(await screen.findByTestId('path')).toHaveTextContent('/studio/profilbild');
  });

  it.each(['/studio/templates', '/studio/templates/dreizeilen'])(
    'sends %s to the Grünerator-Vorlagen',
    (entry) => {
      renderStudioRedirectFrom(entry);
      expect(screen.getByTestId('path')).toHaveTextContent('/vorlagen');
    }
  );

  it.each(['/studio/ki-alt', '/studio/unknown/type'])('sends %s to the studio landing', (entry) => {
    renderStudioRedirectFrom(entry);
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/studio$/);
  });
});
