/**
 * StatisticsTab — the expandable rows and the subtype chips hand-write
 * `aria-expanded`/`aria-pressed`, so axe runs here.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, userEvent } from '../../../test-utils';

import StatisticsTab from './StatisticsTab';

import type { GetAdminStatsResponseDto } from '@gruenerator/contracts';

const URL = 'http://localhost/api/auth/admin/statistics';

function response(locale: 'all' | 'at'): GetAdminStatsResponseDto {
  return {
    success: true,
    bucket: 'month',
    locale,
    from: '2026-09-01',
    to: '2026-10-31',
    generated_at: '2026-10-26T12:00:00.000Z',
    min_group_size: 5,
    suppressed_cells: locale === 'at' ? 1 : 0,
    live: [
      {
        kind: 'documents',
        points: [
          {
            bucket: '2026-09-01',
            total: 3,
            by_subtype: [{ subtype: 'antrag', value: 3 }],
          },
          {
            bucket: '2026-10-01',
            total: locale === 'at' ? null : 9,
            by_subtype: [{ subtype: 'antrag', value: locale === 'at' ? null : 9 }],
          },
        ],
      },
    ],
    counter: { since: null, series: [] },
  };
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

describe('StatisticsTab', () => {
  it('sums the window, expands into buckets and subtypes, and passes axe', async () => {
    server.use(http.get(URL, () => HttpResponse.json(response('all'))));
    const { container } = renderWithProviders(<StatisticsTab />);

    const row = await screen.findByRole('button', { name: /Dokumente/ });
    expect(row).toHaveTextContent('12');
    expect(row).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Antrag · 12/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('cell', { name: '9' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('marks a partial sum and renders a suppressed cell as "< 5"', async () => {
    server.use(http.get(URL, () => HttpResponse.json(response('at'))));
    renderWithProviders(<StatisticsTab />);

    const row = await screen.findByRole('button', { name: /Dokumente/ });
    expect(row).toHaveTextContent('mind. 3');
    await userEvent.click(row);
    expect(screen.getByRole('cell', { name: '< 5' })).toBeInTheDocument();
  });
});
