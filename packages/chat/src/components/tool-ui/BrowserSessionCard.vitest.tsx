/**
 * The chat card of a `website_erkunden` run: where it went, how far it got, the
 * screenshots it saved — and a way back into the live view. A session that comes
 * back from storage still "running" died with the page and must say so.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useArtifactLiveStore } from '../../stores/artifactLiveStore';
import { axe } from '../../test-utils';

import { BrowserSessionCard } from './BrowserSessionCard';

import type { BrowserSessionMeta } from '@gruenerator/contracts';

function session(overrides: Partial<BrowserSessionMeta> = {}): BrowserSessionMeta {
  return {
    id: 'bs-1',
    startUrl: 'https://www.stadt-muenster.de/start',
    status: 'done',
    steps: [
      {
        n: 1,
        url: 'https://www.stadt-muenster.de',
        title: 'Start',
        action: 'navigate',
        target: null,
        xPct: null,
        yPct: null,
        thought: null,
        imageUrl: '/a/1.jpg',
      },
      {
        n: 2,
        url: 'https://www.stadt-muenster.de/klima',
        title: 'Klima',
        action: 'click',
        target: 'Klimaschutz',
        xPct: 40,
        yPct: 30,
        thought: null,
        imageUrl: '/a/2.jpg',
      },
    ],
    screenshots: [
      { name: 'startseite', url: '/a/startseite.png' },
      { name: 'klima', url: '/a/klima.png' },
    ],
    summary: 'Fertig.',
    ...overrides,
  };
}

beforeEach(() => {
  useArtifactLiveStore.setState({ activeArtifact: null, panelMounted: true });
});

describe('a finished session', () => {
  it('shows host, step count and the saved screenshots', () => {
    render(<BrowserSessionCard session={session()} live={false} />);
    expect(screen.getByText('www.stadt-muenster.de')).toBeInTheDocument();
    expect(screen.getByText(/2 Schritte/)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('reopens the panel with the persisted data on "Ansehen"', async () => {
    render(<BrowserSessionCard session={session()} live={false} />);
    await userEvent.click(screen.getByRole('button', { name: /Ansehen/ }));
    const active = useArtifactLiveStore.getState().activeArtifact;
    expect(active).toMatchObject({
      id: 'bs-1',
      type: 'browser_session',
      title: 'www.stadt-muenster.de',
      startUrl: 'https://www.stadt-muenster.de/start',
      status: 'done',
      summary: 'Fertig.',
    });
    expect(active?.type === 'browser_session' && active.steps).toHaveLength(2);
  });

  it('offers no button where no panel can dock', () => {
    useArtifactLiveStore.setState({ panelMounted: false });
    render(<BrowserSessionCard session={session()} live={false} />);
    expect(screen.queryByRole('button', { name: /Ansehen/ })).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<BrowserSessionCard session={session()} live={false} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('a session restored as "running"', () => {
  it('is shown as abgebrochen and opens as failed', async () => {
    render(<BrowserSessionCard session={session({ status: 'running' })} live={false} />);
    expect(screen.getByText(/abgebrochen/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ansehen/ }));
    expect(useArtifactLiveStore.getState().activeArtifact).toMatchObject({ status: 'failed' });
  });

  it('stays running while it really streams', () => {
    render(<BrowserSessionCard session={session({ status: 'running' })} live />);
    expect(screen.getByText(/Erkundet …/)).toBeInTheDocument();
  });
});
