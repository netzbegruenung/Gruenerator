/**
 * Debug test for SocialAgentGraph pipeline
 * Run with: npx tsx apps/api/agents/langgraph/SocialAgentGraph/SocialAgentGraph.test.ts
 *
 * Tests each node individually to identify where content truncation occurs.
 * Uses mock aiWorkerPool to isolate the graph logic from actual AI calls.
 */

import { formatNode } from './nodes/formatNode.js';
import { generateNode } from './nodes/generateNode.js';
import { strategizeNode } from './nodes/strategizeNode.js';

import type { SocialAgentState } from './types.js';
import type { EnrichedState } from '../../../utils/types/requestEnrichment.js';

// Track all aiWorkerPool.processRequest calls
const aiCalls: Array<{
  callIndex: number;
  type: string;
  maxTokens: number;
  systemPromptLength: number;
  messagesCount: number;
}> = [];

// Mock AI worker that returns predictable content
const mockAiWorkerPool = {
  processRequest: async (data: any, _req: any) => {
    const call = {
      callIndex: aiCalls.length + 1,
      type: data.type,
      maxTokens: data.options?.max_tokens || 0,
      systemPromptLength: data.systemPrompt?.length || 0,
      messagesCount: data.messages?.length || 0,
    };
    aiCalls.push(call);
    console.log(`  [mock AI] Call #${call.callIndex}:`, JSON.stringify(call, null, 2));

    return {
      content:
        `[Mock response #${call.callIndex}] Die Grünen in Alfter setzen auf nachhaltige Mobilität ` +
        `und erneuerbare Energien als Kernthemen ihrer Kommunalpolitik. **Klimaschutz** beginnt vor ` +
        `der eigenen Haustür — mit Radwegen, Solaranlagen und grünen Freiräumen. ` +
        `Gemeinsam gestalten wir eine lebenswerte Zukunft für alle Bürger*innen. ` +
        `🌱 #Klimaschutz #Alfter #GrünWirkt`,
    };
  },
};

const mockReq: any = {
  app: { locals: { aiWorkerPool: mockAiWorkerPool } },
  user: { id: 'test-user' },
  headers: { 'accept-language': 'de-DE' },
  get: (h: string) => (h === 'accept-language' ? 'de-DE' : null),
};

// Pre-crafted enrichedState to bypass enrichRequest + examples fetching
const mockEnrichedState: EnrichedState = {
  type: 'social',
  locale: 'de-DE',
  systemRole: 'Du bist ein Social-Media-Experte für Bündnis 90/Die Grünen.',
  constraints: 'Maximal 2000 Zeichen pro Plattform.',
  formatting: 'Nutze Markdown sparsam.',
  taskInstructions: null,
  outputFormat: null,
  documents: [],
  knowledge: [
    'Klimaschutz ist ein zentrales Thema der Grünen.',
    'Die Grünen in Alfter haben 2025 einen Klimaplan verabschiedet.',
  ],
  instructions: null,
  request: {
    inhalt: 'Klimaschutz in Alfter: nachhaltige Mobilität und erneuerbare Energien',
    zitatgeber: '',
    platforms: ['instagram'],
    usePrivacyMode: false,
    useProMode: false,
    useUltraMode: false,
  },
  examples: [{ content: 'Beispiel Instagram-Post zum Klimaschutz' }],
  toolInstructions: [],
  enrichmentMetadata: {
    enableDocQnA: false,
    urlsCrawled: [],
    webSearchPerformed: false,
    webSearchResults: [],
    vectorSearchResults: [],
  },
} as any;

function buildTestState(overrides: Partial<SocialAgentState> = {}): SocialAgentState {
  return {
    inhalt: 'Klimaschutz in Alfter: nachhaltige Mobilität und erneuerbare Energien',
    platforms: ['instagram'],
    zitatgeber: null,
    features: {
      useWebSearchTool: false,
      usePrivacyMode: false,
      useProMode: false,
      useUltraMode: false,
    },
    selectedDocumentIds: [],
    selectedTextIds: [],
    attachments: [],
    searchQuery: 'Klimaschutz Alfter',
    req: mockReq,
    enrichedState: mockEnrichedState,
    arguments: [],
    argumentsSummary: null,
    researchContext: null,
    strategy: null,
    platformContent: {},
    formattedOutput: '',
    startTime: Date.now(),
    researchTimeMs: 0,
    strategyTimeMs: 0,
    generationTimeMs: 0,
    error: null,
    ...overrides,
  };
}

async function runTests() {
  console.log('=== SocialAgentGraph Node-by-Node Trace ===\n');

  // ── Test 1: strategizeNode ──
  console.log('─── Test 1: strategizeNode ───');
  const stratState = buildTestState();
  const stratResult = await strategizeNode(stratState);
  console.log('Result:', {
    strategy: stratResult.strategy ? `${stratResult.strategy.length} chars` : 'null',
    strategyTimeMs: stratResult.strategyTimeMs,
    error: stratResult.error || 'none',
  });
  if (stratResult.strategy) {
    console.log('Strategy:', stratResult.strategy.substring(0, 300));
  }
  console.log('');

  // ── Test 2: generateNode ──
  console.log('─── Test 2: generateNode ───');
  const genState = buildTestState({
    strategy: stratResult.strategy || 'Test strategy',
    researchContext: 'Recherchierte Argumente: Klimaschutz ist wichtig.',
  });
  const genResult = await generateNode(genState);
  console.log('Result:', {
    platformContentKeys: Object.keys(genResult.platformContent || {}),
    generationTimeMs: genResult.generationTimeMs,
    error: genResult.error || 'none',
  });
  for (const [platform, content] of Object.entries(genResult.platformContent || {})) {
    console.log(`  ${platform}: ${(content as string).length} chars`);
    console.log(`  ${platform} content:`, (content as string).substring(0, 300));
  }
  console.log('');

  // ── Test 3: formatNode ──
  console.log('─── Test 3: formatNode ───');
  const formatState = buildTestState({
    strategy: stratResult.strategy || 'Test strategy',
    platformContent: genResult.platformContent || { instagram: 'Test content' },
    arguments: [
      {
        source: 'Grundsatzprogramm',
        content: 'Klimaschutz-Passage',
        metadata: { collection: 'grundsatz_documents' },
      } as any,
    ],
  });
  const formatResult = await formatNode(formatState);
  console.log('Result:', {
    formattedOutputLength: formatResult.formattedOutput?.length || 0,
  });
  if (formatResult.formattedOutput) {
    console.log('--- Full formatted output ---');
    console.log(formatResult.formattedOutput);
    console.log('--- End output ---');
  }

  // ── Summary ──
  console.log('\n=== AI Call Summary ===');
  console.log(`Total calls: ${aiCalls.length}`);
  for (const call of aiCalls) {
    console.log(
      `  #${call.callIndex}: type=${call.type}, max_tokens=${call.maxTokens}, ` +
        `sysPrompt=${call.systemPromptLength}chars, msgs=${call.messagesCount}`
    );
  }

  // ── Test 4: Full graph execution (tests contentExamplesService hang) ──
  console.log('\n─── Test 4: Full graph execution with timeout ───');
  console.log('  This tests whether the full graph hangs (e.g. contentExamplesService).');
  console.log(
    '  If this test hangs, the production issue is example fetching during prompt assembly.'
  );

  const { initializeSocialAgentState, socialAgentGraph } = await import('./SocialAgentGraph.js');

  const fullInput = {
    inhalt: 'Klimaschutz in Alfter',
    platforms: ['instagram'],
    zitatgeber: null,
    features: {
      useWebSearchTool: false,
      usePrivacyMode: true,
      useProMode: false,
      useUltraMode: false,
    },
    selectedDocumentIds: [],
    selectedTextIds: [],
    attachments: [],
    searchQuery: 'Klimaschutz Alfter',
    req: mockReq,
  };

  const fullState = initializeSocialAgentState(fullInput);
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve('TIMEOUT'), 30_000));
  const graphRun = socialAgentGraph.invoke(fullState).then((result: any) => {
    console.log('  Full graph completed!');
    console.log(`  formattedOutput: ${result.formattedOutput?.length || 0} chars`);
    console.log(`  error: ${result.error || 'none'}`);
    return 'OK';
  });

  const outcome = await Promise.race([graphRun, timeout]);
  if (outcome === 'TIMEOUT') {
    console.log('  HUNG after 30s — contentExamplesService or Qdrant call is likely blocking.');
    console.log('  This is the probable cause of truncated output in production.');
  }

  console.log('\nDone.');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
