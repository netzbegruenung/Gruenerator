/**
 * The transparency page's job is to not overclaim, so the tests are about the
 * qualifiers rather than the layout: the headline is the middle of a stated
 * range, what carries no footprint is named as excluded, thin data refuses to
 * publish, and a filter left in a shared link never narrows the story.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../../test/msw-server';
import { renderWithProviders, screen, waitFor } from '../../../../test-utils';

import { useFeatureParam, useTransparencyLocaleParam } from './params';
import { TransparenzView } from './TransparenzView';

const ENDPOINT = 'http://localhost/api/transparency/usage';

// jsdom serves from localhost, which the registry maps to the `local` instance;
// the tests below need to choose between a pinned and an unpinned one.
const instance = vi.hoisted(() => ({ id: 'production' }));
vi.mock('../../../../config/instance', () => ({
  get CURRENT_INSTANCE() {
    return instance.id;
  },
}));

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
  instance.id = 'production';
});

const FOOTPRINT = {
  energy_wh: 4200,
  energy_wh_low: 3100,
  energy_wh_high: 5400,
  emissions_g: 1400,
  emissions_g_low: 900,
  emissions_g_high: 1900,
  measured_share: 0.42,
  calibrated_share: 0.4,
  bounded_share: 0.18,
  covered_share: 0.93,
  image_energy_wh: 800,
  image_emissions_g: 260,
  reference_energy_wh: 9000,
  reference_emissions_g: 3200,
  unvalued_ops: { transcriptions: 12, searches: 34, speech_seconds: 480 },
  market_emissions_g: 1000,
  image_market_emissions_g: 260,
  market_backed_share: 0.3,
};

// Mirrors publicCalculation() in apps/api/services/usage/platformUsageStats.ts.
const CALCULATION = {
  version: '2026-09-14',
  direct_measurement: {
    energy: 'provider-reported kWh × 1,000 = Wh' as const,
    emissions: 'provider-reported g CO2e' as const,
  },
  estimated_text: {
    formula:
      '(input_tokens × input_mwh_per_token + output_tokens × output_mwh_per_token + requests × fixed_mwh_per_request) × provider_pue / calibration_pue' as const,
    calibration_pue: 1.5,
    profiles: [
      {
        basis: 'calibrated' as const,
        input_mwh_per_token: 0.00012,
        output_mwh_per_token: 0.00048,
        fixed_mwh_per_request: 0.02,
      },
      {
        basis: 'bounded' as const,
        input_mwh_per_token: 0.0002,
        output_mwh_per_token: 0.0008,
        fixed_mwh_per_request: 0.03,
      },
    ],
  },
  emissions_formula: 'energy_kwh × grid_g_per_kwh = g CO2e' as const,
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
    speech_seconds: 480,
  },
  footprint: FOOTPRINT,
  calculation: CALCULATION,
  providers: [
    {
      provider: 'mistral',
      grid_g_per_kwh: 22,
      pue: 1.5,
      pue_estimated: true,
      energy_wh: 2600,
      emissions_g: 700,
    },
    {
      provider: 'regolo',
      grid_g_per_kwh: 270,
      pue: 1.2,
      pue_estimated: false,
      energy_wh: 1600,
      emissions_g: 900,
    },
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
      input_tokens: 6_100_000,
      output_tokens: 900_000,
      total_tokens: 7_000_000,
      images: 0,
      transcriptions: 12,
      searches: 34,
      speech_seconds: 480,
      emissions_g: 1140,
    },
    {
      feature: 'sharepic',
      requests: 1120,
      input_tokens: 2_000_000,
      output_tokens: 200_000,
      total_tokens: 2_200_000,
      images: 140,
      transcriptions: 0,
      searches: 0,
      speech_seconds: 0,
      emissions_g: 260,
    },
  ],
  byModel: [
    {
      provider: 'mistral',
      model: 'mistral-medium-2604',
      unit: 'tokens' as const,
      requests: 4000,
      input_tokens: 6_100_000,
      output_tokens: 900_000,
      total_tokens: 7_000_000,
      ops: 0,
    },
    {
      provider: 'bfl',
      model: 'flux-2-pro',
      unit: 'images' as const,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      ops: 140,
    },
    {
      provider: 'linkup',
      model: 'linkup-search',
      unit: 'searches' as const,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      ops: 34,
    },
  ],
};

const RECHENWEG = '/transparenz?ansicht=experten';

function serveRecordingUrl(body: Record<string, unknown>): { url: URL | null } {
  const seen: { url: URL | null } = { url: null };
  server.use(
    http.get(ENDPOINT, ({ request }) => {
      seen.url = new URL(request.url);
      return HttpResponse.json(body);
    })
  );
  return seen;
}

function serve(body: Record<string, unknown>) {
  server.use(http.get(ENDPOINT, () => HttpResponse.json(body)));
}

describe('TransparenzView (Nachhaltigkeit)', () => {
  it('headlines the middle of the range and states both ends', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('1.400 g CO₂')
    );
    expect(screen.getByText('900 g und 1.900 g')).toBeInTheDocument();
    expect(
      screen.getByText(/Wir zeigen die Mitte, nicht den günstigsten Wert/)
    ).toBeInTheDocument();
    // No decimals anywhere — the estimate cannot carry tenths of a gram.
    expect(document.body.textContent).not.toMatch(/\d,\d\s*(g|kg|Wh|kWh)\b/);
  });

  it('names what carries no footprint instead of counting it as zero', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView />);

    await waitFor(() =>
      expect(
        screen.getByText(/Websuche, Spracherkennung und Sprachausgabe sind/)
      ).toBeInTheDocument()
    );
    expect(screen.getByText('nicht eingerechnet')).toBeInTheDocument();
  });

  it('splits the CO₂ by what people did', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView />);

    await waitFor(() => expect(screen.getByText('1.140 g')).toBeInTheDocument());
    expect(screen.getByText('260 g')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Chat 81 %, Sharepics & Bilder 19 %/ })
    ).toBeInTheDocument();
  });

  it('drops the green-power chapter when it saves nothing and renumbers the rest', async () => {
    serve({ ...RESPONSE, footprint: { ...FOOTPRINT, market_emissions_g: 1400 } });
    renderWithProviders(<TransparenzView />);

    await waitFor(() => expect(screen.getByText('Was kannst du tun?')).toBeInTheDocument());
    expect(screen.queryByText('Und mit Ökostrom?')).not.toBeInTheDocument();
    expect(screen.getByText('05')).toBeInTheDocument();
    expect(screen.queryByText('06')).not.toBeInTheDocument();
  });

  it('ignores a country or area left in the link', async () => {
    const seen = serveRecordingUrl(RESPONSE);
    renderWithProviders(<TransparenzView />, { route: '/transparenz?locale=at&bereich=monitor' });

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(seen.url?.searchParams.has('locale')).toBe(false);
    expect(seen.url?.searchParams.has('feature')).toBe(false);
  });

  it('opens the Rechenweg', async () => {
    serve(RESPONSE);
    const { user } = renderWithProviders(<TransparenzView />);

    await user.click(await screen.findByRole('button', { name: /Zum Rechenweg/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Rechenweg' })).toBeInTheDocument();
  });

  it('refuses to publish a figure when too few people were active', async () => {
    serve({ ...RESPONSE, sufficient_data: false, active_users: 2 });
    renderWithProviders(<TransparenzView />);

    await waitFor(() =>
      expect(
        screen.getByText(/Zu wenige Personen für eine veröffentlichbare Zahl/)
      ).toBeInTheDocument()
    );
    // The headline number must be absent entirely, not rendered as zero.
    expect(screen.queryByText(/CO₂/)).not.toBeInTheDocument();
  });

  it('surfaces an error banner when the endpoint fails', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderWithProviders(<TransparenzView />);

    await waitFor(() =>
      expect(screen.getByText(/Transparenzdaten konnten nicht geladen werden/)).toBeInTheDocument()
    );
  });
});

describe('TransparenzView (Rechenweg)', () => {
  it('names verdigado rather than the litellm routing key', async () => {
    serve({
      ...RESPONSE,
      providers: [
        {
          provider: 'litellm',
          grid_g_per_kwh: 363,
          pue: 1.13,
          pue_estimated: false,
          energy_wh: 2600,
          emissions_g: 700,
        },
      ],
    });
    renderWithProviders(<TransparenzView />, { route: RECHENWEG });

    await waitFor(() => expect(screen.getByText('verdigado')).toBeInTheDocument());
    expect(screen.queryByText('litellm')).not.toBeInTheDocument();
  });

  it('ranks providers by CO₂ rather than by energy, with their constants', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView />, { route: RECHENWEG });

    // Mistral burns more energy (2600 Wh vs 1600) but emits less (700 g vs 900).
    await waitFor(() => expect(screen.getByText('Netz 22 g/kWh')).toBeInTheDocument());
    const tags = screen.getAllByText(/^Netz /).map((n) => n.textContent);
    expect(tags).toEqual(['Netz 270 g/kWh', 'Netz 22 g/kWh']);
    expect(screen.getByText('PUE 1,2')).toBeInTheDocument();
  });

  it('marks only the estimated PUE as estimated and says how it was derived', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView />, { route: RECHENWEG });

    await waitFor(() => expect(screen.getAllByText(/^PUE /)).toHaveLength(2));
    expect(screen.getAllByText(/^PUE ≈/)).toHaveLength(1);
    expect(screen.getByText(/Energieeffizienzgesetzes/)).toBeInTheDocument();
  });

  it('lists the lanes without footprint as such', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView />, { route: RECHENWEG });

    await waitFor(() => expect(screen.getByText('linkup-search')).toBeInTheDocument());
    expect(screen.getByText('34 Recherchen')).toBeInTheDocument();
    expect(screen.getByText('mistral-medium-2604')).toBeInTheDocument();
  });

  it('discloses suppressed days', async () => {
    serve(RESPONSE);
    renderWithProviders(<TransparenzView />, { route: RECHENWEG });

    await waitFor(() => expect(screen.getByText(/in diesem Zeitraum 3 Tage/)).toBeInTheDocument());
  });

  it('asks the endpoint for the chosen country', async () => {
    const seen = serveRecordingUrl(RESPONSE);
    renderWithProviders(<TransparenzView />, { route: `${RECHENWEG}&locale=at` });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Formel' })).toBeInTheDocument()
    );
    expect(seen.url?.searchParams.get('locale')).toBe('at');
  });

  it('names the country when a segment is too thin to publish', async () => {
    serve({ ...RESPONSE, sufficient_data: false, active_users: 2 });
    renderWithProviders(<TransparenzView />, { route: `${RECHENWEG}&locale=at` });

    await waitFor(() =>
      expect(screen.getByText(/aus Österreich weniger als 5 Personen/)).toBeInTheDocument()
    );
  });

  it('asks for one area and drops the per-area panel', async () => {
    const seen = serveRecordingUrl(RESPONSE);
    renderWithProviders(<TransparenzView />, { route: `${RECHENWEG}&bereich=monitor` });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Formel' })).toBeInTheDocument()
    );
    expect(seen.url?.searchParams.get('feature')).toBe('monitor');
    expect(screen.queryByRole('heading', { name: 'Bereiche' })).not.toBeInTheDocument();
  });

  it('explains a missing area split instead of dropping the panel', async () => {
    serve({ ...RESPONSE, byFeature: [] });
    renderWithProviders(<TransparenzView />, { route: RECHENWEG });

    await waitFor(() => expect(screen.getByText(/keine Aufschlüsselung/)).toBeInTheDocument());
  });

  it('names the area when it is too thin to publish', async () => {
    serve({ ...RESPONSE, sufficient_data: false, active_users: 2 });
    renderWithProviders(<TransparenzView />, { route: `${RECHENWEG}&bereich=monitor` });

    await waitFor(() => expect(screen.getByText(/Für den Bereich „Monitor“/)).toBeInTheDocument());
  });
});

const wrapperFor = (route: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  };

describe('useFeatureParam', () => {
  it('reads the area from the URL and ignores unknown values', () => {
    const set = renderHook(() => useFeatureParam(), {
      wrapper: wrapperFor('/transparenz?bereich=monitor'),
    });
    expect(set.result.current.feature).toBe('monitor');

    const unknown = renderHook(() => useFeatureParam(), {
      wrapper: wrapperFor('/transparenz?bereich=quatsch'),
    });
    expect(unknown.result.current.feature).toBeNull();
  });

  it('does not offer „Sonstiges" as an area of its own', () => {
    // `other` is also where suppressed cells are folded; a filtered view of it
    // would isolate the hidden remainder by subtraction.
    const { result } = renderHook(() => useFeatureParam(), {
      wrapper: wrapperFor('/transparenz?bereich=other'),
    });
    expect(result.current.feature).toBeNull();
  });
});

describe('useTransparencyLocaleParam', () => {
  it('reads the country from the URL and defaults to the whole instance', () => {
    const at = renderHook(() => useTransparencyLocaleParam(), {
      wrapper: wrapperFor('/transparenz?locale=at'),
    });
    expect(at.result.current.locale).toBe('at');
    expect(at.result.current.available).toBe(true);

    const bare = renderHook(() => useTransparencyLocaleParam(), {
      wrapper: wrapperFor('/transparenz'),
    });
    expect(bare.result.current.locale).toBeNull();

    const unknown = renderHook(() => useTransparencyLocaleParam(), {
      wrapper: wrapperFor('/transparenz?locale=ch'),
    });
    expect(unknown.result.current.locale).toBeNull();
  });

  it('offers no split on an instance that pins its locale', () => {
    // bgst is one country by construction; a `?locale=` in a pasted link must
    // neither narrow the figure nor surface a switch.
    instance.id = 'bgst';
    const { result } = renderHook(() => useTransparencyLocaleParam(), {
      wrapper: wrapperFor('/transparenz?locale=at'),
    });
    expect(result.current.available).toBe(false);
    expect(result.current.locale).toBeNull();
  });
});
