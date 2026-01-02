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

// Matomo analytics tracking array
type MatomoCommand = ['setCustomUrl' | 'setDocumentTitle' | 'trackPageView', ...unknown[]]

declare global {
  interface Window {
    queryClient?: QueryClient
    _paq?: MatomoCommand[]
    grantMatomoConsent?: () => void
  }

  // Extend CSSProperties to allow CSS custom properties
  namespace React {
    interface CSSProperties {
      [key: `--${string}`]: string | number
    }
  }
}

export {}
