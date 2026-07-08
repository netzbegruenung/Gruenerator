import { beforeEach, describe, expect, it } from 'vitest';

import { useComputeExportStore } from './computeExportStore';

describe('computeExportStore', () => {
  beforeEach(() => {
    useComputeExportStore.getState().clear();
  });

  it('stashes interpreter output files by name', () => {
    useComputeExportStore.getState().stash([
      { name: 'export.csv', base64: 'YQ==' },
      { name: 'report.txt', base64: 'Yg==' },
    ]);
    expect(useComputeExportStore.getState().files['export.csv']).toBe('YQ==');
    expect(useComputeExportStore.getState().files['report.txt']).toBe('Yg==');
  });

  it('overwrites a re-exported file with the newest bytes (mtime semantics)', () => {
    useComputeExportStore.getState().stash([{ name: 'export.csv', base64: 'YWx0' }]);
    useComputeExportStore.getState().stash([{ name: 'export.csv', base64: 'bmV1' }]);
    expect(useComputeExportStore.getState().files['export.csv']).toBe('bmV1');
  });

  it('clears on thread switch', () => {
    useComputeExportStore.getState().stash([{ name: 'export.csv', base64: 'YQ==' }]);
    useComputeExportStore.getState().clear();
    expect(useComputeExportStore.getState().files).toEqual({});
  });
});
