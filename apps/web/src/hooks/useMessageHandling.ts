import { useCallback } from 'react';

/**
 * Custom hook for standardized message handling
 * @param {Function} onSuccessMessage - Success message handler from parent
 * @param {Function} onErrorMessage - Error message handler from parent
 * @returns {Object} - Message handlers
 */
export const useMessageHandling = (onSuccessMessage, onErrorMessage) => {
    const clearMessages = useCallback(() => {
        onSuccessMessage('');
        onErrorMessage('');
    }, [onSuccessMessage, onErrorMessage]);

    const showSuccess = useCallback((message) => {
        onErrorMessage(''); // Clear error first
        onSuccessMessage(message);
    }, [onSuccessMessage, onErrorMessage]);

    const showError = useCallback((error) => {
        onSuccessMessage(''); // Clear success first
        const message = error instanceof Error ? error.message : error;
        onErrorMessage(message);
    }, [onSuccessMessage, onErrorMessage]);

    const handleAsyncAction = useCallback(async (action, successMessage = null, errorPrefix = 'Fehler') => {
        clearMessages();
        try {
            const result = await action();
            if (successMessage) {
                showSuccess(successMessage);
            }
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
            showError(`${errorPrefix}: ${errorMessage}`);
            throw error;
        }
    }, [clearMessages, showSuccess, showError]);

    return {
        clearMessages,
        showSuccess,
        showError,
        handleAsyncAction
    };
};