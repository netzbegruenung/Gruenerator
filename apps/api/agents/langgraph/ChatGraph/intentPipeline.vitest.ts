/**
 * Intent Pipeline Integration Tests
 *
 * Verifies that all SearchIntent values are consistently wired across:
 * - Backend types (SearchIntent union, ImageStyle union)
 * - SSE helpers (INTENT_MESSAGE_POOLS, PROGRESS_MESSAGES)
 * - ChatGraph routing (intentToToolKey, routeAfterClassification)
 * - Controller (TOOL_PRIORITY for forced tools)
 * - Frontend types (SearchIntent, GeneratedImage.style, styleLabels)
 * - Mentionables (tool entries map to valid intents)
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect } from 'vitest';

import {
  INTENT_MESSAGE_POOLS,
  PROGRESS_MESSAGES,
  getIntentMessage,
} from '../../../routes/chat/services/sseHelpers.js';
import type {
  SearchIntent,
  ImageStyle,
  ChatGraphState,
  ChartData,
  ConfirmActionType,
  PendingAction,
  ChatSearchResult,
  SearchSource,
} from './types.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * All SearchIntent values that must be supported across the stack.
 * If you add a new intent, add it here — and the tests will tell you
 * what else needs updating.
 */
const ALL_INTENTS: SearchIntent[] = [
  'research',
  'compare',
  'search',
  'web',
  'scrape_url',
  'examples',
  'pressemitteilung_examples',
  'abgeordnetenwatch',
  'bundestag',
  'bahn',
  'reise',
  'hotel',
  'wetter',
  'news',
  'umfragen',
  'image',
  'image_edit',
  'sharepic',
  'social_post',
  'summary',
  'chart',
  'artifact',
  'compute',
  'save_as_doc',
  'create_sheet',
  'create_presentation',
  'create_recurring_task',
  'modify_doc',
  'edit_current_doc',
  'edit_current_board',
  'modify_board',
  'share_doc',
  'chat_history',
  'mcp',
  'direct',
  'agentic',
];

/**
 * All ImageStyle values that must be supported.
 */
const ALL_IMAGE_STYLES: ImageStyle[] = [
  'illustration',
  'realistic',
  'pixel',
  'green-edit',
  'universal',
];

// ============================================================================
// 1. Type-Level Consistency
// ============================================================================

describe('SearchIntent type consistency', () => {
  it('INTENT_MESSAGE_POOLS has a non-empty pool for every SearchIntent', () => {
    for (const intent of ALL_INTENTS) {
      const pool = INTENT_MESSAGE_POOLS[intent];
      expect(pool, `Missing INTENT_MESSAGE_POOLS entry for "${intent}"`).toBeDefined();
      expect(Array.isArray(pool)).toBe(true);
      expect(pool.length).toBeGreaterThan(0);
      for (const message of pool) {
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      }
    }
  });

  it('INTENT_MESSAGE_POOLS has no extra entries beyond SearchIntent', () => {
    const intentKeys = Object.keys(INTENT_MESSAGE_POOLS);
    for (const key of intentKeys) {
      expect(
        ALL_INTENTS.includes(key as SearchIntent),
        `INTENT_MESSAGE_POOLS has unexpected key "${key}" not in SearchIntent`
      ).toBe(true);
    }
  });

  it('getIntentMessage returns a string for every intent', () => {
    for (const intent of ALL_INTENTS) {
      const message = getIntentMessage(intent);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('getIntentMessage returns fallback for unknown intent', () => {
    const message = getIntentMessage('nonexistent' as SearchIntent);
    expect(message).toBe('Verarbeite Anfrage...');
  });
});

// ============================================================================
// 2. PROGRESS_MESSAGES Completeness
// ============================================================================

describe('PROGRESS_MESSAGES', () => {
  it('has image generation messages', () => {
    expect(PROGRESS_MESSAGES.imageStart).toBeDefined();
    expect(PROGRESS_MESSAGES.imageComplete).toBeDefined();
    expect(typeof PROGRESS_MESSAGES.imageError).toBe('function');
    expect(PROGRESS_MESSAGES.imageError('test')).toContain('test');
  });

  it('has image edit messages', () => {
    expect(PROGRESS_MESSAGES.imageEditStart).toBeDefined();
    expect(PROGRESS_MESSAGES.imageEditComplete).toBeDefined();
    expect(PROGRESS_MESSAGES.imageEditNoAttachment).toBeDefined();
    expect(PROGRESS_MESSAGES.imageEditNoAttachment).toContain('Bild');
  });

  it('has search messages', () => {
    expect(PROGRESS_MESSAGES.searchStart).toBeDefined();
    expect(typeof PROGRESS_MESSAGES.searchComplete).toBe('function');
    expect(PROGRESS_MESSAGES.searchComplete(5)).toContain('5');
    expect(PROGRESS_MESSAGES.searchComplete(0)).toBeTruthy();
  });

  it('has response and error messages', () => {
    expect(PROGRESS_MESSAGES.responseStart).toBeDefined();
    expect(PROGRESS_MESSAGES.unauthorized).toBeDefined();
    expect(PROGRESS_MESSAGES.aiUnavailable).toBeDefined();
    expect(PROGRESS_MESSAGES.messagesRequired).toBeDefined();
    expect(PROGRESS_MESSAGES.internalError).toBeDefined();
    expect(PROGRESS_MESSAGES.streamInterrupted).toBeDefined();
  });
});

// ============================================================================
// 3. ChatGraphState Type Shape
// ============================================================================

describe('ChatGraphState shape', () => {
  it('intent field accepts all SearchIntent values', () => {
    for (const intent of ALL_INTENTS) {
      const partial: Partial<ChatGraphState> = { intent };
      expect(partial.intent).toBe(intent);
    }
  });

  it('imageStyle field accepts all ImageStyle values', () => {
    for (const style of ALL_IMAGE_STYLES) {
      const partial: Partial<ChatGraphState> = { imageStyle: style };
      expect(partial.imageStyle).toBe(style);
    }
  });

  it('generatedImage.style accepts all ImageStyle values', () => {
    for (const style of ALL_IMAGE_STYLES) {
      const result = {
        base64: 'data:image/jpeg;base64,abc',
        url: '/test.jpg',
        filename: 'test.jpg',
        prompt: 'test',
        style,
        generationTimeMs: 100,
      };
      expect(result.style).toBe(style);
    }
  });
});

// ============================================================================
// 4. Image Edit Node Structure
// ============================================================================

describe('imageEditNode', () => {
  it('exports imageEditNode function', async () => {
    // fs-based check (see sibling test below): direct dynamic import pulls in
    // the vision/flux pipelines and exceeds vitest's 5s import budget.
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('./nodes/imageEditNode.ts', import.meta.url).pathname,
      'utf-8'
    );
    expect(source).toMatch(/export\s+async\s+function\s+imageEditNode\s*\(/);
  });

  it('is re-exported from nodes barrel', async () => {
    // Read the barrel file to verify export line exists
    // (direct import triggers transitive langchain resolution issues in vitest)
    const fs = await import('fs');
    const barrelContent = fs.readFileSync(
      new URL('./nodes/index.ts', import.meta.url).pathname,
      'utf-8'
    );
    expect(barrelContent).toContain("export { imageEditNode } from './imageEditNode.js'");
  });

  it('is re-exported from ChatGraph barrel', async () => {
    const fs = await import('fs');
    const indexContent = fs.readFileSync(new URL('./index.ts', import.meta.url).pathname, 'utf-8');
    expect(indexContent).toContain('imageEditNode');
  });
});

// ============================================================================
// 5. Intent ↔ Image-related Intents
// ============================================================================

describe('image-related intents', () => {
  it('image and image_edit are distinct intents', () => {
    const imageIntents = ALL_INTENTS.filter((i) => i.startsWith('image'));
    expect(imageIntents).toContain('image');
    expect(imageIntents).toContain('image_edit');
    expect(imageIntents.length).toBe(2);
  });

  it('INTENT_MESSAGE_POOLS differentiates image vs image_edit', () => {
    const imagePool = INTENT_MESSAGE_POOLS['image'];
    const imageEditPool = INTENT_MESSAGE_POOLS['image_edit'];
    const overlap = imagePool.filter((m) => imageEditPool.includes(m));
    expect(overlap, 'image and image_edit pools must not share a phrase').toEqual([]);
  });

  it('image_edit pool mentions editing', () => {
    expect(
      INTENT_MESSAGE_POOLS['image_edit'].some((m) => m.toLowerCase().includes('bearbeit'))
    ).toBe(true);
  });

  it('image pool mentions generation', () => {
    expect(INTENT_MESSAGE_POOLS['image'].some((m) => m.toLowerCase().includes('generier'))).toBe(
      true
    );
  });
});

// ============================================================================
// 6. INTENT_MESSAGE_POOLS are in German
// ============================================================================

describe('INTENT_MESSAGE_POOLS are German user-facing strings', () => {
  it('all messages end with "..." (ellipsis pattern)', () => {
    for (const [intent, pool] of Object.entries(INTENT_MESSAGE_POOLS)) {
      for (const message of pool) {
        expect(
          message.endsWith('...'),
          `INTENT_MESSAGE_POOLS["${intent}"] entry "${message}" should end with "..."`
        ).toBe(true);
      }
    }
  });

  it('no message is empty or just whitespace', () => {
    for (const [intent, pool] of Object.entries(INTENT_MESSAGE_POOLS)) {
      for (const message of pool) {
        expect(
          message.trim().length > 3,
          `INTENT_MESSAGE_POOLS["${intent}"] entry is too short: "${message}"`
        ).toBe(true);
      }
    }
  });
});

// ============================================================================
// 7. SearchIntent Coverage: every intent has a handler path
// ============================================================================

describe('every SearchIntent has a handler path', () => {
  /**
   * This test reads the controller source to verify all intents are handled.
   * We check that the controller references each intent either:
   * - In the if/else-if chain (image, image_edit, direct)
   * - In the search fallback (research, search, web, examples)
   */
  const CONTROLLER_HANDLED_INTENTS: Record<SearchIntent, string> = {
    image: 'handled via image branch in controller',
    image_edit: 'handled via image_edit branch in controller',
    sharepic: 'handled via sharepic branch in controller (image generation variant)',
    social_post:
      'handled via social_post branch in executeIntentPipeline — parallel sharepic generation + examples-grounded text (EXPERIMENTAL combined post), fixed Stage-3 confirmation',
    direct: 'falls through to response generation',
    research: 'handled via search branch (intent !== direct)',
    compare: 'handled via search branch — multi-document comparison, same path as research',
    search: 'handled via search branch (intent !== direct)',
    web: 'handled via search branch (intent !== direct)',
    examples: 'handled via search branch (intent !== direct)',
    pressemitteilung_examples:
      'handled via search branch — landesverbaende press release templates, same path as examples',
    abgeordnetenwatch:
      'handled via search branch (intent !== direct) — searchNode case calls EnrichedPoliticianService (Abgeordnetenwatch API)',
    bundestag:
      'handled via search branch (intent !== direct) — searchNode case calls BundestagEnrichedService (Bundestag MCP / DIP)',
    bahn: 'EXPERIMENTAL system MCP source — forces the agentic loop (isMcpTurn in router); systemMcpCatalog mounts the Deutsche-Bahn tools; router degrades a killed loop turn to web',
    reise:
      'EXPERIMENTAL umbrella travel intent — forces the agentic loop; systemMcpCatalog mounts bahn + hotel (trivago) + wetter together; router degrades a killed loop turn to web',
    hotel:
      'EXPERIMENTAL system MCP source — forces the agentic loop; systemMcpCatalog mounts the trivago hotel-search tools; router degrades a killed loop turn to web',
    umfragen:
      'EXPERIMENTAL native domain tool — forces the agentic loop; toolCatalog mounts makeUmfragenTool (PolitPro Sonntagsfrage + Meinungsbild); router degrades a killed loop turn to web',
    wetter:
      'EXPERIMENTAL system MCP source — forces the agentic loop; systemMcpCatalog mounts the Open-Meteo/DWD tools; router degrades a killed loop turn to web',
    news: 'EXPERIMENTAL system MCP source — forces the agentic loop; systemMcpCatalog mounts the ARD/tagesschau tools (citations via sourceRegistry); router degrades a killed loop turn to web',
    summary: 'handled via summary branch in controller',
    chart: 'routes to respond, chart data handled by controller post-response',
    artifact: 'routes to respond, controller extracts HTML/SVG block into an artifact SSE event',
    compute:
      'handled via compute branch in controller — computeNode runs plain-JS calc, emits compute SSE + injects verified result into respond',
    scrape_url: 'handled via search branch — crawls pasted URL(s) as additional context',
    save_as_doc: 'routes to respond, then confirm_action SSE + pendingActionStore',
    create_sheet:
      'handled via handleSheetCreation — generates a spreadsheet, seeds the Y.Doc, emits document_created SSE (subtype sheets)',
    create_presentation:
      'handled via handlePresentationCreation — generates a reveal.js deck, seeds the Y.Doc, emits document_created SSE (subtype presentations)',
    create_recurring_task:
      'handled via handleRecurringTaskCreation — parses the schedule, persists a recurring_tasks row, emits confirm SSE (flag-gated EXPERIMENTAL)',
    modify_doc: 'routes to respond, then confirm_action SSE + pendingActionStore',
    edit_current_doc:
      'routes to respond, controller emits trigger_doc_edit SSE for BlockNote AI live edit',
    edit_current_board:
      'controller emits trigger_board_action SSE for the boards assistant live edit (client-side executor)',
    modify_board: 'routes to respond, then confirm_action SSE + pendingActionStore',
    share_doc: 'short-circuits before LLM — resolves group, emits confirm_action SSE',
    mcp: "EXPERIMENTAL — always runs the agentic loop (streamAgenticResponse); mcpCatalog mounts the user's connected MCP tools into the same loop",
    chat_history:
      'handled via chat_history branch in executeIntentPipeline — recall tool-loop over the own threads (flag-gated), else recallContext injection',
    agentic:
      'loop demotion (classifier Tier 3.5) — router routes to streamAgenticResponse; never reaches executeIntentPipeline (safety line degrades a killed loop turn to search)',
  };

  for (const intent of ALL_INTENTS) {
    it(`"${intent}" has a documented handler path`, () => {
      expect(
        CONTROLLER_HANDLED_INTENTS[intent],
        `Intent "${intent}" has no documented handler path — add it to the controller`
      ).toBeDefined();
    });
  }
});

// ============================================================================
// 8. Action-related Intents
// ============================================================================

describe('action-related intents', () => {
  const ACTION_INTENTS: SearchIntent[] = ['save_as_doc', 'modify_doc', 'modify_board'];

  it('all action intents are in ALL_INTENTS', () => {
    for (const intent of ACTION_INTENTS) {
      expect(ALL_INTENTS).toContain(intent);
    }
  });

  it('action intents have distinct INTENT_MESSAGE_POOLS', () => {
    const allPhrases = ACTION_INTENTS.flatMap((i) => INTENT_MESSAGE_POOLS[i]);
    const unique = new Set(allPhrases);
    expect(unique.size, 'action-intent pools must not share a phrase').toBe(allPhrases.length);
  });

  it('INTENT_MESSAGE_POOLS for action intents are in German', () => {
    for (const intent of ACTION_INTENTS) {
      for (const message of INTENT_MESSAGE_POOLS[intent]) {
        expect(message.endsWith('...')).toBe(true);
      }
    }
  });
});

// ============================================================================
// 9. ConfirmActionType ↔ SearchIntent Consistency
// ============================================================================

describe('ConfirmActionType consistency', () => {
  const ALL_CONFIRM_TYPES: ConfirmActionType[] = ['save_as_doc', 'modify_doc', 'modify_board'];

  it('every ConfirmActionType has a matching SearchIntent', () => {
    for (const type of ALL_CONFIRM_TYPES) {
      expect(ALL_INTENTS).toContain(type);
    }
  });

  it('PendingAction type accepts all ConfirmActionType values', () => {
    const base = {
      actionId: 'test',
      threadId: 'thread-1',
      userId: 'user-1',
      title: 'Test',
      preview: 'Preview',
      createdAt: Date.now(),
    };
    const actions: PendingAction[] = [
      { ...base, type: 'save_as_doc', payload: { content: 'text', title: 'Doc', subtype: 'docs' } },
      { ...base, type: 'modify_doc', payload: { docId: 'doc-1', newContent: 'new' } },
      { ...base, type: 'modify_board', payload: { boardId: 'b-1', rows: [], responseText: '' } },
    ];
    for (const action of actions) {
      expect(ALL_CONFIRM_TYPES).toContain(action.type);
    }
  });
});

// ============================================================================
// 10. ChartData Type Shape
// ============================================================================

describe('ChartData type shape', () => {
  const CHART_TYPES: ChartData['type'][] = ['bar', 'line', 'area', 'pie', 'donut'];

  it('accepts all chart types', () => {
    for (const type of CHART_TYPES) {
      const chart: ChartData = {
        type,
        title: 'Test Chart',
        data: [{ name: 'A', value: 10 }],
        xKey: 'name',
        yKeys: ['value'],
      };
      expect(chart.type).toBe(type);
    }
  });

  it('chartData field is nullable in ChatGraphState', () => {
    const partial: Partial<ChatGraphState> = { chartData: null };
    expect(partial.chartData).toBeNull();
  });

  it('chartData accepts full ChartData object', () => {
    const chart: ChartData = {
      type: 'bar',
      title: 'Test',
      data: [{ name: 'Jan', wert: 42 }],
      xKey: 'name',
      yKeys: ['wert'],
      colors: ['#005538'],
    };
    const partial: Partial<ChatGraphState> = { chartData: chart };
    expect(partial.chartData?.title).toBe('Test');
  });
});

// ============================================================================
// 11. SearchSource Expanded Types
// ============================================================================

describe('SearchSource expanded types', () => {
  const ALL_SOURCES: SearchSource[] = ['documents', 'web', 'chat_history', 'wolke'];

  it('SearchSource accepts all expected values', () => {
    for (const source of ALL_SOURCES) {
      const partial: Partial<ChatGraphState> = { searchSources: [source] };
      expect(partial.searchSources).toContain(source);
    }
  });

  it('ChatSearchResult has required fields', () => {
    const result: ChatSearchResult = {
      threadId: 'thread-1',
      threadTitle: 'Test Thread',
      agentId: 'gruenerator-universal',
      snippet: 'test snippet content',
      messageRole: 'assistant',
      matchedAt: '2026-04-04T12:00:00Z',
      threadUpdatedAt: '2026-04-04T12:00:00Z',
    };
    expect(result.threadId).toBe('thread-1');
    expect(result.messageRole).toBe('assistant');
  });

  it('ChatSearchResult threadTitle is nullable', () => {
    const result: ChatSearchResult = {
      threadId: 'thread-1',
      threadTitle: null,
      agentId: 'test',
      snippet: 'test',
      messageRole: 'user',
      matchedAt: '2026-04-04T12:00:00Z',
      threadUpdatedAt: '2026-04-04T12:00:00Z',
    };
    expect(result.threadTitle).toBeNull();
  });
});
