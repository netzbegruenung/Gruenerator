import { type ExplainableContent } from '@gruenerator/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExplainableView } from './ExplainableView';

import { axe } from '@/test-utils';

const content: ExplainableContent = {
  title: 'Was ist das Klimageld?',
  summary: 'Das Klimageld gibt Einnahmen aus dem CO2-Preis an alle zurück.',
  sections: [
    {
      heading: 'Woher kommt das Geld?',
      paragraphs: ['Wer CO2 ausstößt, zahlt dafür [1]. Das steht im Gesetz [9].'],
      image: { prompt: 'a family receiving money', alt: 'Familie am Küchentisch', status: 'done' },
    },
    {
      heading: 'Wer bekommt es?',
      paragraphs: ['Alle Menschen bekommen den gleichen Betrag [2].'],
      image: { prompt: 'many people standing together', alt: 'Viele Menschen', status: 'pending' },
    },
    {
      heading: 'Was bringt es?',
      paragraphs: ['Wer wenig verbraucht, hat am Ende mehr.'],
      image: { prompt: 'a broken illustration prompt', alt: 'Kaputtes Bild', status: 'failed' },
    },
  ],
  keyTakeaways: ['Der CO2-Preis wird zurückgezahlt.', 'Alle bekommen gleich viel.'],
  glossary: [{ term: 'CO2-Preis', definition: 'Ein Preis für jede Tonne Treibhausgas.' }],
  sources: [
    { index: 2, title: 'Bundesregierung', url: null },
    { index: 1, title: 'Umweltbundesamt', url: 'https://www.umweltbundesamt.de' },
  ],
};

function renderView() {
  return render(<ExplainableView content={content} imageUrl={(i) => `/img/${i}`} />);
}

describe('ExplainableView', () => {
  it('renders title, sections as h2 and the fixed boxes', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1, name: content.title })).toBeInTheDocument();
    for (const s of content.sections) {
      expect(screen.getByRole('heading', { level: 2, name: s.heading })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Das Wichtigste' })).toBeInTheDocument();
    expect(screen.getByText('CO2-Preis').tagName).toBe('DT');
    expect(
      screen.getByText(/Erstellt mit dem Grünerator. Die Bilder wurden mit KI erzeugt/)
    ).toBeInTheDocument();
  });

  it('shows a done image as a captioned figure', () => {
    renderView();
    const img = screen.getByRole('img', { name: 'Familie am Küchentisch' });
    expect(img).toHaveAttribute('src', '/img/0');
    expect(img.closest('figure')).toHaveTextContent('KI-generierte Illustration');
  });

  it('shows a busy skeleton while an image is pending', () => {
    const { container } = renderView();
    expect(screen.queryByRole('img', { name: 'Viele Menschen' })).toBeNull();
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
  });

  it('does not render a failed image', () => {
    renderView();
    expect(screen.queryByRole('img', { name: 'Kaputtes Bild' })).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('links [n] markers to the matching source and leaves unknown ones as text', () => {
    renderView();
    const link = screen.getByRole('link', { name: 'Quelle 1' });
    expect(link).toHaveAttribute('href', '#quelle-1');
    expect(link.closest('sup')).not.toBeNull();
    expect(document.getElementById('quelle-1')).toHaveTextContent('Umweltbundesamt');
    expect(screen.queryByRole('link', { name: 'Quelle 9' })).toBeNull();
    expect(screen.getByText(/Das steht im Gesetz \[9\]\./)).toBeInTheDocument();
  });

  it('lists sources in order, external ones opening safely', () => {
    renderView();
    const list = screen.getByRole('heading', { name: 'Quellen' }).nextElementSibling as HTMLElement;
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Umweltbundesamt');
    expect(items[1]).toHaveTextContent('Bundesregierung');
    const ext = within(list).getByRole('link', { name: 'Umweltbundesamt' });
    expect(ext).toHaveAttribute('target', '_blank');
    expect(ext.getAttribute('rel')).toContain('noopener');
  });

  it('passes axe', async () => {
    const { container } = renderView();
    expect(await axe(container)).toHaveNoViolations();
  });
});
