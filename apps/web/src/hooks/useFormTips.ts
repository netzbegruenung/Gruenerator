import { useMemo } from 'react';

/**
 * Hook to get contextual tips based on form state
 * @param {Object} conditions - Object with condition keys and their boolean values
 * @param {Object} tipConfig - Configuration mapping condition keys to tips
 * @returns {Object} Tips object with activeTip and hasTip
 *
 * @example
 * const { activeTip } = useFormTips(
 *   { hasPressemitteilung: true, hasSharepic: false },
 *   {
 *     hasPressemitteilung: { icon: '💡', text: 'Nenne wer zitiert werden soll' }
 *   }
 * );
 */
const useFormTips = (conditions = {}, tipConfig = {}) => {
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
    hasTip: !!activeTip
  };
};

export default useFormTips;
