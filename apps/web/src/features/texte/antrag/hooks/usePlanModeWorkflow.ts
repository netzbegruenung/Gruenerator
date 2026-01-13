import { useState, useCallback } from 'react';
import apiClient from '../../../../components/utils/apiClient';
import type { Question } from '@/types/baseform';

interface GeneratedQuestion {
    id: string;
    questionText: string;
    questionType: 'multiple_choice' | 'free_text' | 'verstaendnis';
    options: string[];
    why?: string;
    clarificationPurpose?: string;
}

type PlanModeStatus =
    | 'idle'
    | 'generating_plan'
    | 'plan_generated'
    | 'answering_questions'
    | 'revising_plan'
    | 'generating_production'
    | 'completed'
    | 'error';

interface PlanModeState {
    workflowId: string | null;
    status: PlanModeStatus;
    plan: string | null;
    planSummary: string | null;
    questions: Question[] | null;
    revisedPlan: string | null;
    production: string | null;
    error: string | null;
}

interface InitiateRequestData {
    generatorType: 'antrag';
    inhalt: string;
    requestType?: string;
    useWebSearch?: boolean;
    usePrivacyMode?: boolean;
    selectedDocumentIds?: string[];
    selectedTextIds?: string[];
}

const mapBackendQuestions = (backendQuestions: GeneratedQuestion[]): Question[] =>
    backendQuestions.map(q => ({
        id: q.id,
        text: q.questionText,
        type: q.questionType === 'verstaendnis' ? 'multiple_choice' : q.questionType,
        questionFormat: 'multiple_choice' as const,
        options: q.options,
        allowCustom: true,
        allowMultiSelect: false
    }));

export const usePlanModeWorkflow = () => {
    const [state, setState] = useState<PlanModeState>({
        workflowId: null,
        status: 'idle',
        plan: null,
        planSummary: null,
        questions: null,
        revisedPlan: null,
        production: null,
        error: null
    });

    const initiatePlan = useCallback(async (requestData: InitiateRequestData) => {
        setState(prev => ({ ...prev, status: 'generating_plan', error: null }));

        try {
            const response = await apiClient.post('/plan-mode/initiate', requestData);

            if (response.data.success) {
                const mappedQuestions = response.data.questions
                    ? mapBackendQuestions(response.data.questions)
                    : null;

                const hasQuestions = response.data.needsQuestions && mappedQuestions && mappedQuestions.length > 0;

                setState(prev => ({
                    ...prev,
                    workflowId: response.data.workflow_id,
                    status: hasQuestions ? 'answering_questions' : 'plan_generated',
                    plan: response.data.plan,
                    planSummary: response.data.planSummary,
                    questions: hasQuestions ? mappedQuestions : null
                }));
                return response.data;
            } else {
                throw new Error(response.data.error || 'Plan-Generierung fehlgeschlagen');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Fehler beim Generieren des Plans';
            setState(prev => ({
                ...prev,
                status: 'error',
                error: errorMessage
            }));
            throw error;
        }
    }, []);

    const startAnswering = useCallback(() => {
        setState(prev => ({
            ...prev,
            status: 'answering_questions'
        }));
    }, []);

    const submitAnswers = useCallback(async (
        workflowId: string,
        answers: Record<string, string | string[]>
    ) => {
        setState(prev => ({ ...prev, status: 'revising_plan', error: null }));

        try {
            const response = await apiClient.post('/plan-mode/resume', {
                workflow_id: workflowId,
                answers
            });

            if (response.data.success) {
                const hasProduction = response.data.production_data?.content;

                setState(prev => ({
                    ...prev,
                    status: hasProduction ? 'completed' : 'plan_generated',
                    revisedPlan: response.data.revised_plan,
                    production: hasProduction ? response.data.production_data.content : null
                }));
                return response.data;
            } else {
                throw new Error(response.data.error || 'Plan-Revision fehlgeschlagen');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Fehler beim Verfeinern des Plans';
            setState(prev => ({
                ...prev,
                status: 'error',
                error: errorMessage
            }));
            throw error;
        }
    }, []);

    const generateProduction = useCallback(async (workflowId: string) => {
        setState(prev => ({ ...prev, status: 'generating_production', error: null }));

        try {
            const response = await apiClient.post('/plan-mode/generate-production', {
                workflow_id: workflowId
            });

            if (response.data.success) {
                setState(prev => ({
                    ...prev,
                    status: 'completed',
                    production: response.data.production_data?.content || ''
                }));
                return response.data;
            } else {
                throw new Error(response.data.error || 'Produktion fehlgeschlagen');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Fehler beim Generieren des Inhalts';
            setState(prev => ({
                ...prev,
                status: 'error',
                error: errorMessage
            }));
            throw error;
        }
    }, []);

    const reset = useCallback(() => {
        setState({
            workflowId: null,
            status: 'idle',
            plan: null,
            planSummary: null,
            questions: null,
            revisedPlan: null,
            production: null,
            error: null
        });
    }, []);

    const isLoading = ['generating_plan', 'revising_plan', 'generating_production'].includes(state.status);

    return {
        state,
        isLoading,
        initiatePlan,
        startAnswering,
        submitAnswers,
        generateProduction,
        reset
    };
};
