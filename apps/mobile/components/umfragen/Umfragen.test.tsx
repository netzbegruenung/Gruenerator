import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { type ReactNode } from 'react';

import UmfragenScreen from '../../app/(focused)/umfragen';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('../navigation/ScreenScaffold', () => ({
  ScreenScaffold: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../../hooks/monitor/monitorLocale', () => ({ useMonitorLocale: () => 'de' }));
jest.mock('../../hooks/useTabBarClearance', () => ({ useTabBarClearance: () => 0 }));
jest.mock('../../hooks/useLayout', () => ({ useContentColumn: () => ({}) }));

const mockPolls = {
  data: {
    average: { 'CDU/CSU': 28, GRÜNE: 12.5, SPD: 15 },
    diffs: { GRÜNE: 0.4 },
    polls: [{ date: '2026-10-30' }, { date: '2026-10-20' }],
    trend: {
      GRÜNE: [
        { date: 'a', value: 11 },
        { date: 'b', value: 12.5 },
      ],
    },
  },
  isLoading: false,
  isPending: false,
  isError: false,
  refetch: jest.fn(),
};
jest.mock('../../hooks/monitor/useMonitor', () => ({
  usePolls: () => mockPolls,
  usePollsOverview: () => ({
    data: { entries: [{ parliament: 'bayern', gruene: 14.5, latestPollDate: null }] },
    isLoading: false,
  }),
  useEuGreens: () => ({ data: { results: [] }, isLoading: false }),
}));

const bavaria = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Bayern' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [10, 48],
            [13, 48],
            [13, 50],
            [10, 50],
            [10, 48],
          ],
        ],
      },
    },
  ],
};

// `import * as` would copy the (non-ES) mock; spy on the module object the screen reads.
// The config restores spies between tests, so each test installs its own.
const setParams = (params: Record<string, string>) =>
  jest
    .spyOn(
      jest.requireMock<{ useLocalSearchParams: () => unknown }>('expo-router'),
      'useLocalSearchParams'
    )
    .mockReturnValue(params);

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  return await render(
    <QueryClientProvider client={client}>
      <UmfragenScreen />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setParams({});
});

describe('Umfragen-Screen', () => {
  it('leads an unknown land back to the overview without crashing', async () => {
    setParams({ land: 'xyz' });
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    await renderScreen();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ pathname: '/(focused)/umfragen', params: {} })
    );
    expect(screen.queryByText('Sonntagsfrage')).toBeNull();
  });

  it('shows the placeholder when the geodata fails and keeps the bars', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    await renderScreen();
    expect(await screen.findByTestId('karte-fehler')).toBeTruthy();
    expect(screen.getByText('Karte konnte nicht geladen werden.')).toBeTruthy();
    expect(screen.getByText('Sonntagsfrage')).toBeTruthy();
    expect(screen.getByText('GRÜNE')).toBeTruthy();
  });

  it('opens the page of a Bundesland when its region is pressed', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(bavaria) })
    ) as unknown as typeof fetch;
    await renderScreen();
    const region = await waitFor(() => screen.getByTestId('karte-region-Bayern'));
    await fireEvent.press(region);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/umfragen',
      params: { land: 'bayern' },
    });
  });
});
