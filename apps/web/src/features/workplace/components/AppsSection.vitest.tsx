import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders, screen } from '../../../test-utils';
import { PLAY_STORE_URL, TESTFLIGHT_URL } from '../../apps/storeLinks';

import { AppsCard } from './AppsSection';

const platform = vi.hoisted(() => ({ device: null as 'ios' | 'android' | null }));

vi.mock('../../../utils/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getVisitorDevice: () => platform.device,
}));

beforeEach(() => {
  platform.device = null;
});

describe('AppsCard', () => {
  it('gives a computer the QR code and store links to both stores', async () => {
    const { container } = renderWithProviders(<AppsCard />);
    expect(screen.getByRole('heading', { name: 'Der Grünerator als App' })).toBeInTheDocument();
    expect(screen.getByTitle('QR-Code: Grünerator-App herunterladen')).toBeInTheDocument();
    // Buttons for a narrow card and text links beside the QR; CSS shows one pair.
    for (const link of screen.getAllByRole('link', { name: 'Google Play' })) {
      expect(link).toHaveAttribute('href', PLAY_STORE_URL);
    }
    for (const link of screen.getAllByRole('link', { name: /iPhone/ })) {
      expect(link).toHaveAttribute('href', TESTFLIGHT_URL);
    }
    expect(await axe(container)).toHaveNoViolations();
  });

  it('gives an Android phone one button to Google Play and no QR code', () => {
    platform.device = 'android';
    renderWithProviders(<AppsCard />);
    expect(screen.getByRole('link', { name: 'Bei Google Play laden' })).toHaveAttribute(
      'href',
      PLAY_STORE_URL
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByTitle('QR-Code: Grünerator-App herunterladen')).not.toBeInTheDocument();
  });

  it('labels the iPhone link as the TestFlight beta', () => {
    platform.device = 'ios';
    renderWithProviders(<AppsCard />);
    expect(screen.getByRole('link', { name: 'Beta über TestFlight laden' })).toHaveAttribute(
      'href',
      TESTFLIGHT_URL
    );
  });
});
