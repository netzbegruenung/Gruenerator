import { createLogger } from '../../../utils/logger.js';
import { parseJSON } from '../../../utils/parseJSON.js';
import redisClient from '../../../utils/redis/client.js';

import { DEFAULT_LOOP_BUDGET } from './agenticLoop/types.js';
import { type StoredRequestContext } from './pipelineStateStore.js';

import type { PendingToolCall, PersistedStep } from './agenticLoop/types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ToolApprovalStateStore');

/** Deutlich länger als die 10 Minuten der Klärungs-Pause: hier entscheidet ein
 *  Mensch über einen Seiteneffekt, und das darf über eine Pause hinweg gehen. */
const TTL_SECONDS = 24 * 60 * 60;
const REDIS_PREFIX = 'tool_approval_state:';
const CLAIM_PREFIX = 'tool_approval_claim:';
/**
 * Muss den Zug überdauern, den er schützt — sonst läuft der Anspruch mitten in
 * der Fortsetzung ab und ein zweiter Tab (oder ein Wiederholungsversuch nach
 * einer scheinbaren Zeitüberschreitung) führt denselben freigegebenen Aufruf
 * ein zweites Mal aus. Obergrenze eines Zuges ist `DEFAULT_LOOP_BUDGET.hardCapMs`
 * plus die freigegebenen Aufrufe davor (bis zu 90 s je Werkzeug, nacheinander).
 * Der Puffer deckt die; der Anspruch wird ohnehin bei Fehlschlag und erneuter
 * Pause ausdrücklich zurückgegeben, die Frist ist nur das Netz darunter.
 */
const CLAIM_TTL_SECONDS = DEFAULT_LOOP_BUDGET.hardCapMs / 1000 + 600;

export interface StoredApprovalState {
  approvalTurnId: string;
  calls: PendingToolCall[];
  /** Die Schritte, die vor dem Gate schon gelaufen sind — Grundlage des Replays. */
  priorSteps: PersistedStep[];
  /** Die bereits gestreamte Teilantwort. */
  partialText: string;
  /** Die Nachricht, die fortgeschrieben wird — eine Blase, nicht zwei. */
  pausedMessageId: string | null;
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  createdAt: number;
}

const key = (threadId: string): string => REDIS_PREFIX + threadId;
const claimKey = (threadId: string, approvalTurnId: string): string =>
  `${CLAIM_PREFIX}${threadId}:${approvalTurnId}`;

export const toolApprovalStateStore = {
  async store(threadId: string, data: Omit<StoredApprovalState, 'createdAt'>): Promise<boolean> {
    // Gleiche Begründung wie beim Klärungs-Zustand: die PDF-Formularbytes liegen
    // schon in `requestContext.processedMeta`.
    const { pdfFormAttachments: _bytes, ...classifiedState } = data.classifiedState;
    const entry: StoredApprovalState = {
      ...data,
      classifiedState: classifiedState as ChatGraphState,
      createdAt: Date.now(),
    };
    try {
      await redisClient.setEx(key(threadId), TTL_SECONDS, JSON.stringify(entry));
      return true;
    } catch (err) {
      // Ohne gespeicherten Zustand gibt es keine Fortsetzung — der Aufrufer muss
      // das wissen und darf die Freigabe dann gar nicht erst anbieten.
      log.error(`Freigabe-Zustand für Thread ${threadId} nicht speicherbar:`, err);
      return false;
    }
  },

  async get(threadId: string): Promise<StoredApprovalState | undefined> {
    try {
      const raw = await redisClient.get(key(threadId));
      if (!raw) return undefined;
      return parseJSON<StoredApprovalState>(raw);
    } catch (err) {
      log.error(`Freigabe-Zustand für Thread ${threadId} nicht lesbar:`, err);
      return undefined;
    }
  },

  /**
   * Genau eine Fortsetzung je Pause. Ohne den Anspruch führt ein zweiter Tab
   * oder ein Doppelklick den freigegebenen Aufruf ein zweites Mal aus — und
   * genau davor soll die Freigabe schützen.
   */
  async claim(threadId: string, approvalTurnId: string): Promise<boolean> {
    try {
      const res = await redisClient.set(claimKey(threadId, approvalTurnId), '1', {
        condition: 'NX',
        expiration: { type: 'EX', value: CLAIM_TTL_SECONDS },
      });
      return res === 'OK';
    } catch (err) {
      log.error(`Anspruch auf Freigabe ${approvalTurnId} fehlgeschlagen:`, err);
      return false;
    }
  },

  async releaseClaim(threadId: string, approvalTurnId: string): Promise<void> {
    try {
      await redisClient.del(claimKey(threadId, approvalTurnId));
    } catch (err) {
      log.error(`Anspruch auf Freigabe ${approvalTurnId} nicht freigegeben:`, err);
    }
  },

  async delete(threadId: string): Promise<void> {
    try {
      await redisClient.del(key(threadId));
    } catch (err) {
      log.error(`Freigabe-Zustand für Thread ${threadId} nicht löschbar:`, err);
    }
  },
};
