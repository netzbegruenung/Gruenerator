import { HOST_CAPABILITIES_GLOBAL, HOST_CAPABILITY_EDITOR_CHROME } from '@gruenerator/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type NativeEditorBarOptions, useNativeEditorBar } from './useNativeEditorBar';

vi.mock('../utils/platform', () => ({ isEmbedded: () => true }));

const win = window as unknown as Record<string, unknown>;
let posted: unknown[];

function fromHost(message: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  });
}

function setup(overrides: Partial<NativeEditorBarOptions> = {}) {
  const options = {
    title: 'Haushalt',
    canEdit: true,
    onRename: vi.fn(),
    history: { canUndo: true, canRedo: false, undo: vi.fn(), redo: vi.fn() },
    onShare: vi.fn(),
    actions: [
      { id: 'chat', label: 'Chat', run: vi.fn() },
      { id: 'delete', label: 'Löschen', destructive: true, run: vi.fn() },
    ],
    ...overrides,
  };
  const hook = renderHook((props: NativeEditorBarOptions) => useNativeEditorBar(props), {
    initialProps: options,
  });
  return { hook, options };
}

describe('useNativeEditorBar', () => {
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
    expect(hook.result.current).toBe(false);
    expect(posted).toEqual([]);
  });

  it('reports nothing until the title is known', () => {
    const { hook } = setup({ title: null });
    expect(hook.result.current).toBe(true);
    expect(posted).toEqual([]);
  });

  it('reports state and menu without the closures', () => {
    setup();
    expect(posted.at(-1)).toEqual({
      type: 'EDITOR_STATE',
      title: 'Haushalt',
      canEdit: true,
      canUndo: true,
      canRedo: false,
      history: true,
      canShare: true,
      actions: [
        { id: 'chat', label: 'Chat' },
        { id: 'delete', label: 'Löschen', destructive: true },
      ],
    });
  });

  it('tells the host what the page lacks', () => {
    setup({ history: undefined, onShare: undefined, actions: undefined });
    expect(posted.at(-1)).toMatchObject({
      canUndo: false,
      canRedo: false,
      history: false,
      canShare: false,
      actions: [],
    });
  });

  it('does not re-report when only the closures change', () => {
    const { hook, options } = setup();
    const before = posted.length;
    hook.rerender({ ...options, onRename: vi.fn(), actions: [...options.actions] });
    expect(posted).toHaveLength(before);
  });

  it('runs the host buttons and menu picks with the latest callbacks', () => {
    const { hook, options } = setup();
    const run = vi.fn();
    hook.rerender({ ...options, actions: [{ id: 'chat', label: 'Chat', run }] });
    fromHost({ type: 'EDITOR_COMMAND', command: 'undo' });
    fromHost({ type: 'EDITOR_COMMAND', command: 'redo' });
    fromHost({ type: 'EDITOR_COMMAND', command: 'share' });
    fromHost({ type: 'EDITOR_ACTION', id: 'chat' });
    fromHost({ type: 'EDITOR_ACTION', id: 'gibt-es-nicht' });
    fromHost({ type: 'EDITOR_RENAME', title: 'Neu' });
    expect(options.history.undo).toHaveBeenCalledTimes(1);
    expect(options.history.redo).toHaveBeenCalledTimes(1);
    expect(options.onShare).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(options.actions[0]?.run).not.toHaveBeenCalled();
    expect(options.onRename).toHaveBeenCalledWith('Neu');
  });

  it('does not let a viewer rename or undo', () => {
    const { options } = setup({ canEdit: false });
    expect(posted.at(-1)).toMatchObject({ canEdit: false, canUndo: false, canRedo: false });
    fromHost({ type: 'EDITOR_RENAME', title: 'Neu' });
    expect(options.onRename).not.toHaveBeenCalled();
  });
});
