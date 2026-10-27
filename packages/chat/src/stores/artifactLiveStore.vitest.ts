import { beforeEach, describe, expect, it } from 'vitest';

import {
  canAutoOpenArtifactPanel,
  useArtifactLiveStore,
  type BrowserSessionArtifact,
  type ResearchLogArtifact,
} from './artifactLiveStore';

/**
 * The research log is the only artifact that changes after it opens, so the
 * merge semantics are worth pinning: a run emits one start and then dozens of
 * partial updates over several minutes, and a step that arrives twice (running,
 * then done) must update in place rather than pile up.
 */

const LOG: ResearchLogArtifact = {
  id: 'research-1',
  type: 'research_log',
  title: 'Recherche: Wien',
  plan: [],
  steps: [],
  status: 'running',
};

function activeLog(): ResearchLogArtifact {
  const active = useArtifactLiveStore.getState().activeArtifact;
  if (!active || active.type !== 'research_log') throw new Error('no research log active');
  return active;
}

beforeEach(() => {
  useArtifactLiveStore.setState({ activeArtifact: null, panelDockable: false });
});

describe('upsertResearchLog', () => {
  it('merges a step by id instead of appending it twice', () => {
    useArtifactLiveStore.getState().setActiveArtifact(LOG);
    const store = useArtifactLiveStore.getState();

    store.upsertResearchLog('research-1', {
      steps: [{ id: 's1', label: 'Suche: Wien', status: 'running' }],
    });
    store.upsertResearchLog('research-1', {
      steps: [{ id: 's1', label: 'Suche: Wien', status: 'done' }],
    });

    expect(activeLog().steps).toHaveLength(1);
    expect(activeLog().steps[0].status).toBe('done');
  });

  it('appends unknown steps in first-seen order', () => {
    useArtifactLiveStore.getState().setActiveArtifact(LOG);
    const store = useArtifactLiveStore.getState();

    store.upsertResearchLog('research-1', {
      steps: [{ id: 's1', label: 'eins', status: 'done' }],
    });
    store.upsertResearchLog('research-1', {
      steps: [{ id: 's2', label: 'zwei', status: 'running' }],
    });

    expect(activeLog().steps.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('replaces the plan wholesale, because todos are re-sent in full', () => {
    useArtifactLiveStore.getState().setActiveArtifact(LOG);
    const store = useArtifactLiveStore.getState();

    store.upsertResearchLog('research-1', {
      plan: [{ id: 'p0', label: 'a', status: 'running' }],
    });
    store.upsertResearchLog('research-1', {
      plan: [
        { id: 'p0', label: 'a', status: 'done' },
        { id: 'p1', label: 'b', status: 'running' },
      ],
    });

    expect(activeLog().plan).toHaveLength(2);
    expect(activeLog().plan[0].status).toBe('done');
  });

  it('carries the finished document through', () => {
    useArtifactLiveStore.getState().setActiveArtifact(LOG);

    useArtifactLiveStore.getState().upsertResearchLog('research-1', {
      status: 'done',
      documentUrl: '/office/doc-42',
      documentId: 'doc-42',
    });

    expect(activeLog().status).toBe('done');
    expect(activeLog().documentUrl).toBe('/office/doc-42');
  });

  it('ignores updates for a log that is no longer open', () => {
    // A late update must never re-open the panel over whatever the user is
    // looking at now.
    useArtifactLiveStore.getState().setActiveArtifact(null);

    useArtifactLiveStore.getState().upsertResearchLog('research-1', { status: 'done' });

    expect(useArtifactLiveStore.getState().activeArtifact).toBeNull();
  });

  it('ignores updates addressed to a different run', () => {
    useArtifactLiveStore.getState().setActiveArtifact(LOG);

    useArtifactLiveStore.getState().upsertResearchLog('research-2', {
      steps: [{ id: 'x', label: 'fremd', status: 'running' }],
    });

    expect(activeLog().steps).toHaveLength(0);
  });
});

describe('canAutoOpenArtifactPanel', () => {
  it('says no until a host reports a dockable panel', () => {
    // Anfangszustand: React Native und die Editor-Chats melden nie, dort
    // rendert auch keine Schiene.
    expect(canAutoOpenArtifactPanel()).toBe(false);
  });

  it('says no while the chat column is too narrow to dock', () => {
    useArtifactLiveStore.getState().setPanelDockable(false);

    expect(canAutoOpenArtifactPanel()).toBe(false);
  });

  it('says yes once the column is wide enough to dock', () => {
    useArtifactLiveStore.getState().setPanelDockable(true);

    expect(canAutoOpenArtifactPanel()).toBe(true);
  });
});

describe('upsertBrowserSession', () => {
  const SESSION: BrowserSessionArtifact = {
    id: 'bs-1',
    type: 'browser_session',
    title: 'gruene.de',
    startUrl: 'https://gruene.de',
    status: 'running',
    steps: [],
    screenshots: [],
    summary: null,
  };
  const step = (n: number, action: string) => ({
    n,
    url: 'https://gruene.de',
    title: 'Start',
    action,
    target: null,
    xPct: null,
    yPct: null,
    thought: null,
    imageUrl: `/img/${n}`,
  });
  const active = (): BrowserSessionArtifact => {
    const a = useArtifactLiveStore.getState().activeArtifact;
    if (!a || a.type !== 'browser_session') throw new Error('no session active');
    return a;
  };

  it('merges steps by n and screenshots by name', () => {
    const store = useArtifactLiveStore.getState();
    store.setActiveArtifact(SESSION);
    store.upsertBrowserSession('bs-1', { steps: [step(1, 'navigate'), step(2, 'click')] });
    store.upsertBrowserSession('bs-1', { steps: [step(2, 'scroll')] });
    store.upsertBrowserSession('bs-1', { screenshots: [{ name: 'a', url: '/a1' }] });
    store.upsertBrowserSession('bs-1', { screenshots: [{ name: 'a', url: '/a2' }] });

    expect(active().steps.map((s) => s.action)).toEqual(['navigate', 'scroll']);
    expect(active().screenshots).toEqual([{ name: 'a', url: '/a2' }]);
  });

  it('orders steps by n, not by arrival — the same rule as the message copy', () => {
    const store = useArtifactLiveStore.getState();
    store.setActiveArtifact(SESSION);
    store.upsertBrowserSession('bs-1', { steps: [step(3, 'click')] });
    store.upsertBrowserSession('bs-1', { steps: [step(1, 'navigate')] });
    store.upsertBrowserSession('bs-1', { steps: [step(2, 'scroll')] });

    expect(active().steps.map((s) => s.n)).toEqual([1, 2, 3]);
  });

  it('overwrites scalar fields', () => {
    const store = useArtifactLiveStore.getState();
    store.setActiveArtifact(SESSION);
    store.upsertBrowserSession('bs-1', { status: 'done', summary: 'Fertig' });
    expect(active().status).toBe('done');
    expect(active().summary).toBe('Fertig');
  });

  it('is a no-op for a session that is not active', () => {
    useArtifactLiveStore.getState().setActiveArtifact(SESSION);
    useArtifactLiveStore.getState().upsertBrowserSession('other', { status: 'failed' });
    expect(active().status).toBe('running');
  });
});
