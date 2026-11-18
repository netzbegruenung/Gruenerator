import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { secureStorage } from '../services/storage';

import { useMessageActions } from './useMessageActions';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: jest.fn().mockImplementation(() => ({ uri: 'file:///cache/a.docx', writeSync: jest.fn() })),
}));
jest.mock('../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
const mockBegin = jest.fn();
jest.mock('../stores/recipeEditorStore', () => ({
  NEW_RECIPE_TARGET: 'neu',
  useRecipeEditorStore: { getState: () => ({ begin: mockBegin }) },
}));
const mockDraft = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ userTextForms: { draft: mockDraft } }),
}));

type AnyMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const getToken = secureStorage.getToken as unknown as AnyMock;
const message = { role: 'assistant', text: 'Hallo', metadata: {} };
const ok = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(1),
    json: async () => body,
  }) as unknown as Response;

/**
 * The export/open handlers moved their `try/finally` out of the hook so the
 * React Compiler can memoize it (#4419). These pin the control flow the old
 * `finally` guaranteed: the spinner always clears, on every exit path.
 */
describe('useMessageActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('shares the docx and clears the flag on success', async () => {
    getToken.mockResolvedValue('t');
    (global.fetch as unknown as AnyMock).mockResolvedValue(ok(null));
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.exportDocx());
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/a.docx', expect.anything());
    expect(result.current.exporting).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('clears the flag without a request when there is no token', async () => {
    getToken.mockResolvedValue(null);
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.exportDocx());
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.exporting).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('alerts and clears the flag on an HTTP error', async () => {
    getToken.mockResolvedValue('t');
    (global.fetch as unknown as AnyMock).mockResolvedValue({ ...ok(null), ok: false, status: 400 });
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.exportDocx());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(result.current.exporting).toBeNull();
  });

  it('alerts and clears the flag when reading the token throws synchronously', async () => {
    getToken.mockImplementation(() => {
      throw new Error('keychain');
    });
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.exportDocx());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(result.current.exporting).toBeNull();
  });

  it('opens the created document', async () => {
    getToken.mockResolvedValue('t');
    (global.fetch as unknown as AnyMock).mockResolvedValue(ok({ documentId: 'd1' }));
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.openInDocs());
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(fullscreen)/doc-editor',
      params: { id: 'd1' },
    });
    expect(result.current.exporting).toBeNull();
  });

  it('stays silent and clears the flag when creating the document fails', async () => {
    getToken.mockResolvedValue('t');
    (global.fetch as unknown as AnyMock).mockResolvedValue({ ...ok(null), ok: false, status: 500 });
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.openInDocs());
    expect(mockPush).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.exporting).toBeNull();
  });

  it('opens the recipe editor with the answer as example and the AI draft', async () => {
    mockDraft.mockResolvedValue({
      status: 200,
      body: {
        spec: {
          title: 'Einladung',
          mention: 'einladung',
          description: 'Einladung zur Versammlung',
          iconKey: 'PiEnvelope',
          styleBlock: 'Förmlich.',
        },
      },
    });
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.saveAsRecipe());
    expect(mockBegin).toHaveBeenCalledWith(
      'neu',
      expect.objectContaining({ title: 'Einladung', rawExamples: 'Hallo' }),
      true
    );
    expect(mockPush).toHaveBeenCalledWith('/(focused)/grueneratoren/rezept-editor');
    expect(result.current.exporting).toBeNull();
  });

  it('still opens the editor with the answer when the draft fails', async () => {
    mockDraft.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useMessageActions(message));
    await act(() => result.current.saveAsRecipe());
    expect(mockBegin).toHaveBeenCalledWith(
      'neu',
      expect.objectContaining({ title: '', rawExamples: 'Hallo' }),
      true
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
