/**
 * Plan Mode Workflow - Main Container
 * Orchestrates all 5 phases of Plan Mode:
 * 1. Plan Display
 * 2. Questions (optional)
 * 3. Revised Plan Display (if questions were answered)
 * 4. Approval & Platform Selection
 * 5. Production Generation
 */

import React, { useState, useEffect } from 'react';
import DisplaySection from '../Form/BaseForm/DisplaySection';
import PlanQuestions from './PlanQuestions';
import PlanApproval from './PlanApproval';
import PlanProgress from './PlanProgress';
import apiClient from '../../../components/utils/apiClient';
import '../../../assets/styles/components/plan-mode.css';

export interface PlanModeWorkflowProps {
  generatorType: 'pr' | 'antrag';
  formData: Record<string, any>;
  onComplete: (result: any) => void;
  enablePlatformSelection?: boolean;
  availablePlatforms?: Array<{ value: string; label: string; emoji: string }>;
}

type Phase = 'idle' | 'plan' | 'questions' | 'revised' | 'approval' | 'generating' | 'completed';

export interface PlanData {
  plan: string;
  planSummary: string;
  needsQuestions: boolean;
  questions?: any[];
  workflowId: string;
  metadata?: any;
}

const PlanModeWorkflow: React.FC<PlanModeWorkflowProps> = ({
  generatorType,
  formData,
  onComplete,
  enablePlatformSelection = false,
  availablePlatforms = []
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [revisedPlan, setRevisedPlan] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 1: Generate initial plan
  useEffect(() => {
    if (phase === 'idle') {
      initiatePlanMode();
    }
  }, [phase]);

  const initiatePlanMode = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/plan-mode/initiate', {
        generatorType,
        ...formData
      });

      const data = response.data;
      setPlanData({
        plan: data.plan,
        planSummary: data.planSummary,
        needsQuestions: data.needsQuestions,
        questions: data.questions,
        workflowId: data.workflow_id,
        metadata: data.metadata
      });
      setWorkflowId(data.workflow_id);

      // Decide next phase
      if (data.needsQuestions && data.questions?.length > 0) {
        setPhase('plan'); // Show plan first, then questions
      } else {
        setPhase('approval'); // Skip directly to approval
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate plan');
      console.error('[PlanMode] Initiate error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Phase 2 → 3: Answer questions and get revised plan
  const handleQuestionsSubmit = async () => {
    if (!workflowId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/plan-mode/answer-questions', {
        workflow_id: workflowId,
        answers
      });

      setRevisedPlan(response.data.revised_plan);
      setPhase('revised');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revise plan');
      console.error('[PlanMode] Answer questions error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Phase 4: Approve plan and configure production
  const handleApprove = async (approvalConfig: any) => {
    if (!workflowId) return;

    setLoading(true);
    setError(null);

    try {
      // Save approval
      await apiClient.post('/plan-mode/approve', {
        workflow_id: workflowId,
        approval_config: approvalConfig
      });

      // Generate production immediately
      setPhase('generating');

      const productionResponse = await apiClient.post('/plan-mode/generate-production', {
        workflow_id: workflowId
      });

      setPhase('completed');
      onComplete(productionResponse.data.production_data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate content');
      console.error('[PlanMode] Production error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanContinue = () => {
    if (planData?.needsQuestions) {
      setPhase('questions');
    } else {
      setPhase('approval');
    }
  };

  const handleRevisedPlanContinue = () => {
    setPhase('approval');
  };

  const handleAnswerChange = (questionId: string, value: string | string[]) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  // Render loading state
  if (loading && phase === 'idle') {
    return (
      <div className="plan-mode-workflow">
        <div className="plan-mode-loading">
          <div className="loading-spinner"></div>
          <p>Erstelle strategischen Plan...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="plan-mode-workflow">
        <div className="plan-mode-error">
          <h3>❌ Fehler</h3>
          <p>{error}</p>
          <button onClick={() => setPhase('idle')} className="btn-primary">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-mode-workflow">
      <PlanProgress
        currentPhase={phase}
        hasQuestions={planData?.needsQuestions || false}
        hasRevision={!!revisedPlan}
      />

      {phase === 'plan' && planData && (
        <>
          <div className="quiz-progress-header">
            <span className="quiz-progress-text">📋 Strategischer Plan</span>
          </div>
          <div className="question-round-indicator">{planData.planSummary}</div>

          <DisplaySection
            title="Strategischer Plan"
            value={planData.plan}
            useMarkdown={true}
            componentName="plan-display"
            showEditModeToggle={false}
            showUndoControls={false}
            showRedoControls={false}
            renderActions={() => null}
          />

          {planData.metadata && (
            <div className="plan-metadata">
              {planData.metadata.enrichmentMetadata?.documentCount > 0 && (
                <span className="metadata-badge">
                  📄 {planData.metadata.enrichmentMetadata.documentCount} Dokumente
                </span>
              )}
              {planData.metadata.enrichmentMetadata?.webSearchResultCount > 0 && (
                <span className="metadata-badge">
                  🌐 {planData.metadata.enrichmentMetadata.webSearchResultCount} Web-Quellen
                </span>
              )}
              {planData.metadata.enrichmentMetadata?.knowledgeSourceCount > 0 && (
                <span className="metadata-badge">
                  💡 {planData.metadata.enrichmentMetadata.knowledgeSourceCount} Wissensdatenbank
                </span>
              )}
            </div>
          )}

          <div className="quiz-navigation">
            <div className="quiz-completion-hint">
              <span className="quiz-ready-text">✅ Plan bereit</span>
            </div>
            <button onClick={handlePlanContinue} disabled={loading} className="btn-primary">
              {loading ? 'Lädt...' : 'Weiter'}
            </button>
          </div>
        </>
      )}

      {phase === 'questions' && planData?.questions && (
        <PlanQuestions
          questions={planData.questions}
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onSubmit={handleQuestionsSubmit}
          loading={loading}
        />
      )}

      {phase === 'revised' && revisedPlan && (
        <>
          <div className="quiz-progress-header">
            <span className="quiz-progress-text">📝 Überarbeiteter Plan</span>
          </div>
          <div className="question-round-indicator">Überarbeiteter Plan basierend auf deinen Antworten</div>

          <DisplaySection
            title="Überarbeiteter Plan"
            value={revisedPlan}
            useMarkdown={true}
            componentName="plan-display-revised"
            showEditModeToggle={false}
            showUndoControls={false}
            showRedoControls={false}
            renderActions={() => null}
          />

          <div className="quiz-navigation">
            <div className="quiz-completion-hint">
              <span className="quiz-ready-text">✅ Plan bereit</span>
            </div>
            <button onClick={handleRevisedPlanContinue} disabled={loading} className="btn-primary">
              {loading ? 'Lädt...' : 'Weiter'}
            </button>
          </div>
        </>
      )}

      {phase === 'approval' && (
        <PlanApproval
          plan={revisedPlan || planData?.plan || ''}
          generatorType={generatorType}
          enablePlatformSelection={enablePlatformSelection}
          availablePlatforms={availablePlatforms}
          onApprove={handleApprove}
          loading={loading}
        />
      )}

      {phase === 'generating' && (
        <div className="plan-mode-generating">
          <div className="loading-spinner"></div>
          <h3>Generiere finalen Content...</h3>
          <p>Der genehmigte Plan wird jetzt in finalen Content umgesetzt.</p>
        </div>
      )}
    </div>
  );
};

export default PlanModeWorkflow;
