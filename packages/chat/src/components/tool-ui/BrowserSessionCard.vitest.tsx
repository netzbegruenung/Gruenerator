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

import { BrowserSessionCard, deriveCardStatus } from './BrowserSessionCard';

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
    render(<BrowserSessionCard session={session()} status="done" />);
    expect(screen.getByText('www.stadt-muenster.de')).toBeInTheDocument();
    expect(screen.getByText(/2 Schritte/)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('reopens the panel with the persisted data on "Ansehen"', async () => {
    render(<BrowserSessionCard session={session()} status="done" />);
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
    render(<BrowserSessionCard session={session()} status="done" />);
    expect(screen.queryByRole('button', { name: /Ansehen/ })).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<BrowserSessionCard session={session()} status="done" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('card status', () => {
  it('running message without metadata is live', () => {
    expect(deriveCardStatus({ persisted: null, result: undefined, messageRunning: true })).toBe(
      'running'
    );
  });
  it('idle message, no metadata, no result is aborted (not an eternal spinner)', () => {
    expect(deriveCardStatus({ persisted: null, result: undefined, messageRunning: false })).toBe(
      'aborted'
    );
  });
  it('persisted running + idle message is aborted; + running message stays live', () => {
    expect(
      deriveCardStatus({ persisted: 'running', result: undefined, messageRunning: false })
    ).toBe('aborted');
    expect(
      deriveCardStatus({ persisted: 'running', result: undefined, messageRunning: true })
    ).toBe('running');
  });
  it('maps user abort to aborted and other errors to failed', () => {
    expect(
      deriveCardStatus({ persisted: null, result: { abgebrochen: true }, messageRunning: false })
    ).toBe('aborted');
    expect(
      deriveCardStatus({ persisted: null, result: { error: 'x' }, messageRunning: false })
    ).toBe('failed');
  });
  it('is independent of the store (another active session changes nothing)', () => {
    useArtifactLiveStore.setState({
      activeArtifact: {
        id: 'other',
        type: 'browser_session',
        title: 't',
        startUrl: 'https://a.de',
        status: 'running',
        steps: [],
        screenshots: [],
        summary: null,
      },
    });
    expect(
      deriveCardStatus({ persisted: 'running', result: undefined, messageRunning: true })
    ).toBe('running');
  });
});

describe('rendering', () => {
  it('shows aborted and opens the panel as failed', async () => {
    render(<BrowserSessionCard session={session({ status: 'running' })} status="aborted" />);
    expect(screen.getByRole('status')).toHaveTextContent('abgebrochen');
    await userEvent.click(screen.getByRole('button', { name: 'Ansehen: www.stadt-muenster.de' }));
    expect(useArtifactLiveStore.getState().activeArtifact).toMatchObject({ status: 'failed' });
  });

  it('shows running while streaming', () => {
    render(<BrowserSessionCard session={session({ status: 'running' })} status="running" />);
    expect(screen.getByText(/Erkundet …/)).toBeInTheDocument();
  });

  it('shows the error text, also without a session id', () => {
    render(
      <BrowserSessionCard
        session={session({ id: '', steps: [], screenshots: [] })}
        status="failed"
        errorText="Seite nicht erreichbar"
      />
    );
    expect(screen.getByText('Seite nicht erreichbar')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps fresher live store data when the same session is opened', async () => {
    const live = {
      id: 'bs-1',
      type: 'browser_session' as const,
      title: 'x',
      startUrl: 'https://a.de',
      status: 'running' as const,
      steps: [],
      screenshots: [{ name: 'neu', url: '/n.png' }],
      summary: null,
    };
    useArtifactLiveStore.setState({ activeArtifact: live });
    render(<BrowserSessionCard session={session()} status="running" />);
    await userEvent.click(screen.getByRole('button', { name: /Ansehen/ }));
    expect(useArtifactLiveStore.getState().activeArtifact).toBe(live);
  });
});
