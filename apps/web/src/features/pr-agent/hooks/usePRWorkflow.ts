import { useState, useCallback } from 'react';
import apiClient from '../../../components/utils/apiClient';

interface PRWorkflowState {
    workflowId: string | null;
    status: 'idle' | 'generating_strategy' | 'awaiting_approval' | 'generating_production' | 'completed' | 'error';
    // Backend returns pre-formatted markdown content string, not structured strategy object
    strategy: string | null;
    production: any | null;
    error: string | null;
}

export const usePRWorkflow = () => {
    const [state, setState] = useState<PRWorkflowState>({
        workflowId: null,
        status: 'idle',
        strategy: null,
        production: null,
        error: null
    });

    /**
     * Phase 1: Generate strategy
     */
    const generateStrategy = useCallback(async (requestData: {
        inhalt: string;
        useWebSearchTool?: boolean;
        selectedDocumentIds?: string[];
        selectedTextIds?: string[];
    }) => {
        setState(prev => ({ ...prev, status: 'generating_strategy', error: null }));

        try {
            const response = await apiClient.post('/claude_social/strategy', requestData);

            if (response.data.success) {
                setState(prev => ({
                    ...prev,
                    workflowId: response.data.workflow_id,
                    status: 'awaiting_approval',
                    // Backend returns pre-formatted markdown in 'content' field
                    strategy: response.data.content
                }));
                return response.data;
            } else {
                throw new Error(response.data.error || 'Strategie-Generierung fehlgeschlagen');
            }
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                status: 'error',
                error: error.message || 'Fehler beim Generieren der Strategie'
            }));
            throw error;
        }
    }, []);

    /**
     * Phase 2: Generate production content
     */
    const generateProduction = useCallback(async (
        workflowId: string,
        approvedPlatforms: string[],
        userFeedback?: string
    ) => {
        setState(prev => ({ ...prev, status: 'generating_production', error: null }));

        try {
            const response = await apiClient.post('/claude_social/production', {
                workflow_id: workflowId,
                approved_platforms: approvedPlatforms,
                user_feedback: userFeedback
            });

            if (response.data.success) {
                setState(prev => ({
                    ...prev,
                    status: 'completed',
                    production: response.data
                }));
                return response.data;
            } else {
                throw new Error(response.data.error || 'Produktion fehlgeschlagen');
            }
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                status: 'error',
                error: error.message || 'Fehler beim Generieren der Inhalte'
            }));
            throw error;
        }
    }, []);

    /**
     * Reset workflow
     */
    const reset = useCallback(() => {
        setState({
            workflowId: null,
            status: 'idle',
            strategy: null,
            production: null,
            error: null
        });
    }, []);

    return {
        state,
        generateStrategy,
        generateProduction,
        reset
    };
};
