import { type ProtokollResponse, type ProtokollTyp } from '@gruenerator/contracts';
import { useCallback, useRef, useState } from 'react';

import apiClient from '../../../components/utils/apiClient';

// The union lives in the contract's z.enum; re-exported so feature code keeps a
// local import path without restating the values.
export type { ProtokollTyp };

interface ProtokollState {
  status: 'idle' | 'generating' | 'done' | 'error';
  result: string;
  /** Which type produced `result` — names the Protokoll in the view toggle and the export title. */
  typ: ProtokollTyp | null;
  error: string | null;
}

const INITIAL_STATE: ProtokollState = {
  status: 'idle',
  result: '',
  typ: null,
  error: null,
};

export function useProtokoll() {
  const [state, setState] = useState<ProtokollState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const formatAsProtokoll = useCallback(async (inputText: string, protokollTyp: ProtokollTyp) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: 'generating', result: '', typ: protokollTyp, error: null });

    try {
      const response = await apiClient.post<ProtokollResponse & { text?: string }>(
        '/voice/protokoll',
        { inputText, protokollTyp },
        { signal: controller.signal, timeout: 120000 }
      );

      const content = response.data?.content ?? response.data?.text ?? '';
      setState({ status: 'done', result: content, typ: protokollTyp, error: null });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        status: 'error',
        result: '',
        typ: null,
        error: err instanceof Error ? err.message : 'Protokoll-Erstellung fehlgeschlagen',
      });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  /** Put a persisted Protokoll back on screen without re-generating it. */
  const restore = useCallback((result: string, typ: ProtokollTyp) => {
    abortRef.current?.abort();
    setState({ status: 'done', result, typ, error: null });
  }, []);

  return { state, formatAsProtokoll, reset, restore };
}
