import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteGenerationError } from '../generation/siteGenerationStream';
import { SitesApiError } from '../utils/errorHandler';

const m = vi.hoisted(() => ({
  createSite: vi.fn(),
  refetch: vi.fn(),
  generate: vi.fn(),
  cancel: vi.fn(),
  toastError: vi.fn(),
  gen: {
    steps: [] as string[],
    current: null as string | null,
    isGenerating: false,
    isFlyer: false,
  },
}));

vi.mock('../SitesContext', () => ({
  useAuth: () => ({ user: { display_name: 'Anna', email: 'a@b.de', locale: 'de-DE' } }),
}));
vi.mock('../hooks/useSite', () => ({
  useSite: () => ({
    publicOrigin: 'https://grsites.de',
    createSite: m.createSite,
    isCreating: false,
    refetch: m.refetch,
  }),
}));
vi.mock('../hooks/useSiteGeneration', () => ({
  useSiteGeneration: () => ({ generate: m.generate, cancel: m.cancel, ...m.gen }),
}));
vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: m.toastError }),
}));
vi.mock('../components/CreateSiteScreen', () => ({
  CreateSiteScreen: (p: {
    description: string;
    onDescriptionChange: (v: string) => void;
    onGenerate: () => void;
  }) => (
    <div>
      <textarea
        aria-label="Beschreibung"
        value={p.description}
        onChange={(e) => p.onDescriptionChange(e.target.value)}
      />
      <button onClick={p.onGenerate}>Generieren</button>
    </div>
  ),
}));

import { CreateFlow } from './CreateFlow';

const SECTIONS = { themes: [{ title: 'Klima' }] };
const generated = {
  site_title: 'Anna',
  tagline: 'Hallo',
  contact_email: 'a@b.de',
  sections: SECTIONS,
};

async function fillAndGenerate() {
  const user = userEvent.setup();
  render(<CreateFlow />);
  await user.click(screen.getByLabelText('Beschreibung'));
  await user.paste('x'.repeat(80));
  await user.click(screen.getByRole('button', { name: 'Generieren' }));
  return user;
}

describe('CreateFlow', () => {
  beforeEach(() => {
    m.createSite.mockReset().mockResolvedValue({});
    m.generate.mockReset();
    m.refetch.mockReset();
    m.toastError.mockReset();
    m.gen.steps = [];
    m.gen.current = null;
    m.gen.isGenerating = false;
    m.gen.isFlyer = false;
  });

  it('creates the site right after generating, without a review step', async () => {
    m.generate.mockResolvedValue(generated);
    await fillAndGenerate();
    await waitFor(() => expect(m.createSite).toHaveBeenCalledTimes(1));
    expect(m.createSite).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: SECTIONS,
        site_title: 'Anna',
        contact_email: 'a@b.de',
      })
    );
  });

  it('shows the flyer message while a flyer runs', () => {
    m.gen.isGenerating = true;
    m.gen.isFlyer = true;
    m.gen.steps = ['extract', 'analyze'];
    m.gen.current = 'extract';
    render(<CreateFlow />);
    expect(screen.getByRole('region', { name: 'Flyer wird analysiert …' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Text wird aus dem Flyer gelesen');
  });

  it('cancels the running generation', async () => {
    m.gen.isGenerating = true;
    m.gen.steps = ['write'];
    m.gen.current = 'write';
    render(<CreateFlow />);
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(m.cancel).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error and runs again on retry', async () => {
    m.generate
      .mockRejectedValueOnce(new SiteGenerationError('Die Verbindung ist abgebrochen.', true))
      .mockResolvedValueOnce(generated);
    const user = await fillAndGenerate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Verbindung ist abgebrochen.');
    await user.click(screen.getByRole('button', { name: 'Noch einmal versuchen' }));
    expect(m.generate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(m.createSite).toHaveBeenCalledTimes(1));
  });

  it('retries a failed create with the same content instead of generating again', async () => {
    m.generate.mockResolvedValue(generated);
    m.createSite.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({});
    const user = await fillAndGenerate();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Seite konnte nicht angelegt werden.'
    );
    await user.click(screen.getByRole('button', { name: 'Noch einmal versuchen' }));
    await waitFor(() => expect(m.createSite).toHaveBeenCalledTimes(2));
    expect(m.createSite).toHaveBeenLastCalledWith(expect.objectContaining({ sections: SECTIONS }));
    expect(m.generate).toHaveBeenCalledTimes(1);
  });

  it('offers no retry for a final error', async () => {
    m.generate.mockRejectedValue(new SiteGenerationError('Nicht lesbar.', false));
    await fillAndGenerate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Nicht lesbar.');
    expect(screen.queryByRole('button', { name: 'Noch einmal versuchen' })).toBeNull();
  });

  it('shows no error toast for a consent 403', async () => {
    m.generate.mockRejectedValue(new SitesApiError(403, 'E', true));
    await fillAndGenerate();
    await waitFor(() => expect(m.generate).toHaveBeenCalled());
    expect(m.toastError).not.toHaveBeenCalled();
  });

  it('still toasts a plain 403', async () => {
    m.generate.mockRejectedValue(new SitesApiError(403, 'E'));
    await fillAndGenerate();
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith('Keine Berechtigung', expect.any(String))
    );
  });

  it('shows the server message and reloads the site when it already exists', async () => {
    m.generate.mockResolvedValue(generated);
    m.createSite.mockRejectedValue(new SitesApiError(400, 'Du hast bereits eine Website erstellt'));
    await fillAndGenerate();
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(
        'Eingabefehler',
        'Du hast bereits eine Website erstellt'
      )
    );
    expect(m.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Noch einmal versuchen' })).toBeNull();
  });
});
