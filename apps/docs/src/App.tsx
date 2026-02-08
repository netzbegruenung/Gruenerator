import { DocsProvider, ErrorBoundary } from '@gruenerator/docs';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { webDocsAdapter } from './lib/docsAdapter';
import { EditorPage } from './pages/EditorPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

// Initialize API client (side-effect: sets up shared API client)
import './lib/apiClient';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <DocsProvider adapter={webDocsAdapter}>
          <BrowserRouter>
            <Routes>
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary showHomeLink>
                      <HomePage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/document/:id"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary showHomeLink>
                      <EditorPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route path="/login" element={<LoginPage />} />
            </Routes>
          </BrowserRouter>
        </DocsProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}

export default App;
