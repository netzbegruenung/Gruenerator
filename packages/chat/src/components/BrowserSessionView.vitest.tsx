/**
 * The live view of a `website_erkunden` run. What matters: the user sees where
 * the agent is (URL + latest screen), every step it took, how the run ended,
 * and the screenshots it saved — and none of that is locked away from a screen
 * reader behind the cursor graphic, which is decorative.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../test-utils';

import { BrowserSessionView } from './BrowserSessionView';

import type { BrowserSessionArtifact } from '../stores/artifactLiveStore';
import type { BrowserSessionStep } from '@gruenerator/contracts';

function step(n: number, overrides: Partial<BrowserSessionStep> = {}): BrowserSessionStep {
  return {
    n,
    url: `https://gruene.de/seite-${n}`,
    title: `Seite ${n}`,
    action: 'click',
    target: `Link ${n}`,
    xPct: 50,
    yPct: 40,
    thought: null,
    imageUrl: `/api/assets/step-${n}.jpg`,
    ...overrides,
  };
}

function artifact(overrides: Partial<BrowserSessionArtifact> = {}): BrowserSessionArtifact {
  return {
    id: 'bs-1',
    type: 'browser_session',
    title: 'gruene.de erkunden',
    startUrl: 'https://gruene.de',
    status: 'running',
    steps: [],
    screenshots: [],
    summary: null,
    ...overrides,
  };
}

describe('an empty run', () => {
  it('says the browser is starting instead of an empty frame', () => {
    render(<BrowserSessionView artifact={artifact()} />);

    expect(screen.getByText('Browser startet …')).toBeInTheDocument();
    expect(screen.getByText('https://gruene.de')).toBeInTheDocument();
  });
});

describe('a run with steps', () => {
  const steps = [
    step(1, { action: 'navigate', target: null, xPct: null, yPct: null }),
    step(2),
    step(3, { action: 'scroll', target: 'nach unten', xPct: null, yPct: null }),
  ];

  it('shows the current URL and the latest screen', () => {
    render(<BrowserSessionView artifact={artifact({ steps })} />);

    expect(screen.getByText('https://gruene.de/seite-3')).toBeInTheDocument();
    const img = screen.getByAltText('Bildschirm: Seite 3');
    expect(img).toHaveAttribute('src', '/api/assets/step-3.jpg');
  });

  it('lists every step, including the ones without a click position', () => {
    render(<BrowserSessionView artifact={artifact({ steps })} />);

    const list = screen.getByRole('list', { name: 'Schritte' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[2]).toHaveTextContent('scroll');
    expect(items[2]).toHaveTextContent('nach unten');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <BrowserSessionView
        artifact={artifact({
          steps,
          status: 'done',
          summary: 'Drei Seiten angesehen.',
          screenshots: [{ name: 'startseite', url: '/api/assets/startseite.png' }],
        })}
      />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('how a run ends', () => {
  it('says „Abgebrochen" when the run failed', () => {
    render(<BrowserSessionView artifact={artifact({ steps: [step(1)], status: 'failed' })} />);

    expect(screen.getByText('Abgebrochen')).toBeInTheDocument();
  });

  it('shows the summary once the run is done', () => {
    render(
      <BrowserSessionView
        artifact={artifact({ steps: [step(1)], status: 'done', summary: 'Alles gefunden.' })}
      />
    );

    expect(screen.getByText('Alles gefunden.')).toBeInTheDocument();
  });

  it('links each saved screenshot to its PNG in a new tab', () => {
    render(
      <BrowserSessionView
        artifact={artifact({
          steps: [step(1)],
          status: 'done',
          screenshots: [{ name: 'startseite', url: '/api/assets/startseite.png' }],
        })}
      />
    );

    const link = screen.getByRole('link', { name: /startseite/ });
    expect(link).toHaveAttribute('href', '/api/assets/startseite.png');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
