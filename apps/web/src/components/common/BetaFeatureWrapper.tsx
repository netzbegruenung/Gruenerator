import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useBetaFeatures } from '../../hooks/useBetaFeatures';
import { useOptimizedAuth } from '../../hooks/useAuth';

interface BetaFeatureWrapperProps {
  children: ReactNode;
  featureKey: string;
  fallbackPath?: string;
}

const BetaFeatureWrapper = ({ children, featureKey, fallbackPath = '/profile' }: BetaFeatureWrapperProps) => {
  const { user, isAuthenticated } = useOptimizedAuth();
  const { canAccessBetaFeature, isLoading } = useBetaFeatures();

  // Show loading state while checking authentication and beta features
  if (isLoading || (!isAuthenticated && user === undefined)) {
    return <div className="loading-spinner">Lädt...</div>;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user can access the beta feature
  if (!canAccessBetaFeature(featureKey)) {
    return <Navigate to={fallbackPath} replace />;
  }

  // User is authenticated and has access to the feature
  return children;
};

export default BetaFeatureWrapper;
