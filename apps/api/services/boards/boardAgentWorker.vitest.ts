/**
 * A KI-Spalte flow runs as `requested_by`. Between enqueue and run — for a
 * schedule, weeks — that person can lose access to the board; the worker must
 * check again and not run the flow for them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimNextAgentTask: vi.fn(),
  failOrRetryAgentTask: vi.fn(),
  runFlow: vi.fn(),
  checkBoardAccess: vi.fn(),
}));

vi.mock('./agentTaskService.js', () => ({
  BOARD_REPAIR_DEADLINE_MS: 1,
  BOARD_TURN_DEADLINE_MS: 1,
  cardTaskText: vi.fn(),
  claimNextAgentTask: mocks.claimNextAgentTask,
  completeAgentTask: vi.fn(),
  completeWithChildAgentTasks: vi.fn(),
  failOrRetryAgentTask: mocks.failOrRetryAgentTask,
  failTasksBlockedByFailure: vi.fn(async () => []),
  postBotComment: vi.fn(),
  updateBotComment: vi.fn(),
  sweepDeadAgentTasks: vi.fn(async () => []),
  taskGraphContext: vi.fn(),
}));
vi.mock('./agentFlow/index.js', () => ({ runFlow: mocks.runFlow }));
vi.mock('../../routes/boards/boardAccess.js', () => ({ checkBoardAccess: mocks.checkBoardAccess }));
vi.mock('../../middleware/requireAiConsent.js', () => ({ hasAiConsent: async () => true }));
vi.mock('../../routes/chat/services/agenticLoop/runHeadlessAgenticTurn.js', () => ({
  runHeadlessAgenticTurn: vi.fn(),
}));
vi.mock('../ai/generate.js', () => ({ aiText: vi.fn() }));
vi.mock('../backgroundRuns/verifiedTurn.js', () => ({
  needsHumanReview: vi.fn(),
  runVerifiedTurn: vi.fn(),
}));
vi.mock('../docs/DocGenerationService.js', () => ({ createDocumentWithContent: vi.fn() }));
vi.mock('../notifications/NotificationService.js', () => ({ createNotification: vi.fn() }));
vi.mock('./agentFlow/artifactGen.js', () => ({
  createPresentationFromText: vi.fn(),
  createSheetFromText: vi.fn(),
  generateTaskList: vi.fn(),
}));
vi.mock('./agentFlow/cardContext.js', () => ({
  buildCardAgentContext: vi.fn(),
  formatDocuments: vi.fn(),
}));
vi.mock('./agentFlow/generate.js', () => ({ deriveTitle: vi.fn(), prepareAgentState: vi.fn() }));
vi.mock('./agentFlow/taskListParse.js', () => ({ agentTaskSubset: vi.fn() }));
vi.mock('./boardLiveRowService.js', () => ({ addRowsToBoardLive: vi.fn() }));
vi.mock('./BoardService.js', () => ({ resolveNewCardColumn: vi.fn() }));
vi.mock('./boardSharingService.js', () => ({ inheritBoardSharingToDocument: vi.fn() }));
vi.mock('./cardDocumentService.js', () => ({ linkAgentDocumentToCard: vi.fn() }));

const { startBoardAgentWorker, stopBoardAgentWorker } = await import('./boardAgentWorker.js');

const flowTask = {
  id: 'task1',
  board_id: 'b1',
  card_id: 'k1',
  requested_by: 'creator',
  trigger_comment_id: null,
  attempts: 1,
  max_attempts: 3,
  flow_config: { source: { type: 'none' }, task: { type: 'freeform' } },
};

async function drainOnce(): Promise<void> {
  mocks.claimNextAgentTask.mockResolvedValueOnce(flowTask).mockResolvedValue(null);
  startBoardAgentWorker();
  await vi.advanceTimersByTimeAsync(5_000);
  stopBoardAgentWorker();
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.claimNextAgentTask.mockReset();
  mocks.failOrRetryAgentTask.mockReset().mockResolvedValue({ willRetry: false });
  mocks.runFlow.mockReset().mockResolvedValue(undefined);
  mocks.checkBoardAccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('boardAgentWorker — board access at run time', () => {
  it('fails the flow task without running it once the requester lost access', async () => {
    mocks.checkBoardAccess.mockResolvedValue({ hasAccess: false, canEdit: false });

    await drainOnce();

    expect(mocks.checkBoardAccess).toHaveBeenCalledWith('b1', 'creator');
    expect(mocks.runFlow).not.toHaveBeenCalled();
    expect(mocks.failOrRetryAgentTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task1', attempts: 3 }),
      expect.any(String)
    );
  });

  it('runs the flow while the requester still has access', async () => {
    mocks.checkBoardAccess.mockResolvedValue({ hasAccess: true, canEdit: true });

    await drainOnce();

    expect(mocks.runFlow).toHaveBeenCalledWith(expect.objectContaining({ id: 'task1' }));
    expect(mocks.failOrRetryAgentTask).not.toHaveBeenCalled();
  });
});
