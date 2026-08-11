/**
 * The transparency view's job is to not overclaim, so the tests are about the
 * qualifiers rather than the numbers: the band must render as a band, thin data
 * must refuse to publish, and a gap in the daily series must be labelled as
 * suppression rather than left to read as inactivity.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders, screen, waitFor } from '../../../test-utils';

import { TransparenzView } from './TransparenzView';

const ENDPOINT = 'http://localhost/api/transparency/usage';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

const FOOTPRINT = {
  energy_wh: 4200,
  energy_wh_low: 3100,
  emissions_g: 1400,
  emissions_g_low: 900,
  measured_share: 0.42,
  bounded_share: 0.18,
  covered_share: 0.93,
  image_energy_wh: 800,
  image_emissions_g: 260,
  reference_energy_wh: 9000,
  reference_emissions_g: 3200,
  unvalued_ops: { transcriptions: 12, searches: 34 },
};

const RESPONSE = {
  success: true as const,
  days: 30,
  since: '2026-07-12',
  generated_at: '2026-08-11T09:30:00.000Z',
  min_group_size: 5,
  sufficient_data: true,
  active_users: 61,
  suppressed_days: 3,
  totals: {
    requests: 5120,
    input_tokens: 8_000_000,
    output_tokens: 1_200_000,
    total_tokens: 9_200_000,
    images: 140,
    transcriptions: 12,
    searches: 34,
  },
  footprint: FOOTPRINT,
  providers: [
    { provider: 'mistral', grid_g_per_kwh: 22, pue: 1.25, energy_wh: 2600, emissions_g: 700 },
    { provider: 'regolo', grid_g_per_kwh: 270, pue: 1.2, energy_wh: 1600, emissions_g: 700 },
  ],
  daily: [
    {
      day: '2026-08-09',
      active_users: 22,
      requests: 900,
      input_tokens: 500_000,
      output_tokens: 80_000,
    },
    {
      day: '2026-08-10',
      active_users: 31,
      requests: 1200,
      input_tokens: 700_000,
      output_tokens: 96_000,
    },
  ],
  byFeature: [
    {
      feature: 'chat',
      requests: 4000,
      total_tokens: 7_000_000,
      images: 0,
      transcriptions: 12,
      searches: 34,
    },
    {
      feature: 'sharepic',
      requests: 1120,
      total_tokens: 2_200_000,
      images: 140,
      transcriptions: 0,
      searches: 0,
    },
  ],
  byModel: [
    {
      provider: 'mistral',
      model: 'mistral-medium-2604',
      unit: 'tokens' as const,
      requests: 4000,
      total_tokens: 7_000_000,
      ops: 0,
    },
    {
      provider: 'bfl',
      model: 'flux-2-pro',
      unit: 'images' as const,
      requests: 0,
      total_tokens: 0,
      ops: 140,
    },
  ],
};

function serve(body: Record<string, unknown>) {
  server.use(http.get(ENDPOINT, () => HttpResponse.json(body)));
}

describe('TransparenzView', () => {
  it('publishes the footprint as a band, not a single number', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView days={30} />);

    // 900 g – 1,4 kg: both ends present, each formatted in its own magnitude.
    await waitFor(() => expect(screen.getByText(/900 g – 1,4 kg/)).toBeInTheDocument());
    expect(screen.getByText(/3,1 kWh – 4,2 kWh Strom/)).toBeInTheDocument();
  });

  it('shows each provider with the constants its figure was computed from', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView days={30} />);

    // "Mistral AI" also labels the model rows, so match the provider panel's
    // own unambiguous markers instead of the name.
    await waitFor(() => expect(screen.getByText('Netz 22 g/kWh')).toBeInTheDocument());
    expect(screen.getAllByText('Mistral AI').length).toBeGreaterThan(0);
    expect(screen.getByText('Netz 270 g/kWh')).toBeInTheDocument();
    expect(screen.getByText('PUE 1,2')).toBeInTheDocument();
  });

  it('labels the gap in the daily series as suppression, not inactivity', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView days={30} />);

    await waitFor(() =>
      expect(screen.getByText(/Die Lücke ist Unterdrückung, keine Untätigkeit/)).toBeInTheDocument()
    );
    expect(screen.getByText(/weniger als 5 Personen aktiv/)).toBeInTheDocument();
  });

  it('names transcriptions and searches as excluded rather than as zero', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView days={30} />);

    // The counts also appear as activity extras under "Nach Bereich" — that
    // collision is the point of this panel, so assert on the exclusion wording.
    await waitFor(() => expect(screen.getByText('Nicht enthalten')).toBeInTheDocument());
    expect(screen.getByText(/12 Transkriptionen — kein Anbieter meldet dafür/)).toBeInTheDocument();
    expect(screen.getByText(/34 Web-Recherchen — die Energie steckt im Index/)).toBeInTheDocument();
    expect(screen.getByText('0 g', { selector: 'strong' })).toBeInTheDocument();
  });

  it('reports the ChatGPT comparison even when it is unfavourable', async () => {
    // Reference below our own text footprint: we come out worse. The section
    // must still render — hiding the one number that does not flatter us is
    // exactly what this page exists to not do.
    serve({
      ...RESPONSE,
      footprint: { ...FOOTPRINT, reference_emissions_g: 200, reference_energy_wh: 500 },
    });
    renderWithProviders(<TransparenzView days={30} />);

    await waitFor(() => expect(screen.getByText('Vergleich zu ChatGPT')).toBeInTheDocument());
    expect(screen.getByText('CO₂ mehr als bei GPT-4o')).toBeInTheDocument();
    expect(screen.queryByText('CO₂ gespart')).not.toBeInTheDocument();
  });

  it('refuses to publish a figure when too few people were active', async () => {
    serve({ ...RESPONSE, sufficient_data: false, active_users: 2 });
    renderWithProviders(<TransparenzView days={30} />);

    await waitFor(() =>
      expect(
        screen.getByText(/Zu wenige Personen für eine veröffentlichbare Zahl/)
      ).toBeInTheDocument()
    );
    // The headline number must be absent entirely, not rendered as zero.
    expect(screen.queryByText(/CO₂e/)).not.toBeInTheDocument();
  });

  it('surfaces an error banner when the endpoint fails', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderWithProviders(<TransparenzView days={30} />);

    await waitFor(() =>
      expect(screen.getByText(/Transparenzdaten konnten nicht geladen werden/)).toBeInTheDocument()
    );
  });
});
