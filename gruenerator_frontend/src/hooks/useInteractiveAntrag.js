import { useState } from 'react';
import apiClient from '../components/utils/apiClient';

/**
 * Hook for managing interactive Antrag/Anfrage generation flow
 *
 * Handles multi-step API calls:
 * 1. Initiate session - creates session and gets first questions
 * 2. Continue session - submits answers and gets follow-ups or final result
 * 3. Get status - retrieves current session state
 *
 * @param {Object} options - Configuration options
 * @param {string} options.baseEndpoint - Base endpoint (default: '/antraege/experimental')
 */
const useInteractiveAntrag = ({ baseEndpoint = '/antraege/experimental' } = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Initiate a new interactive session
   * @param {Object} params
   * @param {string} params.thema - Main topic/theme
   * @param {string} params.details - Additional details
   * @param {string} params.requestType - Request type (e.g., 'antrag', 'Dreizeilen', etc.)
   * @param {string} params.locale - Locale (default: 'de-DE')
   * @returns {Promise<Object>} { sessionId, conversationState, questions, questionRound, metadata }
   */
  const initiateSession = async ({ thema, details, requestType, locale = 'de-DE' }) => {
    setLoading(true);
    setError(null);

    try {
      console.log('[useInteractiveAntrag] Initiating session:', { thema, requestType, baseEndpoint });

      const response = await apiClient.post(`${baseEndpoint}/initiate`, {
        thema,
        details,
        requestType,
        locale
      });

      console.log('[useInteractiveAntrag] Session initiated:', {
        sessionId: response.data.sessionId,
        questionCount: response.data.questions?.length
      });

      setLoading(false);
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error('[useInteractiveAntrag] Initiate error:', errorMessage);
      setLoading(false);
      setError(errorMessage);
      throw err;
    }
  };

  /**
   * Continue an existing session by submitting answers
   * @param {string} sessionId - Session ID
   * @param {Object} answers - User answers keyed by question ID
   * @returns {Promise<Object>} { status: 'follow_up' | 'completed', questions?, finalResult?, metadata? }
   */
  const continueSession = async (sessionId, answers) => {
    setLoading(true);
    setError(null);

    try {
      console.log('[useInteractiveAntrag] Continuing session:', {
        sessionId,
        answerCount: Object.keys(answers).length
      });

      const response = await apiClient.post(`${baseEndpoint}/continue`, {
        sessionId,
        answers
      });

      console.log('[useInteractiveAntrag] Session continued:', {
        status: response.data.status,
        hasQuestions: !!response.data.questions,
        hasResult: !!response.data.finalResult
      });

      setLoading(false);
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error('[useInteractiveAntrag] Continue error:', errorMessage);
      setLoading(false);
      setError(errorMessage);
      throw err;
    }
  };

  /**
   * Get the current status of a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session data
   */
  const getSessionStatus = async (sessionId) => {
    try {
      console.log('[useInteractiveAntrag] Getting session status:', sessionId);

      const response = await apiClient.get(`${baseEndpoint}/status/${sessionId}`);

      console.log('[useInteractiveAntrag] Session status:', {
        conversationState: response.data.session?.conversationState
      });

      return response.data.session;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error('[useInteractiveAntrag] Status error:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  };

  /**
   * Reset error state
   */
  const clearError = () => {
    setError(null);
  };

  return {
    initiateSession,
    continueSession,
    getSessionStatus,
    loading,
    error,
    clearError
  };
};

export default useInteractiveAntrag;
