import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { DocsProvider, ErrorBoundary } from '@gruenerator/docs';
import { capacitorDocsAdapter } from './lib/capacitorDocsAdapter';
import {
  initCapacitorAuth,
  cleanupCapacitorAuth,
  type DocsCapacitorUser,
} from './auth/capacitorAuth';
import { HomePage } from './pages/HomePage';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';

function App() {
  const [user, setUser] = useState<DocsCapacitorUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    initCapacitorAuth(
      (authedUser) => {
        setUser(authedUser);
        setAuthError(null);
        setIsLoading(false);
      },
      (error) => {
        console.error('[DocsApp] Auth error:', error);
        setAuthError(error);
        setIsLoading(false);
      }
    ).then(() => {
      // initCapacitorAuth restores sessions internally via restoreSession().
      // If no session was restored, onAuthSuccess was never called — stop loading.
      setIsLoading(false);
    });

    return () => cleanupCapacitorAuth();
  }, []);

  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}
      >
        Lädt...
      </div>
    );
  }

  return (
    <MantineProvider>
      <DocsProvider adapter={capacitorDocsAdapter}>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                user ? (
                  <ErrorBoundary>
                    <HomePage user={user} onLogout={() => setUser(null)} />
                  </ErrorBoundary>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/document/:id"
              element={
                user ? (
                  <ErrorBoundary>
                    <EditorPage user={user} />
                  </ErrorBoundary>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/login"
              element={
                user ? (
                  <Navigate to="/" replace />
                ) : (
                  <LoginPage onAuthSuccess={(u) => setUser(u)} authError={authError} />
                )
              }
            />
          </Routes>
        </BrowserRouter>
      </DocsProvider>
    </MantineProvider>
  );
}

export default App;
