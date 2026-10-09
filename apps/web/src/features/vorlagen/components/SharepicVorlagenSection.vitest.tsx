import { type SharepicVorlage } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { SharepicVorlagenSection } from './SharepicVorlagenSection';

import { axe, renderWithProviders } from '@/test-utils';

const LIST = 'http://localhost/api/sharepic-vorlagen';

const vorlage = (id: string, locale: SharepicVorlage['locale']): SharepicVorlage => ({
  id,
  locale,
  titel: `Zitat ${id}`,
  beschreibung: 'Ein Zitat auf Grün.',
  form: 'zitat',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Zitat-Sharepic mit dem Satz „Bus statt Stau“'] },
  attributions: [null],
  spec: {
    locale,
    slides: [
      {
        background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'tanne' },
        position: 'mitte',
        align: 'links',
        items: [{ type: 'headline', lines: ['Bus statt Stau'] }],
        logo: true,
      },
    ],
  },
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function Where() {
  const location = useLocation();
  return <output aria-label="Ort">{location.pathname}</output>;
}

function renderSection() {
  return renderWithProviders(
    <Routes>
      <Route path="/vorlagen" element={<SharepicVorlagenSection query="" gridClassName="grid" />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route: '/vorlagen' }
  );
}

describe('SharepicVorlagenSection', () => {
  it('renders nothing while the catalogue is empty', async () => {
    let asked = false;
    server.use(
      http.get(LIST, () => {
        asked = true;
        return HttpResponse.json({ vorlagen: [] });
      })
    );
    const { container } = renderSection();
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves the country to the server — no switch, no query', async () => {
    const queries: string[] = [];
    server.use(
      http.get(LIST, ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({ vorlagen: [vorlage('de-zitat', 'de-DE')] });
      })
    );
    renderSection();
    expect(await screen.findByRole('button', { name: 'Zitat de-zitat' })).toBeInTheDocument();
    expect(queries).toEqual(['']);
  });

  it('shows how to get one from the chat, and copies it on request', async () => {
    server.use(
      http.get(LIST, () => HttpResponse.json({ vorlagen: [vorlage('at-zitat', 'de-AT')] }))
    );
    const { user } = renderSection();
    await user.click(await screen.findByRole('button', { name: 'Zitat at-zitat' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('So erstellst du das im Chat')).toBeInTheDocument();
    expect(within(dialog).getByText(/Bus statt Stau/)).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Stichworte' })).toHaveTextContent('Zitat');
    expect(within(dialog).getByText(/Österreich/)).toBeInTheDocument();
    expect(await axe(dialog)).toHaveNoViolations();

    await user.click(within(dialog).getByRole('button', { name: /Kopie bearbeiten/ }));
    expect(await screen.findByLabelText('Ort')).toHaveTextContent('/studio/vorlage/at-zitat');
  });

  it('hands a prompt to the Sharepic-Creator', async () => {
    server.use(
      http.get(LIST, () => HttpResponse.json({ vorlagen: [vorlage('de-zitat', 'de-DE')] }))
    );
    const { user } = renderSection();
    await user.click(await screen.findByRole('button', { name: 'Zitat de-zitat' }));
    await user.click(await screen.findByRole('button', { name: /Bus statt Stau/ }));
    expect(await screen.findByLabelText('Ort')).toHaveTextContent('/studio/freitext');
  });
});
