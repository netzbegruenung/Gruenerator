/**
 * Tests for the interpreter's session file store — the bridge that holds
 * composer-attached tabular files for the code-block Run button.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { usePythonFileStore } from './pythonFileStore';

const file = (name: string) => ({ name, mimeType: 'text/csv', bytes: new ArrayBuffer(1) });

describe('usePythonFileStore', () => {
  beforeEach(() => usePythonFileStore.getState().clear());

  it('starts empty', () => {
    expect(usePythonFileStore.getState().files).toEqual([]);
  });

  it('adds files', () => {
    usePythonFileStore.getState().setFile(file('a.csv'));
    usePythonFileStore.getState().setFile(file('b.xlsx'));
    expect(usePythonFileStore.getState().files.map((f) => f.name)).toEqual(['a.csv', 'b.xlsx']);
  });

  it('replaces (does not duplicate) a re-attached same-name file', () => {
    const first = file('a.csv');
    const second = { ...file('a.csv'), bytes: new ArrayBuffer(2) };
    usePythonFileStore.getState().setFile(first);
    usePythonFileStore.getState().setFile(second);
    const { files } = usePythonFileStore.getState();
    expect(files).toHaveLength(1);
    expect(files[0].bytes.byteLength).toBe(2);
  });

  it('clears on thread switch', () => {
    usePythonFileStore.getState().setFile(file('a.csv'));
    usePythonFileStore.getState().clear();
    expect(usePythonFileStore.getState().files).toEqual([]);
  });
});
