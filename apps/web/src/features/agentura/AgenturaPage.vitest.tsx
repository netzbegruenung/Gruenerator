/**
 * `/agentura` ist seit Oktober 2026 der Marktplatz. Alte Links leben weiter:
 * ein Shop-Link landet mit Art, Herkunft und Suche auf `/marktplatz`, ein Link
 * auf die frühere Übersicht auf `/grueneratoren`.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import AgenturaPage from './AgenturaPage';

function Landing() {
  const location = useLocation();
  return <output aria-label="Ziel">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(route: string) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/agentura" element={<AgenturaPage />} />
        <Route path="/marktplatz" element={<Landing />} />
        <Route path="/grueneratoren" element={<Landing />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByLabelText('Ziel');
}

describe('Alte Agentura-Links', () => {
  it('führen den Shop auf den Marktplatz', () => {
    expect(renderAt('/agentura')).toHaveTextContent(/^\/marktplatz$/);
  });

  it('nehmen Art, Herkunft und Suche mit', () => {
    expect(renderAt('/agentura?type=recipe&von=landesverband&q=presse')).toHaveTextContent(
      '/marktplatz?art=rezepte&von=landesverband&q=presse'
    );
  });

  it('führen das alte Regal „Öffentlich“ in die Herkunft „Öffentlich“', () => {
    expect(renderAt('/agentura?cat=community')).toHaveTextContent('/marktplatz?von=oeffentlich');
  });

  it('führen das alte Regal „Meine Grüneratoren“ auf die Übersicht', () => {
    expect(renderAt('/agentura?cat=meine')).toHaveTextContent(/^\/grueneratoren$/);
  });
});
