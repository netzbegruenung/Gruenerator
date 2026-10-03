/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query';

// Extend Vite's ImportMetaEnv with custom environment variables
declare global {
  interface ImportMetaEnv {
    readonly VITE_BACKEND_URL: string;
    // Opt-in flag to expose the agent creator on a non-dev deploy.
    readonly VITE_SHOW_AGENT_CREATOR?: string;
  }

  // Umami analytics
  interface UmamiTracker {
    track: (callback?: (props: Record<string, unknown>) => Record<string, unknown>) => void;
  }

  interface Window {
    queryClient?: QueryClient;
    umami?: UmamiTracker;
    grantAnalyticsConsent?: () => void;
    revokeAnalyticsConsent?: () => void;
  }

  // Extend CSSProperties to allow CSS custom properties
  namespace React {
    interface CSSProperties {
      [key: `--${string}`]: string | number;
    }
  }
}

export {};
