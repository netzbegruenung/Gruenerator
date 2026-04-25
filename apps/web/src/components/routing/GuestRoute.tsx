import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

const GuestRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);

  // Don't redirect during logout — store may momentarily show authenticated from stale cache
  if (isLoggingOut) return <Outlet />;

  return isAuthenticated ? <Navigate to="/workplace" replace /> : <Outlet />;
};

export default GuestRoute;
