import { useMemo } from 'react';

interface Tip {
  icon: string;
  text: string;
}

interface TipWithKey extends Tip {
  key: string;
}

interface TipConfig {
  [key: string]: Tip;
}

interface Conditions {
  [key: string]: boolean;
}

interface UseFormTipsResult {
  activeTip: TipWithKey | null;
  hasTip: boolean;
}

const useFormTips = (conditions: Conditions = {}, tipConfig: TipConfig = {}): UseFormTipsResult => {
  const activeTip = useMemo(() => {
    const activeKeys = Object.entries(conditions)
      .filter(([, value]) => value)
      .map(([key]) => key);

    for (const key of activeKeys) {
      if (tipConfig[key]) {
        return { key, ...tipConfig[key] };
      }
    }

    return null;
  }, [conditions, tipConfig]);

  return {
    activeTip,
    hasTip: !!activeTip,
  };
};

export default useFormTips;
