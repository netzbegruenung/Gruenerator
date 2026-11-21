import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  site: { current: {} as Record<string, unknown> },
  updateSite: vi.fn(),
  check: vi.fn(),
}));

vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ sites: { checkSubdomain: hoisted.check } }),
}));
vi.mock('../../../hooks/useSite', () => ({
  useSite: () => ({
    site: hoisted.site.current,
    publicOrigin: 'https://grsites.de',
    updateSite: hoisted.updateSite,
    isUpdating: false,
  }),
}));
vi.mock('../../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: 'de-DE' } }),
}));

import { renderWithDraft } from '../../../test/renderWithDraft';

import { SettingsPanel } from './SettingsPanel';

describe('SettingsPanel', () => {
  beforeEach(() => {
    hoisted.updateSite.mockReset().mockResolvedValue({});
    hoisted.check.mockReset().mockResolvedValue({ status: 200, body: { available: true } });
    hoisted.site.current = { id: 's1', subdomain: 'anna', last_published: null };
  });

  it('applies a new, free address with updateSite({ subdomain })', async () => {
    const { user } = renderWithDraft(<SettingsPanel />);
    const apply = screen.getByRole('button', { name: 'Adresse übernehmen' });
    expect(apply).toBeDisabled();
    const input = screen.getByRole('textbox', { name: 'Adresse' });
    await user.clear(input);
    await user.type(input, 'berta');
    expect(await screen.findByText('Diese Adresse ist frei')).toBeInTheDocument();
    await user.click(apply);
    expect(hoisted.updateSite).toHaveBeenCalledWith({ id: 's1', data: { subdomain: 'berta' } });
  });

  it('keeps "Adresse übernehmen" off for a taken address', async () => {
    hoisted.check.mockResolvedValue({ status: 200, body: { available: false } });
    const { user } = renderWithDraft(<SettingsPanel />);
    const input = screen.getByRole('textbox', { name: 'Adresse' });
    await user.clear(input);
    await user.type(input, 'berta');
    expect(await screen.findByText('Diese Adresse ist bereits vergeben')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adresse übernehmen' })).toBeDisabled();
  });

  it('is read-only without a button once the site has been published', () => {
    hoisted.site.current = { id: 's1', subdomain: 'anna', last_published: '2026-11-01T10:00:00Z' };
    renderWithDraft(<SettingsPanel />);
    expect(screen.getByRole('textbox', { name: 'Adresse' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Adresse' })).toHaveValue('anna');
    expect(screen.queryByRole('button', { name: 'Adresse übernehmen' })).toBeNull();
    expect(
      screen.getByText('Die Adresse lässt sich nach dem ersten Veröffentlichen nicht mehr ändern.')
    ).toBeInTheDocument();
  });
});
