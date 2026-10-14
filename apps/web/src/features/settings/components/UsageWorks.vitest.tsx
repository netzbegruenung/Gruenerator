import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor } from '../../../test-utils';

import { buildCalendar, longestStreak, UsageWorks } from './UsageWorks';

const ENDPOINT = 'http://localhost/api/usage/me/activity';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

const ACTIVITY = {
  success: true as const,
  member_since: '2025-03-01T10:00:00.000Z',
  works: {
    chats: 12,
    user_messages: 80,
    assistant_words: 45_000,
    documents: 3,
    designs: 0,
    ai_images: 2,
    subtitled_videos: 0,
    deep_research: 0,
  },
  documents_by_type: [
    { subtype: 'pressemitteilung' as const, count: 2 },
    { subtype: 'antrag' as const, count: 1 },
  ],
  heatmap: [
    { day: '2026-10-01', count: 4 },
    { day: '2026-10-02', count: 1 },
    { day: '2026-10-03', count: 2 },
    { day: '2026-10-07', count: 9 },
  ],
};

describe('UsageWorks', () => {
  it('shows the non-zero works and hides the zero ones', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json(ACTIVITY)));
    const { container } = renderWithProviders(<UsageWorks />);

    await waitFor(() => expect(screen.getByText('Chats')).toBeInTheDocument());
    expect(screen.getByText('Wörter vom Grünerator (Chat)')).toBeInTheDocument();
    expect(screen.getByText('45.000')).toBeInTheDocument();
    expect(screen.getByText('Pressemitteilung')).toBeInTheDocument();
    expect(screen.getByText(/Dabei seit 01\.03\.2025/)).toBeInTheDocument();
    expect(screen.queryByText('Sharepics & Designs')).not.toBeInTheDocument();
    expect(screen.queryByText('Deep Research')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says so when nothing was created yet', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json({
          ...ACTIVITY,
          works: Object.fromEntries(Object.keys(ACTIVITY.works).map((k) => [k, 0])),
          documents_by_type: [],
          heatmap: [],
        })
      )
    );
    renderWithProviders(<UsageWorks />);
    await waitFor(() =>
      expect(screen.getByText('Du hast noch nichts erstellt.')).toBeInTheDocument()
    );
  });

  it('reports a failed load instead of rendering zeros', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderWithProviders(<UsageWorks />);
    await waitFor(() =>
      expect(screen.getByText(/konnten nicht geladen werden/)).toBeInTheDocument()
    );
  });
});

describe('buildCalendar', () => {
  it('covers 365 days in Monday-first weeks ending today', () => {
    const weeks = buildCalendar([{ day: '2026-10-09', count: 3 }], '2026-10-09');
    const inside = weeks.flat().filter((cell) => !cell.outside);

    expect(inside).toHaveLength(365);
    expect(inside.at(-1)).toMatchObject({ day: '2026-10-09', count: 3, level: 4 });
    // 2025-10-10 is a Friday: the first column is padded back to Monday.
    expect(weeks[0][0].day).toBe('2025-10-06');
    expect(weeks[0].slice(0, 4).every((cell) => cell.outside)).toBe(true);
    expect(weeks.slice(0, -1).every((week) => week.length === 7)).toBe(true);
  });

  it('scales levels against the busiest day', () => {
    const weeks = buildCalendar(
      [
        { day: '2026-10-08', count: 1 },
        { day: '2026-10-09', count: 8 },
      ],
      '2026-10-09'
    );
    const cells = weeks.flat();
    expect(cells.find((c) => c.day === '2026-10-08')?.level).toBe(1);
    expect(cells.find((c) => c.day === '2026-10-09')?.level).toBe(4);
    expect(cells.find((c) => c.day === '2026-10-07')?.level).toBe(0);
  });
});

describe('longestStreak', () => {
  it('counts consecutive calendar days, regardless of input order', () => {
    expect(longestStreak(ACTIVITY.heatmap)).toBe(3);
    expect(longestStreak([...ACTIVITY.heatmap].reverse())).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
});
