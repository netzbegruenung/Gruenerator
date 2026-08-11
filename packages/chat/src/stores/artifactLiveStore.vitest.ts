import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canAutoOpenArtifactPanel,
  useArtifactLiveStore,
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
  useArtifactLiveStore.setState({ activeArtifact: null });
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says no on a phone-width window', () => {
    vi.stubGlobal('window', { innerWidth: 390 });

    expect(canAutoOpenArtifactPanel()).toBe(false);
  });

  it('says no just below the dock threshold', () => {
    vi.stubGlobal('window', { innerWidth: 72 * 16 - 1 });

    expect(canAutoOpenArtifactPanel()).toBe(false);
  });

  it('says yes from the dock threshold up', () => {
    vi.stubGlobal('window', { innerWidth: 72 * 16 });

    expect(canAutoOpenArtifactPanel()).toBe(true);
  });

  it('says no without a window at all', () => {
    vi.stubGlobal('window', undefined);

    expect(canAutoOpenArtifactPanel()).toBe(false);
  });
});
