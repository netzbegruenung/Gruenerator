import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { HeadlineSlider } from './HeadlineSlider';

import type { WissenArticle } from './useWissenNews';

const article = {
  key: 'a1',
  title: 'Grüne legen Klimaplan vor',
  source: 'taz',
  href: 'https://example.org/a1',
  time: null,
  text: null,
} as unknown as WissenArticle;

const renderSlider = (props: Partial<Parameters<typeof HeadlineSlider>[0]> = {}) =>
  render(
    <MemoryRouter>
      <HeadlineSlider
        items={[article]}
        loading={false}
        to="/briefing"
        title="Nachrichten"
        {...props}
      />
    </MemoryRouter>
  );

describe('HeadlineSlider showTitle', () => {
  it('shows the heading link by default', () => {
    renderSlider();
    const link = screen.getByRole('link', { name: 'Nachrichten' });
    expect(link.getAttribute('href')).toBe('/briefing');
    expect(screen.getByRole('heading', { level: 2, name: 'Nachrichten' })).toBeTruthy();
  });

  it('drops the heading but keeps the region name and the headline', () => {
    renderSlider({ showTitle: false });
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.getByRole('region', { name: 'Nachrichten' })).toBeTruthy();
    expect(screen.getByText('taz')).toBeTruthy();
    expect(screen.getByRole('link', { name: article.title })).toBeTruthy();
  });

  it('empty state: heading by default', () => {
    renderSlider({ items: [] });
    expect(screen.getByRole('heading', { level: 2, name: 'Nachrichten' })).toBeTruthy();
    expect(screen.getByText('Gerade keine neuen Schlagzeilen.')).toBeTruthy();
  });

  it('empty state without title: region keeps its name', () => {
    renderSlider({ items: [], showTitle: false });
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.getByRole('region', { name: 'Nachrichten' })).toBeTruthy();
    expect(screen.getByText('Gerade keine neuen Schlagzeilen.')).toBeTruthy();
  });
});
