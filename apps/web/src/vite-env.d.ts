/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query';

// Extend Vite's ImportMetaEnv with custom environment variables
declare global {
  interface ImportMetaEnv {
    readonly VITE_BACKEND_URL: string;
    // Opt-in flag to expose the agent creator on a non-dev deploy.
    readonly VITE_SHOW_AGENT_CREATOR?: string;
    // Git commit the bundle was built from (set by the Docker image build).
    // Diagnostic logs stamp it so stale/mixed deployments are visible.
    readonly VITE_APP_COMMIT?: string;
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

declare module 'react-lazy-load-image-component' {
  import { type ComponentType } from 'react';
  export const LazyLoadImage: ComponentType<{
    src: string;
    alt?: string;
    effect?: string;
    className?: string;
    width?: number | string;
    height?: number | string;
    style?: React.CSSProperties;
    wrapperClassName?: string;
    placeholderSrc?: string;
    threshold?: number;
    onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  }>;
}

export {};
