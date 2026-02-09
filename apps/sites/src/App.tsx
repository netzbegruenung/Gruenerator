import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';

import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/Toast';
import { SiteMediaPicker } from './components/media/SiteMediaPicker';
import { DemoPage } from './pages/DemoPage';
import { EditPage } from './pages/EditPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
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
      window.umami.track((props) => ({
        ...props,
        url: window.location.href,
        title: document.title,
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
            <Route path="/login" element={<LoginPage />} />
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
