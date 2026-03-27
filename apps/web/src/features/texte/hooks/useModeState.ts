import { useState, useCallback, useRef } from 'react';

import { MODE_MAP, type ModeState, type ModeDefinition } from '../modes';

function getDefaultState(modeId: string, def?: ModeDefinition): ModeState {
  const resolved = def ?? MODE_MAP[modeId];
  if (!resolved) return {};

  const state: ModeState = { ...(resolved.defaults ?? {}) };

  resolved.settings?.forEach((s) => {
    if (!(s.key in state)) {
      state[s.key] = s.multiple ? [] : (s.options[0]?.id ?? '');
    }
  });

  resolved.extraFields?.forEach((f) => {
    if (!(f.key in state)) {
      state[f.key] = '';
    }
  });

  resolved.tagInputs?.forEach((t) => {
    if (!(t.key in state)) {
      state[t.key] = [];
    }
  });

  return state;
}

export function useModeState(modeId: string, def?: ModeDefinition) {
  const [state, setState] = useState<ModeState>(() => getDefaultState(modeId, def));

  const prevMode = useRef(modeId);
  if (prevMode.current !== modeId) {
    prevMode.current = modeId;
    setState(getDefaultState(modeId, def));
  }

  const updateField = useCallback((key: string, value: string | string[]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { state, updateField, setState };
}
