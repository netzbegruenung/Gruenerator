import { createLogger } from '../../../utils/logger.js';
import { parseJSON } from '../../../utils/parseJSON.js';
import redisClient from '../../../utils/redis/client.js';

import { DEFAULT_LOOP_BUDGET } from './agenticLoop/types.js';
import { type StoredRequestContext } from './pipelineStateStore.js';

import type { PendingToolCall, PersistedStep } from './agenticLoop/types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('SuspendedTurnStore');

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

export interface SuspendedTurnStore<TPayload extends { createdAt: number }> {
  store(threadId: string, data: Omit<TPayload, 'createdAt'>): Promise<boolean>;
  get(threadId: string): Promise<TPayload | undefined>;
  claim(threadId: string, turnId: string): Promise<boolean>;
  releaseClaim(threadId: string, turnId: string): Promise<void>;
  delete(threadId: string): Promise<void>;
}

/**
 * Redis-Zustand eines pausierten Loop-Zuges — geteilt von Werkzeug-Freigabe
 * und `ask_human`-Rückfrage, weil store/get/claim/releaseClaim/delete für
 * beide identisch sind: ein Schlüssel je Thread, 24-h-TTL, und ein
 * SET-NX-Anspruch, der genau eine Fortsetzung je Pause zulässt (ein zweiter
 * Tab oder ein Doppelklick darf den Zug nicht zweimal fortsetzen).
 */
export function createSuspendedTurnStore<
  TPayload extends { createdAt: number; classifiedState: ChatGraphState },
>(opts: { prefix: string; claimPrefix: string; label: string }): SuspendedTurnStore<TPayload> {
  const key = (threadId: string): string => opts.prefix + threadId;
  const claimKey = (threadId: string, turnId: string): string =>
    `${opts.claimPrefix}${threadId}:${turnId}`;

  return {
    async store(threadId, data) {
      // Gleiche Begründung wie beim Klärungs-Zustand: die PDF-Formularbytes liegen
      // schon in `requestContext.processedMeta`.
      const { pdfFormAttachments: _bytes, ...classifiedState } = data.classifiedState;
      const entry = {
        ...data,
        classifiedState: classifiedState as ChatGraphState,
        createdAt: Date.now(),
      } as TPayload;
      try {
        await redisClient.setEx(key(threadId), TTL_SECONDS, JSON.stringify(entry));
        return true;
      } catch (err) {
        // Ohne gespeicherten Zustand gibt es keine Fortsetzung — der Aufrufer muss
        // das wissen und darf die Pause dann gar nicht erst anbieten.
        log.error(`${opts.label}-Zustand für Thread ${threadId} nicht speicherbar:`, err);
        return false;
      }
    },

    async get(threadId) {
      try {
        const raw = await redisClient.get(key(threadId));
        if (!raw) return undefined;
        return parseJSON<TPayload>(raw);
      } catch (err) {
        log.error(`${opts.label}-Zustand für Thread ${threadId} nicht lesbar:`, err);
        return undefined;
      }
    },

    async claim(threadId, turnId) {
      try {
        const res = await redisClient.set(claimKey(threadId, turnId), '1', {
          condition: 'NX',
          expiration: { type: 'EX', value: CLAIM_TTL_SECONDS },
        });
        return res === 'OK';
      } catch (err) {
        log.error(`Anspruch auf ${opts.label} ${turnId} fehlgeschlagen:`, err);
        return false;
      }
    },

    async releaseClaim(threadId, turnId) {
      try {
        await redisClient.del(claimKey(threadId, turnId));
      } catch (err) {
        log.error(`Anspruch auf ${opts.label} ${turnId} nicht freigegeben:`, err);
      }
    },

    async delete(threadId) {
      try {
        await redisClient.del(key(threadId));
      } catch (err) {
        log.error(`${opts.label}-Zustand für Thread ${threadId} nicht löschbar:`, err);
      }
    },
  };
}

export const toolApprovalStateStore: SuspendedTurnStore<StoredApprovalState> =
  createSuspendedTurnStore<StoredApprovalState>({
    prefix: REDIS_PREFIX,
    claimPrefix: CLAIM_PREFIX,
    label: 'Freigabe',
  });
