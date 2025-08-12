import { useOptimizedAuth } from '../../../hooks/useAuth';

/**
 * Custom hook for handling authentication requirements in components
 * @returns {Object} Authentication state for conditional rendering
 */
const useAuthRequired = () => {
  const { user, isAuthenticated, loading, isAuthResolved } = useOptimizedAuth();

  return {
    isAuthenticated: isAuthenticated && !!user,
    isLoading: !isAuthResolved || loading,
    user,
    shouldShowLoginRequired: isAuthResolved && (!isAuthenticated || !user)
  };
};

export default useAuthRequired;