import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient';

const fetchBetaFeatures = async (user) => {
  // 1) Direkt aus user_metadata, wenn vorhanden
  if (user?.user_metadata?.beta_features) {
    return user.user_metadata.beta_features;
  }

  // 2) Fallback: Supabase Abfrage
  try {
    if (!user?.id || !templatesSupabase) return {};

    const { data, error } = await templatesSupabase
      .schema('auth')
      .from('users')
      .select('raw_user_meta_data')
      .eq('id', user.id)
      .single();

    if (error) {
      console.warn('[useBetaFeaturesWithSWR] Supabase fetch error:', error.message);
      return {};
    }

    return data?.raw_user_meta_data?.beta_features || {};
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