import { useQuery } from '@tanstack/react-query';

import useDebounce from '../../../components/hooks/useDebounce';
import apiClient from '../../../components/utils/apiClient';
import { SLUG_CHECK_DEBOUNCE_MS, MIN_SLUG_LENGTH } from '../constants/generatorConstants';

interface UseSlugAvailabilityOptions {
  slug: string;
  minLength?: number;
}

interface UseSlugAvailabilityResult {
  isChecking: boolean;
  error: string | null;
}

export const useSlugAvailability = ({
  slug,
  minLength = MIN_SLUG_LENGTH,
}: UseSlugAvailabilityOptions): UseSlugAvailabilityResult => {
  const debouncedSlug = useDebounce(slug, SLUG_CHECK_DEBOUNCE_MS);
  const enabled = Boolean(debouncedSlug) && debouncedSlug.length >= minLength;

  const { data, isFetching } = useQuery<{ exists: boolean }, Error>({
    queryKey: ['slug-availability', debouncedSlug],
    queryFn: async () => {
      const response = await apiClient.get<{ exists: boolean }>(
        `/custom_generator/check-slug/${debouncedSlug}`
      );
      return response.data;
    },
    enabled,
    staleTime: 60_000,
  });

  return {
    isChecking: enabled && isFetching,
    error: data?.exists ? 'Diese URL ist bereits vergeben. Bitte wähle eine andere.' : null,
  };
};
