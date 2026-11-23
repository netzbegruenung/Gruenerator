import { type StartLayout } from '@gruenerator/contracts';

import { useAuthStore } from '../stores/authStore';

/** How `/start` is laid out (Settings → Allgemein): one combined page (default), or tabs. */
export const useStartLayout = (): StartLayout =>
  useAuthStore((s) => s.user?.start_layout ?? 'combined');
