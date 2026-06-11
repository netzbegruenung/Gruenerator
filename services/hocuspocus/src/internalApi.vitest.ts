import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import { applyPatchToDoc, readMergedState } from './internalApi.js';

function buildPage(state: Record<string, unknown>): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set('id', 'page-1');
  page.set('configId', 'dreizeilen');
  const stateMap = new Y.Map<unknown>();
  page.set('state', stateMap);
  // Y types must be attached to a doc before entries are set via transact
  // in real flows, but bare construction works for plain values too.
  for (const [k, v] of Object.entries(state)) stateMap.set(k, v);
  return page;
}

describe('internal canvas API doc helpers', () => {
  it('seeds formState with the full state on a never-opened doc', () => {
    const doc = new Y.Doc();
    applyPatchToDoc(doc, { line2: 'Neu' }, { line1: 'A', line2: 'B', line3: 'C' });

    const { state, hasYState } = readMergedState(doc);
    expect(hasYState).toBe(true);
    expect(state).toMatchObject({ line1: 'A', line2: 'Neu', line3: 'C' });
  });

  it('patches both formState and every page state map', () => {
    const doc = new Y.Doc();
    const pages = doc.getArray<Y.Map<unknown>>('pages');
    doc.transact(() => {
      pages.push([buildPage({ line1: 'Alt', line2: 'Alt2' })]);
      doc.getMap<unknown>('formState').set('line1', 'Alt');
    });

    applyPatchToDoc(doc, { line1: 'Frisch' }, null);

    const pageState = pages.get(0).get('state') as Y.Map<unknown>;
    expect(pageState.get('line1')).toBe('Frisch');
    expect(doc.getMap<unknown>('formState').get('line1')).toBe('Frisch');
  });

  it('merges page state under formState (formState wins)', () => {
    const doc = new Y.Doc();
    const pages = doc.getArray<Y.Map<unknown>>('pages');
    doc.transact(() => {
      pages.push([buildPage({ line1: 'Seed', colorSchemeId: 'tanne-sand' })]);
      doc.getMap<unknown>('formState').set('line1', 'Editiert');
    });

    const { state } = readMergedState(doc);
    expect(state.line1).toBe('Editiert');
    expect(state.colorSchemeId).toBe('tanne-sand');
  });

  it('reports hasYState=false for an empty doc', () => {
    const doc = new Y.Doc();
    expect(readMergedState(doc).hasYState).toBe(false);
  });
});
