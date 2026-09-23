/**
 * Der Verlauf ist die einzige Stelle, an der ein Mensch sieht, was ein
 * selbstlaufender Agent getan hat (#3221). Drei Anzeigeregeln sind deshalb
 * Vertrag und nicht Geschmack, und genau die prüft dieser Test:
 *
 * 1. Das Link-Label folgt der ZUSTELLUNG, nicht dem Lauf — der Lauf kennt sie
 *    nicht. „Dokument öffnen" über einem Chat-Ergebnis war der Fehler in den
 *    Benachrichtigungen.
 * 2. Ein leerer Lauf ist kein Fehler.
 * 3. Ein zufriedenes Verdikt bleibt unsichtbar; nur ein beanstandetes erscheint
 *    — und zwar als Hinweis, nicht als Fehler, denn zugestellt wurde trotzdem.
 */
import { type RecurringTaskRun } from '@gruenerator/contracts';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { axe, renderWithProviders, screen, waitFor } from '../../test-utils';

import { RunHistory } from './RunHistory';

const listRuns = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ recurringTasks: { listRuns } }),
}));

function run(over: Partial<RecurringTaskRun> = {}): RecurringTaskRun {
  return {
    id: 'r1',
    taskId: 't1',
    status: 'completed',
    resultsSummary: null,
    resultUrl: '/office/d1',
    error: null,
    durationMs: 4200,
    verdict: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-09-01T07:00:00.000Z',
    ...over,
  };
}

function serve(runs: RecurringTaskRun[]) {
  listRuns.mockResolvedValue({ status: 200, body: { success: true, runs } });
}

beforeEach(() => {
  listRuns.mockReset();
});

describe('RunHistory', () => {
  it('benennt das Ergebnis nach der Zustellung: Dokument', async () => {
    serve([run()]);
    renderWithProviders(<RunHistory taskId="t1" delivery="document" />);

    expect(await screen.findByRole('link', { name: 'Dokument öffnen' })).toHaveAttribute(
      'href',
      '/office/d1'
    );
  });

  it('benennt das Ergebnis nach der Zustellung: Chat', async () => {
    serve([run({ resultUrl: '/chat/th1' })]);
    renderWithProviders(<RunHistory taskId="t1" delivery="thread" />);

    expect(await screen.findByRole('link', { name: 'Chat öffnen' })).toHaveAttribute(
      'href',
      '/chat/th1'
    );
  });

  it('zeigt bei Zusammenfassung den Text statt eines Links', async () => {
    serve([run({ resultUrl: null, resultsSummary: 'Drei neue Beschlüsse.' })]);
    renderWithProviders(<RunHistory taskId="t1" delivery="summary" />);

    expect(await screen.findByText('Drei neue Beschlüsse.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('erklärt einen leeren Lauf, ohne ihn als Fehler zu zeigen', async () => {
    serve([run({ status: 'empty', resultUrl: null })]);
    renderWithProviders(<RunHistory taskId="t1" delivery="document" />);

    expect(await screen.findByText('Nichts Neues')).toBeInTheDocument();
    expect(
      screen.getByText('Der Lauf hat nichts ergeben — es wurde nichts zugestellt.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Fehlgeschlagen')).not.toBeInTheDocument();
  });

  it('zeigt den Fehlertext eines gescheiterten Laufs', async () => {
    serve([run({ status: 'failed', resultUrl: null, error: 'agentic turn degraded: aborted' })]);
    renderWithProviders(<RunHistory taskId="t1" delivery="document" />);

    expect(await screen.findByText('Fehlgeschlagen')).toBeInTheDocument();
    expect(screen.getByText('agentic turn degraded: aborted')).toBeInTheDocument();
  });

  it('zeigt einen beanstandeten Selbstprüfungs-Hinweis samt Nachbesserung', async () => {
    serve([run({ verdict: { ok: false, hint: 'Thema verfehlt', repaired: true } })]);
    renderWithProviders(<RunHistory taskId="t1" delivery="document" />);

    const note = await screen.findByText(/Selbstprüfung: Thema verfehlt/);
    expect(note).toHaveTextContent('nachgebessert');
  });

  it('verschweigt ein zufriedenes Verdikt', async () => {
    serve([run({ verdict: { ok: true } })]);
    renderWithProviders(<RunHistory taskId="t1" delivery="document" />);

    await screen.findByText('Erledigt');
    expect(screen.queryByText(/Selbstprüfung/)).not.toBeInTheDocument();
  });

  it('sagt es, wenn noch kein Lauf existiert', async () => {
    serve([]);
    renderWithProviders(<RunHistory taskId="t1" delivery="document" />);

    expect(await screen.findByText('Noch kein Lauf.')).toBeInTheDocument();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    serve([run(), run({ id: 'r2', status: 'failed', error: 'Zeitüberschreitung' })]);
    const { container } = renderWithProviders(<RunHistory taskId="t1" delivery="document" />);

    await screen.findByText('Erledigt');
    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
