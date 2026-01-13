import { useEffect, useRef, useCallback } from 'react';
import { detectPlatformsInText } from '../utils/autocompleteUtils';
import useDebounce from '../components/hooks/useDebounce';

/**
 * usePlatformAutoDetect - Reusable hook for auto-detecting platforms from text content
 *
 * Features:
 * - Detects platform mentions in text (e.g., "Instagram", "insta", "fb")
 * - Respects user removals - won't re-add platforms the user explicitly removed
 * - Debounced to avoid excessive updates
 * - Only adds platforms, never removes
 *
 * @param {Object} options - Configuration options
 * @param {string} options.content - Text content to scan for platform mentions
 * @param {string[]} options.currentPlatforms - Currently selected platforms
 * @param {string[]} options.validPlatformIds - List of valid platform IDs to detect
 * @param {Function} options.onPlatformsDetected - Callback when new platforms should be added
 * @param {number} options.debounceMs - Debounce delay in ms (default: 500)
 * @param {boolean} options.enabled - Enable/disable detection (default: true)
 *
 * @returns {Object} { rejectedPlatforms, clearRejected, rejectPlatform }
 *
 * @example
 * const { clearRejected } = usePlatformAutoDetect({
 *   content: watchInhalt,
 *   currentPlatforms: watchPlatforms,
 *   validPlatformIds: platformOptions.map(p => p.id),
 *   onPlatformsDetected: (newPlatforms) => setValue('platforms', newPlatforms)
 * });
 */
interface PlatformAutoDetectOptions {
  content: string;
  currentPlatforms?: string[];
  validPlatformIds?: string[];
  onPlatformsDetected: (platforms: string[]) => void;
  debounceMs?: number;
  enabled?: boolean;
}

const usePlatformAutoDetect = ({
  content,
  currentPlatforms = [],
  validPlatformIds = [],
  onPlatformsDetected,
  debounceMs = 500,
  enabled = true
}: PlatformAutoDetectOptions) => {
  const rejectedPlatformsRef = useRef(new Set());
  const previousPlatformsRef = useRef(currentPlatforms);

  const debouncedContent = useDebounce(content, debounceMs);

  useEffect(() => {
    const prevPlatforms = previousPlatformsRef.current || [];
    const currPlatforms = currentPlatforms || [];

    const removed = prevPlatforms.filter(p => !currPlatforms.includes(p));

    removed.forEach(platform => {
      rejectedPlatformsRef.current.add(platform);
    });

    previousPlatformsRef.current = currPlatforms;
  }, [currentPlatforms]);

  useEffect(() => {
    if (!enabled || !debouncedContent || !onPlatformsDetected) return;

    const detectedPlatforms = detectPlatformsInText(debouncedContent);
    const validDetected = detectedPlatforms.filter(p => validPlatformIds.includes(p));

    const notRejected = validDetected.filter(p => !rejectedPlatformsRef.current.has(p));

    if (notRejected.length > 0) {
      const currPlatforms = currentPlatforms || [];
      const newPlatforms = [...new Set([...currPlatforms, ...notRejected])];

      if (newPlatforms.length !== currPlatforms.length) {
        onPlatformsDetected(newPlatforms);
      }
    }
  }, [debouncedContent, validPlatformIds, currentPlatforms, onPlatformsDetected, enabled]);

  const clearRejected = useCallback(() => {
    rejectedPlatformsRef.current.clear();
  }, []);

  const rejectPlatform = useCallback((platformId: string) => {
    rejectedPlatformsRef.current.add(platformId);
  }, []);

  const isRejected = useCallback((platformId: string) => {
    return rejectedPlatformsRef.current.has(platformId);
  }, []);

  return {
    rejectedPlatforms: Array.from(rejectedPlatformsRef.current),
    clearRejected,
    rejectPlatform,
    isRejected
  };
};

export default usePlatformAutoDetect;
