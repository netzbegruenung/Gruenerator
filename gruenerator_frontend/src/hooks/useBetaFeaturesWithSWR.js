import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const fetchBetaFeatures = async (user) => {
  // 1) Direkt aus user_metadata, wenn vorhanden
  if (user?.user_metadata?.beta_features) {
    return user.user_metadata.beta_features;
  }

  // 2) Fallback: Backend API Abfrage (ersetzt direkte Supabase calls)
  try {
    if (!user?.id) return {};

    const response = await fetch(`${AUTH_BASE_URL}/api/auth/profile/beta-features`, {
      method: 'GET',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.warn('[useBetaFeaturesWithSWR] Backend fetch error:', response.status);
      return {};
    }

    const result = await response.json();
    return result.betaFeatures || {};
  } catch (err) {
    console.warn('[useBetaFeaturesWithSWR] Unexpected error:', err);
    return {};
  }
};

export const useBetaFeaturesWithSWR = (options = {}) => {
  const { user, betaFeatures } = useAuthStore();
  
  return useQuery({
    queryKey: ['betaFeatures', user?.id],
    queryFn: async () => {
      const features = await fetchBetaFeatures(user);
      // Cache to localStorage for immediate fallback
      try {
        localStorage.setItem('cached_beta_features', JSON.stringify(features));
      } catch (error) {
        console.warn('Failed to cache beta features:', error);
      }
      return features;
    },
    staleTime: options.immediate ? 0 : 5 * 60 * 1000,
    initialData: () => {
      // Use zustand state first, then localStorage fallback
      if (betaFeatures && Object.keys(betaFeatures).length > 0) {
        return betaFeatures;
      }
      try {
        const cached = localStorage.getItem('cached_beta_features');
        return cached ? JSON.parse(cached) : {};
      } catch {
        return {};
      }
    },
    enabled: !!user
  });
}; 