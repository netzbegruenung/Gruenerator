import { useState } from 'react';
import apiClient from '../components/utils/apiClient';

/**
 * Hook for managing interactive text generation flow
 *
 * Handles multi-step API calls:
 * 1. Initiate session - creates session and gets first questions
 * 2. Continue session - submits answers and gets follow-ups or final result
 * 3. Get status - retrieves current session state
 *
 * @param {Object} options - Configuration options
 * @param {string} options.generatorType - Type of generator (e.g., 'antrag', 'pressemitteilung')
 * @param {string} options.baseEndpoint - Base endpoint (default: '/antraege/experimental')
 */
const useInteractiveGenerator = ({
  generatorType,
  baseEndpoint = '/antraege/experimental'
} = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Initiate a new interactive session
   * @param {Object} params
   * @param {string} params.inhalt - Content/topic with all relevant details
   * @param {string} params.requestType - Request type (e.g., 'antrag', 'kleine_anfrage')
   * @param {string} params.locale - Locale (default: 'de-DE')
   * @returns {Promise<Object>} { sessionId, conversationState, questions, questionRound, metadata }
   */
  const initiateSession = async ({ inhalt, requestType, locale = 'de-DE' }) => {
    setLoading(true);
    setError(null);

    try {
      console.log(`[useInteractiveGenerator:${generatorType}] Initiating session:`, { requestType, baseEndpoint });

      const response = await apiClient.post(`${baseEndpoint}/initiate`, {
        inhalt,
        requestType,
        generatorType,
        locale
      });

      console.log(`[useInteractiveGenerator:${generatorType}] Session initiated:`, {
        sessionId: response.data.sessionId,
        questionCount: response.data.questions?.length,
        status: response.data.status
      });

      setLoading(false);
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error(`[useInteractiveGenerator:${generatorType}] Initiate error:`, errorMessage);
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
      console.log(`[useInteractiveGenerator:${generatorType}] Continuing session:`, {
        sessionId,
        answerCount: Object.keys(answers).length
      });

      const response = await apiClient.post(`${baseEndpoint}/continue`, {
        sessionId,
        answers
      });

      console.log(`[useInteractiveGenerator:${generatorType}] Session continued:`, {
        status: response.data.status,
        hasQuestions: !!response.data.questions,
        hasResult: !!response.data.finalResult
      });

      setLoading(false);
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error(`[useInteractiveGenerator:${generatorType}] Continue error:`, errorMessage);
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
      console.log(`[useInteractiveGenerator:${generatorType}] Getting session status:`, sessionId);

      const response = await apiClient.get(`${baseEndpoint}/status/${sessionId}`);

      console.log(`[useInteractiveGenerator:${generatorType}] Session status:`, {
        conversationState: response.data.session?.conversationState
      });

      return response.data.session;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error(`[useInteractiveGenerator:${generatorType}] Status error:`, errorMessage);
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

export default useInteractiveGenerator;
