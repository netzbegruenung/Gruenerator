/// <reference types="vite/client" />

// Umami analytics
interface UmamiTracker {
  track: (callback?: (props: Record<string, unknown>) => Record<string, unknown>) => void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
    grantAnalyticsConsent?: () => void;
    revokeAnalyticsConsent?: () => void;
  }
}

export {};
