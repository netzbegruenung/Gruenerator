import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';

const GuestRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/desk" replace /> : <Outlet />;
};

export default GuestRoute;
