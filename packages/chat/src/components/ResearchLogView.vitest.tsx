/**
 * The only feedback there is during a run that takes minutes.
 *
 * So the tests are about what the panel says when it has nothing yet, what it
 * says when the run ends, and whether a screen reader learns the status of a
 * step at all — the icons carry it visually and are `aria-hidden`, which makes
 * the visually-hidden label the ONLY channel for it.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResearchLogView } from './ResearchLogView';

import type { ResearchLogArtifact } from '../stores/artifactLiveStore';

function artifact(overrides: Partial<ResearchLogArtifact> = {}): ResearchLogArtifact {
  return {
    id: 'research-1',
    type: 'research_log',
    title: 'Recherche: Wiens Klimaziel',
    plan: [],
    steps: [],
    status: 'running',
    ...overrides,
  } as ResearchLogArtifact;
}

describe('while the run is still planning', () => {
  it('says the agent is planning instead of showing an empty panel', () => {
    render(<ResearchLogView artifact={artifact()} />);

    expect(screen.getByText(/Der Agent plant die Recherche/)).toBeInTheDocument();
  });

  it('warns that this takes minutes, so a slow run does not read as a hang', () => {
    render(<ResearchLogView artifact={artifact()} />);

    expect(screen.getByText(/dauert einige Minuten/)).toBeInTheDocument();
  });

  it('drops the planning hint as soon as there is a plan to show', () => {
    render(
      <ResearchLogView
        artifact={artifact({ plan: [{ id: 'p0', label: 'Zahlen sammeln', status: 'running' }] })}
      />
    );

    expect(screen.queryByText(/Der Agent plant die Recherche/)).not.toBeInTheDocument();
    expect(screen.getByText('Zahlen sammeln')).toBeInTheDocument();
  });
});

describe('progress', () => {
  it('counts finished plan steps in the heading', () => {
    render(
      <ResearchLogView
        artifact={artifact({
          plan: [
            { id: 'p0', label: 'Zahlen sammeln', status: 'done' },
            { id: 'p1', label: 'Quellen prüfen', status: 'done' },
            { id: 'p2', label: 'Bericht schreiben', status: 'running' },
          ],
        })}
      />
    );

    expect(screen.getByText(/Plan \(2\/3\)/)).toBeInTheDocument();
  });

  it('names every step status in text, since the icons are aria-hidden', () => {
    render(
      <ResearchLogView
        artifact={artifact({
          steps: [
            { id: 's0', label: 'Suche: Klimaziel', status: 'done' },
            { id: 's1', label: 'Tiefensuche: Maßnahmen', status: 'failed' },
            { id: 's2', label: 'Seite lesen: wien.gv.at', status: 'running' },
          ],
        })}
      />
    );

    expect(screen.getByText(/— abgeschlossen/)).toBeInTheDocument();
    expect(screen.getByText(/— fehlgeschlagen/)).toBeInTheDocument();
    expect(screen.getByText(/— läuft/)).toBeInTheDocument();
  });

  it('announces the running commentary politely rather than interrupting', () => {
    const { container } = render(
      <ResearchLogView
        artifact={artifact({ steps: [{ id: 's0', label: 'Suche läuft', status: 'running' }] })}
      />
    );

    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('when the run ends', () => {
  it('links the finished report', () => {
    render(
      <ResearchLogView artifact={artifact({ status: 'done', documentUrl: '/office/abc-123' })} />
    );

    expect(screen.getByRole('link', { name: /Bericht öffnen/ })).toHaveAttribute(
      'href',
      '/office/abc-123'
    );
  });

  it('drops the "still running" line once it is done', () => {
    render(
      <ResearchLogView artifact={artifact({ status: 'done', documentUrl: '/office/abc-123' })} />
    );

    expect(screen.queryByText(/dauert einige Minuten/)).not.toBeInTheDocument();
  });

  it('says so plainly on failure, and offers no report link', () => {
    render(<ResearchLogView artifact={artifact({ status: 'failed' })} />);

    expect(screen.getByText(/konnte nicht abgeschlossen werden/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bericht öffnen/ })).not.toBeInTheDocument();
  });

  it('keeps the partial plan visible after a failure, so the work is not lost', () => {
    render(
      <ResearchLogView
        artifact={artifact({
          status: 'failed',
          plan: [{ id: 'p0', label: 'Zahlen sammeln', status: 'done' }],
        })}
      />
    );

    expect(screen.getByText('Zahlen sammeln')).toBeInTheDocument();
  });
});
