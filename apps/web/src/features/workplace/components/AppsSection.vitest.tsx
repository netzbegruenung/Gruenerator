import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders, screen } from '../../../test-utils';
import { PLAY_STORE_URL, TESTFLIGHT_URL } from '../../apps/storeLinks';

import { AppsSection } from './AppsSection';

const platform = vi.hoisted(() => ({
  device: null as 'ios' | 'android' | null,
  desktopApp: false,
}));

vi.mock('../../../utils/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getVisitorDevice: () => platform.device,
  isDesktopApp: () => platform.desktopApp,
}));

beforeEach(() => {
  platform.device = null;
  platform.desktopApp = false;
  localStorage.clear();
});

describe('AppsSection', () => {
  it('shows a computer the QR code and both store links', async () => {
    const { container } = renderWithProviders(<AppsSection />);
    expect(screen.getByRole('heading', { name: 'Der Grünerator als App' })).toBeInTheDocument();
    expect(screen.getByTitle('QR-Code: Grünerator-App herunterladen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Play' })).toHaveAttribute(
      'href',
      PLAY_STORE_URL
    );
    expect(screen.getByRole('link', { name: 'iPhone-Beta' })).toHaveAttribute(
      'href',
      TESTFLIGHT_URL
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('gives an Android phone one button to Google Play and no QR code', () => {
    platform.device = 'android';
    renderWithProviders(<AppsSection />);
    expect(screen.getByRole('link', { name: 'Bei Google Play laden' })).toHaveAttribute(
      'href',
      PLAY_STORE_URL
    );
    expect(screen.queryByTitle('QR-Code: Grünerator-App herunterladen')).not.toBeInTheDocument();
  });

  it('labels the iPhone link as the TestFlight beta', () => {
    platform.device = 'ios';
    renderWithProviders(<AppsSection />);
    expect(screen.getByRole('link', { name: 'Beta über TestFlight laden' })).toHaveAttribute(
      'href',
      TESTFLIGHT_URL
    );
  });

  it('stays hidden after „Ausblenden", also on the next render', async () => {
    const { user, unmount } = renderWithProviders(<AppsSection />);
    await user.click(screen.getByRole('button', { name: 'Ausblenden' }));
    expect(screen.queryByRole('region', { name: 'Apps' })).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<AppsSection />);
    expect(screen.queryByRole('region', { name: 'Apps' })).not.toBeInTheDocument();
  });

  it('is not shown in the desktop app', () => {
    platform.desktopApp = true;
    renderWithProviders(<AppsSection />);
    expect(screen.queryByRole('region', { name: 'Apps' })).not.toBeInTheDocument();
  });
});
