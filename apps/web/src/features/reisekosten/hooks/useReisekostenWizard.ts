import { computeReisekosten, validateReisekosten } from '@gruenerator/shared/reisekosten';
import { useEffect, useMemo } from 'react';

import { useProfileStore } from '../../../stores/profileStore';
import { useReisekostenStore } from '../store';

/**
 * Binds the persisted wizard store, prefills name/email from the user profile
 * once, and derives the deterministic totals + client-side findings. Keeps the
 * page component declarative.
 */
export function useReisekostenWizard() {
  const store = useReisekostenStore();
  const profile = useProfileStore((s) => s.profile);
  const { state, setStammdaten } = store;

  useEffect(() => {
    if (!profile) return;
    const name =
      profile.display_name ||
      [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    if (name && !state.stammdaten.name) setStammdaten({ name });
    if (profile.email && !state.stammdaten.email) setStammdaten({ email: profile.email });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const computed = useMemo(() => computeReisekosten(state), [state]);
  const clientFindings = useMemo(() => validateReisekosten(state), [state]);

  return { ...store, computed, clientFindings };
}
