import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './pages/HomePage';
import { EditPage } from './pages/EditPage';
import { DemoPage } from './pages/DemoPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SiteMediaPicker } from './components/media/SiteMediaPicker';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/Toast';
import { reportError } from './utils/errorReporter';
import './styles/index.css';
import './lib/apiClient';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

// Umami SPA Page View Tracking
const RouteLogger = () => {
  const location = useLocation();
  useEffect(() => {
    if (window.umami) {
      window.umami.track(props => ({
        ...props,
        url: window.location.href,
        title: document.title
      }));
    }
  }, [location]);
  return null;
};

export function App() {
  return (
    <ErrorBoundary onError={(error, errorInfo) => reportError(error, { errorInfo })}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <RouteLogger />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route
              path="/edit"
              element={
                <ProtectedRoute>
                  <EditPage />
                </ProtectedRoute>
              }
            />
          </Routes>
          <SiteMediaPicker />
        </BrowserRouter>
        <ToastContainer />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
