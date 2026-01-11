/**
 * Custom hook for checking slug availability with debouncing
 *
 * Extracted from CreateCustomGeneratorPage.tsx (lines 120-167)
 * Encapsulates the slug checking logic to make it reusable and testable
 */

import { useState, useEffect } from 'react';
import apiClient from '../../../components/utils/apiClient';
import useDebounce from '../../../components/hooks/useDebounce';
import { SLUG_CHECK_DEBOUNCE_MS, MIN_SLUG_LENGTH } from '../constants/generatorConstants';

interface UseSlugAvailabilityOptions {
  slug: string;
  minLength?: number;
}

interface UseSlugAvailabilityResult {
  isChecking: boolean;
  error: string | null;
}

/**
 * Hook to check slug availability with debouncing
 *
 * @param options - Configuration options
 * @param options.slug - The slug to check
 * @param options.minLength - Minimum slug length before checking (default: MIN_SLUG_LENGTH)
 * @returns Object containing isChecking state and error message
 *
 * @example
 * const { isChecking, error } = useSlugAvailability({ slug: watchedSlug });
 */
export const useSlugAvailability = ({
  slug,
  minLength = MIN_SLUG_LENGTH
}: UseSlugAvailabilityOptions): UseSlugAvailabilityResult => {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedSlug = useDebounce(slug, SLUG_CHECK_DEBOUNCE_MS);

  useEffect(() => {
    const checkSlug = async () => {
      if (!debouncedSlug || debouncedSlug.length < minLength) {
        setError(null);
        setIsChecking(false);
        return;
      }

      setIsChecking(true);
      setError(null);

      try {
        const response = await apiClient.get(`/custom_generator/check-slug/${debouncedSlug}`);
        const data = response.data;

        if (data.exists) {
          setError('Diese URL ist bereits vergeben. Bitte wähle eine andere.');
        } else {
          setError(null);
        }
      } catch (err) {
        console.error('[useSlugAvailability] Slug check error:', err);
      } finally {
        setIsChecking(false);
      }
    };

    checkSlug();
  }, [debouncedSlug, minLength]);

  return { isChecking, error };
};
