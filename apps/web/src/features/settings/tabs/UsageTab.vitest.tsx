/**
 * The tab reports activity; the footprint appears only as a comparison.
 *
 * These tests guard the two rules that keep that honest: no own CO2 figure ever
 * reaches the screen, and the methodology note never outlives the card it
 * explains — the pure-image case, where emissions exist but there is nothing to
 * compare them against.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders, screen, waitFor } from '../../../test-utils';

import UsageTab from './UsageTab';

const ENDPOINT = 'http://localhost/api/usage/me';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

const BASE = {
  success: true as const,
  days: 30,
  since: '2026-07-12',
  totals: {
    requests: 40,
    input_tokens: 90_000,
    output_tokens: 12_000,
    total_tokens: 102_000,
    images: 3,
    transcriptions: 2,
    searches: 5,
    speech_seconds: 90,
  },
  footprint: {
    energy_wh: 120,
    emissions_g: 40,
    measured_share: 0.4,
    bounded_share: 0.2,
    covered_share: 0.9,
    image_energy_wh: 30,
    image_emissions_g: 10,
    reference_energy_wh: 300,
    reference_emissions_g: 90,
  },
  daily: [{ day: '2026-08-10', requests: 40, input_tokens: 90_000, output_tokens: 12_000 }],
  byFeature: [
    {
      feature: 'chat',
      requests: 40,
      total_tokens: 102_000,
      images: 0,
      transcriptions: 2,
      searches: 5,
      speech_seconds: 90,
    },
  ],
  byModel: [
    {
      provider: 'litellm',
      model: 'gpt-oss-120b',
      unit: 'tokens' as const,
      requests: 40,
      total_tokens: 102_000,
      ops: 0,
    },
    {
      provider: 'regolo',
      model: 'voxtral-small',
      unit: 'transcriptions' as const,
      requests: 0,
      total_tokens: 0,
      ops: 2,
    },
    {
      provider: 'linkup',
      model: 'linkup-standard',
      unit: 'searches' as const,
      requests: 0,
      total_tokens: 0,
      ops: 5,
    },
  ],
};

function serve(body: Record<string, unknown>) {
  server.use(http.get(ENDPOINT, () => HttpResponse.json(body)));
}

describe('UsageTab', () => {
  it('never shows this account its own CO2 figure', async () => {
    serve(BASE);
    renderWithProviders(<UsageTab />);

    await waitFor(() => expect(screen.getByText('KI-Anfragen')).toBeInTheDocument());
    expect(screen.queryByText(/CO₂ deiner KI-Nutzung/)).not.toBeInTheDocument();
    // The saving is a difference and may appear; an own consumption figure
    // introduced by "statt X" must not.
    expect(screen.queryByText(/^statt /)).not.toBeInTheDocument();
  });

  it('drops the methodology note together with the card it explains', async () => {
    // Pure image usage: emissions exist, but they are all Flux and the GPT-4o
    // reference has no image half — so there is no comparison to annotate.
    serve({
      ...BASE,
      footprint: {
        ...BASE.footprint,
        energy_wh: 30,
        emissions_g: 10,
        image_energy_wh: 30,
        image_emissions_g: 10,
        reference_energy_wh: 0,
        reference_emissions_g: 0,
      },
    });
    renderWithProviders(<UsageTab />);

    await waitFor(() => expect(screen.getByText('KI-Anfragen')).toBeInTheDocument());
    expect(screen.queryByText(/Ersparnis oben/)).not.toBeInTheDocument();
    expect(screen.queryByText(/gegenüber ChatGPT|Vergleich zu ChatGPT/)).not.toBeInTheDocument();
  });

  it('lists models by function and names verdigado, not litellm', async () => {
    serve(BASE);
    renderWithProviders(<UsageTab />);

    await waitFor(() => expect(screen.getByText('Textmodelle')).toBeInTheDocument());
    expect(screen.getByText('Spracherkennung')).toBeInTheDocument();
    expect(screen.getByText('Websuche')).toBeInTheDocument();
    expect(screen.getByText('verdigado')).toBeInTheDocument();
    expect(screen.queryByText('litellm')).not.toBeInTheDocument();
  });
});
