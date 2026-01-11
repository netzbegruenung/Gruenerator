/**
 * Hook for AI-powered subtitle correction
 *
 * Sends subtitle segments to the backend for grammar/spelling/punctuation corrections.
 * Now uses generic useApiAction hook with full type safety.
 *
 * Reduced from ~40 lines to ~20 lines by eliminating duplicate pattern.
 */

import { useApiAction } from './useApiAction';
import type { SubtitleSegment, CorrectionResponse } from '../types';
import { isCorrectionResponse } from '../utils/validators';

interface CorrectSubtitlesRequest {
  segments: SubtitleSegment[];
}

/**
 * Hook for correcting subtitles with AI
 *
 * @example
 * ```typescript
 * const { data: corrections, loading, error, execute: correctSubtitles } = useSubtitleCorrection();
 *
 * const result = await correctSubtitles(segments);
 * if (result.hasCorrections) {
 *   // Apply corrections
 * }
 * ```
 */
export const useSubtitleCorrection = () => {
  const { data, loading, error, success, execute, clearData, reset } = useApiAction<
    CorrectSubtitlesRequest,
    CorrectionResponse
  >({
    endpoint: '/subtitler/correct-subtitles',
    transformResponse: (response) => {
      // Validate response structure before returning
      if (!isCorrectionResponse(response)) {
        console.error('[useSubtitleCorrection] Invalid response format:', response);
        throw new Error('Invalid correction response format');
      }
      return response;
    }
  });

  /**
   * Execute correction with clean API
   */
  const correctSubtitles = async (segments: SubtitleSegment[]): Promise<CorrectionResponse> => {
    return execute({ segments });
  };

  return {
    // Renamed for consistency with old API
    corrections: data,
    loading,
    error,
    success,
    correctSubtitles,
    clearCorrections: clearData,
    reset
  };
};

export default useSubtitleCorrection;
