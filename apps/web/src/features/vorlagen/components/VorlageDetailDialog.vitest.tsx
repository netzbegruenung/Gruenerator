import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VorlageDetailDialog } from './VorlageDetailDialog';

import { axe, renderWithProviders } from '@/test-utils';

const URL = 'https://gruenerator.eu/studio/vorlage/de-zitat';
const pages = [
  { src: '/a.png', alt: 'Seite 1 von 2' },
  { src: '/b.png', alt: 'Seite 2 von 2' },
];

function renderDialog(props: Partial<Parameters<typeof VorlageDetailDialog>[0]> = {}) {
  return renderWithProviders(
    <VorlageDetailDialog
      onClose={vi.fn()}
      title="Zitat"
      meta="Zitat · Deutschland"
      pages={pages}
      share={{ title: 'Zitat', url: URL }}
      {...props}
    />
  );
}

describe('VorlageDetailDialog', () => {
  it('opens the share dialog from Teilen', async () => {
    renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Teilen' }));
    expect(await screen.findByRole('heading', { name: 'Vorlage teilen' })).toBeInTheDocument();
    expect(screen.getByDisplayValue(URL)).toBeInTheDocument();
  });

  it('has no Teilen without anything to share', () => {
    renderDialog({ share: undefined });
    expect(screen.queryByRole('button', { name: 'Teilen' })).not.toBeInTheDocument();
  });

  it('shows every page and previews the one pointed at', async () => {
    renderDialog();
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Seite 1 von 2');
    expect(screen.getByRole('button', { name: 'Seite 1 von 2 anzeigen' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    await userEvent.setup().hover(screen.getByRole('button', { name: 'Seite 2 von 2 anzeigen' }));
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Seite 2 von 2');
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });

  it('has no page strip for a single page', () => {
    renderDialog({ pages: pages.slice(0, 1) });
    expect(screen.queryByRole('group', { name: 'Seiten' })).not.toBeInTheDocument();
  });

  it('disables Like and Merken when signed out', async () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Liken' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Merken' })).toBeDisabled();
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
