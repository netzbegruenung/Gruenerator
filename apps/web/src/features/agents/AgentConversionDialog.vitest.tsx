/**
 * Der Umwandeln-Dialog zeigt vor dem Umwandeln, was mitkommt, und legt erst
 * auf Knopfdruck an. Ein schon bestehender Nachfolger wird geöffnet statt
 * still ein zweites Mal angelegt.
 */
import { recommendedConversionTarget } from '@gruenerator/shared/grueneratoren';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentConversionDialog } from './AgentConversionDialog';

import { render, screen, userEvent, waitFor } from '@/test-utils';

const convert = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userAgents: { convert } }),
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

const RECIPE_ID = '6f1c2d3e-0000-4000-8000-0000000000aa';
const AGENT = { id: '6f1c2d3e-0000-4000-8000-000000000001', identifier: 'presse', title: 'Presse' };

function plan(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    body: {
      success: true,
      target: 'recipe',
      items: [
        { part: 'role', outcome: 'carried', note: 'Wird der Text des Rezepts.' },
        { part: 'model', outcome: 'dropped', note: 'Das Modell wählst du im Chat.' },
      ],
      blocked: null,
      alreadyConverted: false,
      result: null,
      ...overrides,
    },
  };
}

function renderDialog(agent: Parameters<typeof AgentConversionDialog>[0]['agent'] = AGENT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AgentConversionDialog agent={agent} open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  convert.mockReset();
  navigate.mockReset();
});

describe('AgentConversionDialog', () => {
  it('zeigt den Probelauf und legt erst auf Knopfdruck an', async () => {
    convert
      .mockResolvedValueOnce(plan())
      .mockResolvedValueOnce(
        plan({ result: { kind: 'recipe', ref: RECIPE_ID, path: '/agentura/rezept/presse' } })
      );
    renderDialog();

    expect(await screen.findByText('Anweisungen')).toBeInTheDocument();
    expect(screen.getByText('Wird der Text des Rezepts.')).toBeInTheDocument();
    expect(screen.getByText(/Fällt weg/)).toBeInTheDocument();
    expect(convert).toHaveBeenCalledWith({
      params: { identifier: 'presse' },
      body: { target: 'recipe', dryRun: true },
    });

    await userEvent.click(screen.getByRole('button', { name: /In Rezept umwandeln/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/agentura/rezept/presse'));
    expect(convert).toHaveBeenCalledWith({
      params: { identifier: 'presse' },
      body: { target: 'recipe' },
    });
  });

  it('öffnet einen bestehenden Nachfolger, statt neu anzulegen', async () => {
    convert.mockResolvedValue(
      plan({
        alreadyConverted: true,
        result: { kind: 'recipe', ref: RECIPE_ID, path: '/agentura/rezept/presse' },
      })
    );
    renderDialog({ ...AGENT, migratedTo: { recipe: RECIPE_ID } });

    await userEvent.click(await screen.findByRole('button', { name: /Rezept öffnen/ }));
    expect(navigate).toHaveBeenCalledWith('/agentura/rezept/presse');
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('bleibt offen und zeigt, was entgegen dem Probelauf nicht mitkam', async () => {
    const planned = {
      part: 'notebooks',
      outcome: 'carried',
      note: '2 Notebooks werden ins Projekt geteilt.',
    };
    convert.mockResolvedValueOnce(plan({ target: 'project', items: [planned] })).mockResolvedValue(
      plan({
        target: 'project',
        items: [{ ...planned, outcome: 'later', note: '2 Notebooks ließen sich nicht teilen.' }],
        result: { kind: 'project', ref: RECIPE_ID, path: '/projekte/presse-abc123' },
      })
    );
    renderDialog({ ...AGENT, defaultNotebookIds: ['nb-1', 'nb-2'] });

    await userEvent.click(await screen.findByRole('button', { name: /In Projekt umwandeln/ }));
    expect(await screen.findByText('2 Notebooks ließen sich nicht teilen.')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Projekt öffnen/ }));
    expect(navigate).toHaveBeenCalledWith('/projekte/presse-abc123');
  });

  it('sperrt das Umwandeln mit dem Grund des Servers', async () => {
    convert.mockResolvedValue(plan({ blocked: 'Dieser Agent hat keine Anweisungen.' }));
    renderDialog();

    expect(await screen.findByText('Dieser Agent hat keine Anweisungen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /In Rezept umwandeln/ })).toBeDisabled();
  });

  it('empfiehlt ein Projekt, wenn Notebooks dranhängen', () => {
    expect(recommendedConversionTarget(AGENT)).toBe('recipe');
    expect(recommendedConversionTarget({ ...AGENT, defaultNotebookIds: ['nb-1'] })).toBe('project');
  });
});
