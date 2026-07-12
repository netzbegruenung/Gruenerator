import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';

import { isWorkplaceTourDone } from './tourState';

import type { WorkplaceTab } from '../WorkplaceTabs';

// First-visit product tour: starts once on the chat tab for signed-in users.
// driver.js loads lazily so returning users never pay for it. On small
// screens the tour stays manual (account menu → "Tour starten").
export function useWorkplaceTourAutostart(tab: WorkplaceTab): void {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (tab !== 'chat' || !user || isWorkplaceTourDone()) return;
    if (window.innerWidth < 768) return;

    const timer = setTimeout(() => {
      void import('./workplaceTour').then((m) =>
        m.startWorkplaceTour((path) => void navigate(path))
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [tab, user, navigate]);
}
