import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './pages/HomePage';
import { EditPage } from './pages/EditPage';
import { DemoPage } from './pages/DemoPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SiteMediaPicker } from './components/media/SiteMediaPicker';
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
    </QueryClientProvider>
  );
}
