import { DOKU_URL } from '@gruenerator/shared/links';
import { describe, expect, it } from 'vitest';

import { InfoTilesSection } from './InfoTilesSection';

import { axe, renderWithProviders, screen } from '@/test-utils';

describe('InfoTilesSection', () => {
  it('links the five tiles under one heading and passes axe', async () => {
    const { container } = renderWithProviders(<InfoTilesSection />);
    expect(screen.getByRole('region', { name: 'Transparenz, MCP & Co' })).toBeInTheDocument();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([DOKU_URL, '/ki-transparenz', '/transparenz', '/apps', '/datenschutz']);
    expect(screen.getByRole('link', { name: 'KI-Transparenz' })).toHaveAttribute(
      'href',
      '/ki-transparenz'
    );
    expect(screen.getByRole('link', { name: 'MCP-Server' })).toHaveAttribute('href', '/apps');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the one documentation link in a new tab and says so', () => {
    renderWithProviders(<InfoTilesSection />);
    const docs = screen.getByRole('link', { name: /^Dokumentation.*öffnet in neuem Tab/ });
    expect(docs).toHaveAttribute('href', DOKU_URL);
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
    // Every other tile stays in the app.
    expect(document.querySelectorAll('a[target="_blank"]')).toHaveLength(1);
  });
});
