import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test-utils';

import AppDownloadRedirect from './AppDownloadRedirect';
import { PLAY_STORE_URL } from './storeLinks';

const platform = vi.hoisted(() => ({ device: null as 'ios' | 'android' | null }));

vi.mock('../../utils/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getVisitorDevice: () => platform.device,
}));

afterEach(() => {
  platform.device = null;
  vi.unstubAllGlobals();
});

const renderAt = () =>
  renderWithProviders(
    <Routes>
      <Route path="/app" element={<AppDownloadRedirect />} />
      <Route path="/apps" element={<p>Apps-Seite</p>} />
    </Routes>,
    { route: '/app' }
  );

describe('AppDownloadRedirect', () => {
  it('sends a phone straight to its store', () => {
    platform.device = 'android';
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    renderAt();
    expect(replace).toHaveBeenCalledWith(PLAY_STORE_URL);
  });

  it('sends every other device to /apps', () => {
    renderAt();
    expect(screen.getByText('Apps-Seite')).toBeInTheDocument();
  });
});
