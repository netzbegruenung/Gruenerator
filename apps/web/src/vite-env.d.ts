/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query'
import type { CSSProperties } from 'react'

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_BACKEND_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Umami analytics
interface UmamiTracker {
  track: (callback?: (props: Record<string, unknown>) => Record<string, unknown>) => void
}

declare global {
  interface Window {
    queryClient?: QueryClient
    umami?: UmamiTracker
    grantAnalyticsConsent?: () => void
    revokeAnalyticsConsent?: () => void
  }

  // Extend CSSProperties to allow CSS custom properties
  namespace React {
    interface CSSProperties {
      [key: `--${string}`]: string | number
    }
  }
}

export {}
