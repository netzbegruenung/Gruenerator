import { enrichRequest } from '../../../utils/requestEnrichment.js';
import { sendSuccessResponse } from '../../../utils/request/index.js';
import { generateSharepicForChat, type ExpressRequest, type SharepicResult } from '../../../services/chat/sharepicGenerationService.js';
import { generateStrategicFraming } from './generators/framingGenerator.js';
import { generatePlatformContent } from './generators/platformGenerator.js';
import { generateRiskAnalysis } from './generators/riskGenerator.js';
import { generateVisualBriefing } from './generators/visualGenerator.js';
import { searchArgumentsFromNotebooks } from './generators/argumentsGenerator.js';
import { summarizeArguments } from './generators/argumentsSummarizer.js';
import { formatPRAgentResponse, formatStrategyApprovalResponse } from './utils/responseFormatter.js';
import type { PRAgentRequest } from './types.js';
import { getGenerationStatsService } from '../../../database/services/GenerationStatsService/index.js';
import { prAgentWorkflow } from '../../../services/WorkflowService/index.js';

/**
 * PR Agent Main Orchestrator
 * Generates complete PR package: Framing, Press, Social, Sharepics, Risk, Visual
 * Executes in parallel for optimal performance (30-35s total)
 */
export async function processAutomatischPR(
  requestData: PRAgentRequest,
  req: any,
  res: any
): Promise<void> {
  const startTime = Date.now();
  console.log('[PR Agent] Starting automatic PR package generation');

  try {
    const request = requestData as PRAgentRequest;

    const enrichedState = await enrichRequest(requestData, {
      type: 'social',
      enableUrls: true,
      enableWebSearch: request.useWebSearchTool || false,
      enableDocQnA: true,
      webSearchQuery: `${request.inhalt} Bündnis 90/Die Grünen aktuell`,
      systemRole: '',
      selectedDocumentIds: request.selectedDocumentIds || [],
      searchQuery: request.inhalt,
      useAutomaticSearch: true,
      req
    });

    const framingPromise = generateStrategicFraming(enrichedState, req);

    const socialPlatforms = ['instagram', 'facebook'];
    const socialPromises = socialPlatforms.map(platform =>
      generatePlatformContent(platform, enrichedState, req)
    );
    const pressPromise = generatePlatformContent('pressemitteilung', enrichedState, req);

    const sharepicPromises = Array.from({ length: 3 }, (_, i) =>
      generateSharepicForChat(req as ExpressRequest, 'dreizeilen', {
        text: request.inhalt,
        subject: `Sharepic ${i + 1}`
      }).catch(err => {
        console.error(`[PR Agent] Sharepic ${i + 1} generation failed:`, err);
        return null;
      })
    );

    const [framing, ...results] = await Promise.all([
      framingPromise,
      ...socialPromises,
      pressPromise,
      ...sharepicPromises
    ]);

    const [instagramPost, facebookPost, pressRelease, ...sharepicResults] = results;
    const socialContent = {
      instagram: instagramPost as string,
      facebook: facebookPost as string
    };

    const sharepics = (sharepicResults.filter(Boolean) as SharepicResult[]).map(result => ({
      image: result.content.sharepic.image,
      type: result.content.sharepic.type,
      text: result.content.sharepic.text,
      mainSlogan: result.content.sharepic.mainSlogan
    }));

    const [riskAnalysis, visualBriefing] = await Promise.all([
      generateRiskAnalysis(enrichedState, framing, socialContent, pressRelease as string, req),
      generateVisualBriefing(enrichedState, framing, socialContent, req)
    ]);

    const formattedResult = formatPRAgentResponse({
      framing,
      pressRelease: pressRelease as string,
      social: socialContent,
      sharepics,
      riskAnalysis,
      visualBriefing,
      metadata: {
        ...enrichedState.enrichmentMetadata,
        executionTimeMs: Date.now() - startTime,
        parallelGroups: 3,
        totalAICalls: 6,
        sharepicsGenerated: sharepics.length,
        examplesUsed: enrichedState.enrichmentMetadata?.examplesUsed || enrichedState.examples || []
      }
    });

    try {
      const generationStatsService = getGenerationStatsService();
      await generationStatsService.logGeneration({
        userId: req.user?.id || null,
        generationType: 'pr-agent',
        platform: 'automatisch',
        tokensUsed: null,
        success: true
      });
    } catch (err) {
      console.warn('[PR Agent] Stats logging failed (non-critical):', err);
    }

    sendSuccessResponse(
      res,
      formattedResult,
      '/claude_social',
      requestData,
      enrichedState.enrichmentMetadata || {}
    );

  } catch (error) {
    console.error('[PR Agent] Fatal error:', error);
    res.status(500).json({
      success: false,
      error: 'PR-Paket konnte nicht generiert werden. Bitte versuchen Sie es erneut.'
    });
  }
}

/**
 * PHASE 1: Generate strategy + research arguments
 * Returns workflow_id for user approval
 */
export async function processStrategyGeneration(
  requestData: PRAgentRequest,
  req: any,
  res: any
): Promise<void> {
  const startTime = Date.now();
  console.log('[PR Agent] Phase 1: Strategy generation');

  try {
    // 1. Create workflow record
    const workflowId = await prAgentWorkflow.create(
      req.user?.id || 'anonymous',
      requestData
    );

    // 2. Enrich request (documents, URLs, web search)
    const enrichedState = await enrichRequest(requestData, {
      type: 'social',
      enableUrls: true,
      enableWebSearch: requestData.useWebSearchTool || false,
      enableDocQnA: true,
      webSearchQuery: `${requestData.inhalt} Bündnis 90/Die Grünen aktuell`,
      systemRole: '',
      selectedDocumentIds: requestData.selectedDocumentIds || [],
      searchQuery: requestData.inhalt,
      useAutomaticSearch: true,
      req
    });

    // 3. PARALLEL: Generate framing + search arguments
    const [framing, args] = await Promise.all([
      generateStrategicFraming(enrichedState, req),
      searchArgumentsFromNotebooks(requestData.inhalt, {
        limit: 10,
        threshold: 0.35
      })
    ]);

    // 4. Generate AI summary of arguments (using Mistral Small)
    const argumentsSummary = args.length > 0
      ? await summarizeArguments(requestData.inhalt, args)
      : null;

    const executionTimeMs = Date.now() - startTime;

    // 5. Save strategy to Redis
    await prAgentWorkflow.saveStrategy(
      workflowId,
      framing,
      args,
      enrichedState.enrichmentMetadata || {},
      executionTimeMs
    );

    // 6. Format strategy as markdown for display
    const formattedContent = formatStrategyApprovalResponse(
      framing,
      argumentsSummary,
      args.slice(0, 5),  // Top 5 for display
      requestData.inhalt,
      {
        documentsCount: enrichedState.enrichmentMetadata?.totalDocuments || 0,
        webSourcesCount: enrichedState.enrichmentMetadata?.webSearchSources?.length || 0,
        executionTimeMs,
        argumentsFound: args.length,
        enrichmentMetadata: enrichedState.enrichmentMetadata  // Pass full metadata for bibliography
      }
    );

    // 7. Return formatted content for user approval
    res.json({
      success: true,
      workflow_id: workflowId,
      status: 'awaiting_approval',
      content: formattedContent,  // Pre-formatted markdown
      metadata: {
        execution_time_ms: executionTimeMs,
        arguments_found: args.length
      }
    });

  } catch (error) {
    console.error('[PR Agent] Phase 1 failed:', error);
    res.status(500).json({
      success: false,
      error: 'Strategie konnte nicht generiert werden. Bitte versuchen Sie es erneut.'
    });
  }
}

/**
 * PHASE 2: Generate production content based on approved strategy
 * Requires workflow_id and approved_platforms
 */
export async function processProductionGeneration(
  workflowId: string,
  approvedPlatforms: string[],
  userFeedback: string | null,
  req: any,
  res: any
): Promise<void> {
  const startTime = Date.now();
  console.log('[PR Agent] Phase 2: Production generation');

  try {
    // 1. Fetch workflow from Redis
    const workflow = await prAgentWorkflow.getWorkflow(workflowId, req.user?.id);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow nicht gefunden'
      });
    }

    if (workflow.status !== 'approved' && workflow.status !== 'changes_requested') {
      return res.status(400).json({
        success: false,
        error: 'Workflow muss erst genehmigt werden'
      });
    }

    const inputData = workflow.input_data as PRAgentRequest;
    const strategyData = workflow.strategy_data as { framing: string; argumentsList: any[] };

    // 2. Re-enrich with approved strategy in context
    const enrichedState = await enrichRequest(inputData, {
      type: 'social',
      enableUrls: true,
      enableWebSearch: false,  // Already enriched in Phase 1
      enableDocQnA: false,
      systemRole: '',
      selectedDocumentIds: [],
      searchQuery: inputData.inhalt,
      useAutomaticSearch: false,
      req,
      // Inject approved strategy into context
      additionalContext: `\n\n# Genehmigte Strategie\n\n${strategyData.framing}`
    });

    // 3. PARALLEL: Generate selected platforms
    const platformPromises = approvedPlatforms.map(platform =>
      generatePlatformContent(platform, enrichedState, req)
    );

    // 4. PARALLEL: Generate sharepics (3x)
    const sharepicPromises = Array.from({ length: 3 }, (_, i) =>
      generateSharepicForChat(req as ExpressRequest, 'dreizeilen', {
        text: inputData.inhalt,
        subject: `Sharepic ${i + 1}`
      }).catch(() => null)
    );

    // Wait for platforms + sharepics
    const [platformResults, sharepicResults] = await Promise.all([
      Promise.all(platformPromises),
      Promise.all(sharepicPromises)
    ]);

    const generatedContent: Record<string, any> = {};
    approvedPlatforms.forEach((platform, idx) => {
      generatedContent[platform] = platformResults[idx];
    });

    const sharepics = (sharepicResults.filter(Boolean) as SharepicResult[]).map(result => ({
      image: result.content.sharepic.image,
      type: result.content.sharepic.type,
      text: result.content.sharepic.text,
      mainSlogan: result.content.sharepic.mainSlogan
    }));

    // 5. SEQUENTIAL: Risk + Visual (depends on generated content)
    const [riskAnalysis, visualBriefing] = await Promise.all([
      generateRiskAnalysis(enrichedState, strategyData.framing || '', generatedContent, generatedContent.pressemitteilung || '', req),
      generateVisualBriefing(enrichedState, strategyData.framing || '', generatedContent, req)
    ]);

    const executionTimeMs = Date.now() - startTime;
    const totalAICalls = approvedPlatforms.length + 2;  // platforms + risk + visual

    // 6. Save production to Redis
    await prAgentWorkflow.saveProduction(
      workflowId,
      generatedContent,
      sharepics,
      riskAnalysis,
      visualBriefing,
      executionTimeMs,
      totalAICalls
    );

    // 7. Return complete PR package
    const formattedResult = formatPRAgentResponse({
      framing: strategyData.framing,
      pressRelease: generatedContent.pressemitteilung || '',
      social: {
        instagram: generatedContent.instagram || '',
        facebook: generatedContent.facebook || ''
      },
      sharepics,
      riskAnalysis,
      visualBriefing,
      metadata: {
        executionTimeMs,
        totalAICalls,
        sharepicsGenerated: sharepics.length,
        examplesUsed: workflow.enrichment_metadata?.examplesUsed || []
      }
    });

    res.json(formattedResult);

  } catch (error) {
    console.error('[PR Agent] Phase 2 failed:', error);
    res.status(500).json({
      success: false,
      error: 'Produktion konnte nicht generiert werden. Bitte versuchen Sie es erneut.'
    });
  }
}
