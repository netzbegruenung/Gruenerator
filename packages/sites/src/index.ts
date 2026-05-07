export { CandidatePage } from './CandidatePage';
export { HomePage } from './pages/HomePage';
export { LoginPage } from './pages/LoginPage';
export { DemoPage } from './pages/DemoPage';
export { EditPage } from './pages/EditPage';

export { SiteMediaPicker } from './components/media/SiteMediaPicker';
export { ProtectedRoute } from './components/auth/ProtectedRoute';
export { ErrorBoundary } from './components/common/ErrorBoundary';
export { ToastContainer } from './components/common/Toast';

export {
  SitesProvider,
  useSitesBasePath,
  useSitesActions,
  useAuth,
  type SitesContextValue,
  type SitesProviderProps,
} from './SitesContext';

export { default as sitesApiClient, setSitesUnauthorizedHandler } from './lib/apiClient';

export { useSite, type GeneratedSiteData, type AiGeneratedContent } from './hooks/useSite';
export { useToast } from './hooks/useToast';
export { useEmbedConsent } from './hooks/useEmbedConsent';
export { useLoadingProgress } from './hooks/useLoadingProgress';
export { useScrollSync } from './hooks/useScrollSync';
export { useSectionFocus } from './hooks/useSectionFocus';

export { useEditorStore } from './stores/editorStore';
export { useToastStore } from './stores/toastStore';
export { useConsentStore } from './stores/consentStore';
