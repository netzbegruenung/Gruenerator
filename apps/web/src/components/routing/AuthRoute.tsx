import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

const AuthRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(currentPath)}`} replace />;
  }

  return <Outlet />;
};

export default AuthRoute;
