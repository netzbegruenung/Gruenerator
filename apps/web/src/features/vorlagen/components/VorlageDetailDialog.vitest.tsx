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

  it('pages through the preview', async () => {
    renderDialog();
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Seite 1 von 2');
    await userEvent.setup().click(screen.getByRole('button', { name: /Nächste Seite/ }));
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Seite 2 von 2');
  });

  it('disables Like and Merken when signed out', async () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Liken' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Merken' })).toBeDisabled();
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
