import { type CanvasEditorExportApi } from '@gruenerator/canvas-editor';
import { HOST_CAPABILITIES_GLOBAL, HOST_CAPABILITY_EDITOR_CHROME } from '@gruenerator/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNativeEditorChrome } from './useNativeEditorChrome';

vi.mock('../../utils/platform', () => ({ isEmbedded: () => true }));

const win = window as unknown as Record<string, unknown>;
let posted: unknown[];

function fromHost(message: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  });
}

function setup({ canEdit = true } = {}) {
  const exportApi = {
    current: { undo: vi.fn(), redo: vi.fn() } as unknown as CanvasEditorExportApi,
  };
  const onRename = vi.fn();
  const hook = renderHook(() =>
    useNativeEditorChrome({ title: 'Plakat', canEdit, exportApi, onRename })
  );
  return { hook, exportApi, onRename };
}

describe('useNativeEditorChrome', () => {
  beforeEach(() => {
    posted = [];
    win.ReactNativeWebView = { postMessage: (m: string) => posted.push(JSON.parse(m)) };
    win[HOST_CAPABILITIES_GLOBAL] = [HOST_CAPABILITY_EDITOR_CHROME];
  });

  afterEach(() => {
    delete win.ReactNativeWebView;
    delete win[HOST_CAPABILITIES_GLOBAL];
  });

  it('stays out of the way for a host that draws no bar', () => {
    win[HOST_CAPABILITIES_GLOBAL] = [];
    const { hook } = setup();
    expect(hook.result.current).toBeUndefined();
    expect(posted).toEqual([]);
  });

  it('reports title and history, and follows history changes', () => {
    const { hook } = setup();
    expect(posted.at(-1)).toEqual({
      type: 'EDITOR_STATE',
      title: 'Plakat',
      canEdit: true,
      canUndo: false,
      canRedo: false,
      history: true,
      canShare: true,
      actions: [],
    });
    act(() => hook.result.current?.onHistoryChange({ canUndo: true, canRedo: false }));
    expect(posted.at(-1)).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('runs the host buttons', () => {
    const { hook, exportApi, onRename } = setup();
    fromHost({ type: 'EDITOR_COMMAND', command: 'undo' });
    fromHost({ type: 'EDITOR_COMMAND', command: 'redo' });
    expect(exportApi.current.undo).toHaveBeenCalledTimes(1);
    expect(exportApi.current.redo).toHaveBeenCalledTimes(1);
    fromHost({ type: 'EDITOR_COMMAND', command: 'share' });
    expect(hook.result.current?.shareOpen).toBe(true);
    fromHost({ type: 'EDITOR_RENAME', title: 'Neuer Titel' });
    expect(onRename).toHaveBeenCalledWith('Neuer Titel');
  });

  it('does not let a viewer rename or undo', () => {
    const { onRename } = setup({ canEdit: false });
    act(() => undefined);
    expect(posted.at(-1)).toMatchObject({ canEdit: false, canUndo: false, canRedo: false });
    fromHost({ type: 'EDITOR_RENAME', title: 'Neuer Titel' });
    expect(onRename).not.toHaveBeenCalled();
  });
});
