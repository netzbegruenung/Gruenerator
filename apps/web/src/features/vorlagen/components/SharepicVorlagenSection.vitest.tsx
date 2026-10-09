import { type SharepicVorlage } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { SharepicVorlagenCards } from './SharepicVorlagenSection';

import { axe, renderWithProviders } from '@/test-utils';

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

function renderCards(vorlagen: SharepicVorlage[]) {
  return renderWithProviders(
    <Routes>
      <Route path="/vorlagen" element={<SharepicVorlagenCards vorlagen={vorlagen} />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route: '/vorlagen' }
  );
}

describe('SharepicVorlagenCards', () => {
  it('shows how to get one from the chat, and copies it on request', async () => {
    const { user } = renderCards([vorlage('at-zitat', 'de-AT')]);
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
    const { user } = renderCards([vorlage('de-zitat', 'de-DE')]);
    await user.click(await screen.findByRole('button', { name: 'Zitat de-zitat' }));
    await user.click(await screen.findByRole('button', { name: /Bus statt Stau/ }));
    expect(await screen.findByLabelText('Ort')).toHaveTextContent('/studio/freitext');
  });

  it('shows every slide of a carousel, and says how many on the card', async () => {
    const karussell = vorlage('de-karussell', 'de-DE');
    karussell.spec.slides = [0, 1, 2].map(() => karussell.spec.slides[0]!);
    const { user } = renderCards([karussell]);

    const card = await screen.findByRole('button', { name: 'Zitat de-karussell' });
    expect(screen.getByText('3 Seiten')).toBeInTheDocument();

    await user.click(card);
    const pages = within(await screen.findByRole('dialog')).getByRole('list', { name: '3 Seiten' });
    const images = within(pages).getAllByRole('img');
    expect(images.map((img) => img.getAttribute('alt'))).toEqual([
      'Seite 1 von 3: Zitat de-karussell',
      'Seite 2 von 3: Zitat de-karussell',
      'Seite 3 von 3: Zitat de-karussell',
    ]);
    expect(images[2]).toHaveAttribute('src', '/api/sharepic-vorlagen/de-karussell/thumb?seite=3');
  });
});
