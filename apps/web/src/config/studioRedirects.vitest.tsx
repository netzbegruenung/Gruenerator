import { Suspense, createElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { render, screen } from '../test-utils';

import { routes } from './routes';

function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="Adresse">{pathname + search}</output>;
}

function renderFrom(from: string) {
  const route = routes.find((r) => r.path === new URL(from, 'http://x').pathname);
  if (!route) throw new Error(`no route for ${from}`);
  return render(
    <MemoryRouter initialEntries={[from]}>
      <Suspense fallback={null}>
        <Routes>
          <Route path={route.path} element={createElement(route.component)} />
          <Route path="*" element={<Where />} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
}

// Studio and Mediathek are one page, creation moved into the chat (11/2026).
// The old addresses stay reachable for good: links, pinned tabs, search hits.
describe('studio redirects', () => {
  it.each([
    ['/studio/mediathek?typ=audio', '/studio?typ=audio'],
    ['/media-library', '/studio'],
    ['/studio/gallery', '/studio'],
    ['/studio/freistellen', '/studio'],
    ['/studio/freitext', '/chat'],
    ['/studio/bild', '/chat'],
  ])('%s leads to %s', async (from, to) => {
    renderFrom(from);
    expect(await screen.findByLabelText('Adresse')).toHaveTextContent(to);
  });
});
