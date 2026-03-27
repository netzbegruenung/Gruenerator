import { useCallback, useRef, useState } from 'react';

import apiClient from '../../../components/utils/apiClient';

export type ProtokollTyp = 'Sitzungsprotokoll' | 'Ergebnisprotokoll' | 'Verlaufsprotokoll';

interface ProtokollState {
  status: 'idle' | 'generating' | 'done' | 'error';
  result: string;
  error: string | null;
}

const INITIAL_STATE: ProtokollState = {
  status: 'idle',
  result: '',
  error: null,
};

export function useProtokoll() {
  const [state, setState] = useState<ProtokollState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const formatAsProtokoll = useCallback(async (inputText: string, protokollTyp: ProtokollTyp) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: 'generating', result: '', error: null });

    try {
      const response = await apiClient.post(
        '/voice/protokoll',
        { inputText, protokollTyp },
        { signal: controller.signal, timeout: 120000 }
      );

      const content = response.data?.content ?? response.data?.text ?? '';
      setState({ status: 'done', result: content, error: null });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        status: 'error',
        result: '',
        error: err instanceof Error ? err.message : 'Protokoll-Erstellung fehlgeschlagen',
      });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { state, formatAsProtokoll, reset };
}
