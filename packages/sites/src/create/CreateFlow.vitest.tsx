import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteGenerationError } from '../generation/siteGenerationStream';
import { SitesApiError } from '../utils/errorHandler';

const m = vi.hoisted(() => ({
  createSite: vi.fn(),
  getSiteByHandle: vi.fn(),
  generate: vi.fn(),
  cancel: vi.fn(),
  toastError: vi.fn(),
  projects: [] as Array<{ id: string; name: string; isAdmin: boolean }>,
  gen: {
    steps: [] as string[],
    current: null as string | null,
    isGenerating: false,
    isFlyer: false,
  },
}));

vi.mock('../SitesContext', () => ({
  useAuth: () => ({ user: { display_name: 'Anna', email: 'a@b.de', locale: 'de-DE' } }),
  useSitesPaths: () => ({
    overview: '/sites',
    create: '/sites/neu',
    site: (handle: string) => `/sites/${handle}`,
  }),
}));
vi.mock('../hooks/useSite', () => ({
  useSiteList: () => ({ sites: [], limit: 25 }),
  useCreateSite: () => ({
    publicOrigin: 'https://grsites.de',
    createSite: m.createSite,
    isCreating: false,
  }),
}));
vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ sites: { getSiteByHandle: m.getSiteByHandle } }),
}));
vi.mock('../hooks/useSiteSharing', () => ({
  useSiteProjects: () => ({ data: m.projects }),
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
    projects?: Array<{ id: string; name: string }>;
    onProjectChange?: (id: string) => void;
  }) => (
    <div>
      {p.projects?.map((project) => (
        <button key={project.id} onClick={() => p.onProjectChange?.(project.id)}>
          {project.name}
        </button>
      ))}
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

function Where() {
  return <span data-testid="pfad">{useLocation().pathname}</span>;
}

function render(ui: ReactElement) {
  return rtlRender(
    <MemoryRouter initialEntries={['/sites/neu']}>
      <Routes>
        <Route path="/sites/neu" element={ui} />
        <Route path="/sites/:handle" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

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
    m.createSite.mockReset().mockResolvedValue({ subdomain: 'anna' });
    m.getSiteByHandle.mockReset().mockResolvedValue({ status: 404, body: { error: 'x' } });
    m.generate.mockReset();
    m.toastError.mockReset();
    m.projects = [];
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
    expect(await screen.findByTestId('pfad')).toHaveTextContent('/sites/anna');
  });

  it('offers only projects the person administers and creates the site in the chosen one', async () => {
    m.projects = [
      { id: 'g1', name: 'Kreisverband', isAdmin: true },
      { id: 'g2', name: 'Fraktion', isAdmin: false },
    ];
    m.generate.mockResolvedValue(generated);
    const user = userEvent.setup();
    render(<CreateFlow />);
    expect(screen.queryByRole('button', { name: 'Fraktion' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Kreisverband' }));
    await user.click(screen.getByLabelText('Beschreibung'));
    await user.paste('x'.repeat(80));
    await user.click(screen.getByRole('button', { name: 'Generieren' }));
    await waitFor(() =>
      expect(m.createSite).toHaveBeenCalledWith(expect.objectContaining({ group_id: 'g1' }))
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
    m.createSite
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ subdomain: 'anna' });
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

  it('opens the editor when an earlier attempt already stored the site', async () => {
    m.generate.mockResolvedValue(generated);
    m.createSite.mockRejectedValue(new SitesApiError(400, 'Diese Adresse ist bereits vergeben'));
    m.getSiteByHandle.mockResolvedValue({ status: 200, body: {} });
    await fillAndGenerate();
    expect(await screen.findByTestId('pfad')).toHaveTextContent('/sites/anna');
    expect(m.toastError).not.toHaveBeenCalled();
  });

  it('shows the server message when the address belongs to someone else', async () => {
    m.generate.mockResolvedValue(generated);
    m.createSite.mockRejectedValue(new SitesApiError(400, 'Diese Adresse ist bereits vergeben'));
    await fillAndGenerate();
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(
        'Eingabefehler',
        'Diese Adresse ist bereits vergeben'
      )
    );
    expect(screen.queryByTestId('pfad')).toBeNull();
  });

  it('names the limit when the account is full', async () => {
    m.generate.mockResolvedValue(generated);
    m.createSite.mockRejectedValue(new SitesApiError(409, 'Du hast bereits 25 Websites.'));
    await fillAndGenerate();
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith('Fehler', 'Du hast bereits 25 Websites.')
    );
    expect(m.getSiteByHandle).not.toHaveBeenCalled();
  });
});
