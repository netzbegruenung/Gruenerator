/**
 * Explicit user memory — what the person asked the assistant to remember.
 *
 * There is no extraction here and no gatekeeper: a memory exists because the
 * person said "merk dir …" (the `memory` loop tool) or typed it into the
 * settings tab. That is the whole point of the 2026-09-01 rebuild; the passive
 * mem0 pipeline this replaces is described in the migration that created the
 * table.
 *
 * Rules the service owns, so neither the tool nor the REST layer re-invents
 * them: an exact-text duplicate returns the existing row instead of a second
 * one; a person holds at most `MAX_MEMORIES_PER_USER` rows and
 * `MAX_TOTAL_CHARS` characters (that bound is what keeps the prompt block
 * small — every instruction is in every prompt); and Qdrant is kept in step
 * best-effort, because Postgres is the truth and a missing vector only costs
 * retrieval.
 */
import { MEMORY_TEXT_MAX_CHARS } from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';

import {
  drizzleMemoryDb,
  normalizeMemoryText,
  qdrantMemoryVectors,
  type MemoryDb,
  type MemoryVectors,
  type NewMemory,
} from './memoryStore.js';

import type { UserMemoryRow } from '../../database/schema/index.js';

const log = createLogger('MemoryService');

export const MAX_MEMORIES_PER_USER = 60;
export const MAX_TOTAL_CHARS = 8_000;

/** A rejected write — the message is written for the model AND the person. */
export class MemoryRejectedError extends Error {
  /** Written for the person (and the model) — safe to send to the client. */
  readonly userMessage: string;
  constructor(
    readonly reason: 'full' | 'text',
    userMessage: string
  ) {
    super(userMessage);
    this.name = 'MemoryRejectedError';
    this.userMessage = userMessage;
  }
}

export interface CreateResult {
  row: UserMemoryRow;
  /** True when an identical memory already existed and was returned instead. */
  duplicate: boolean;
}

export interface MemoryService {
  list(userId: string): Promise<UserMemoryRow[]>;
  create(input: NewMemory): Promise<CreateResult>;
  update(userId: string, id: string, text: string): Promise<UserMemoryRow | null>;
  remove(userId: string, id: string): Promise<UserMemoryRow | null>;
  removeAll(userId: string): Promise<number>;
}

function cleanText(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) {
    throw new MemoryRejectedError('text', 'Die Erinnerung ist leer.');
  }
  if (cleaned.length > MEMORY_TEXT_MAX_CHARS) {
    throw new MemoryRejectedError(
      'text',
      `Eine Erinnerung darf höchstens ${MEMORY_TEXT_MAX_CHARS} Zeichen haben — fasse sie kürzer.`
    );
  }
  return cleaned;
}

const full = (): MemoryRejectedError =>
  new MemoryRejectedError(
    'full',
    `Das Gedächtnis ist voll (höchstens ${MAX_MEMORIES_PER_USER} Einträge / ${MAX_TOTAL_CHARS} Zeichen). Lösche oder aktualisiere zuerst eine bestehende Erinnerung.`
  );

/** The characters every prompt will carry after this write — the row being
 *  replaced (if any) counted at its NEW length, not twice. */
function assertWithinBudget(
  rows: readonly UserMemoryRow[],
  incomingChars: number,
  replacingId: string | null
): void {
  const others = rows.reduce((n, r) => (r.id === replacingId ? n : n + r.text.length), 0);
  if (others + incomingChars > MAX_TOTAL_CHARS) throw full();
}

export function createMemoryService(deps: { db: MemoryDb; vectors: MemoryVectors }): MemoryService {
  const { db, vectors } = deps;

  async function mirror(action: () => Promise<void>, what: string): Promise<void> {
    try {
      await action();
    } catch (err) {
      // Postgres already has the row; the vector is a retrieval convenience.
      log.warn(`[Memory] Qdrant ${what} failed (row kept): ${err}`);
    }
  }

  return {
    list: (userId) => db.list(userId),

    async create(input) {
      const text = cleanText(input.text);
      const existing = await db.findByText(input.userId, normalizeMemoryText(text));
      if (existing) return { row: existing, duplicate: true };

      const rows = await db.list(input.userId);
      if (rows.length >= MAX_MEMORIES_PER_USER) throw full();
      assertWithinBudget(rows, text.length, null);

      const row = await db.insert({ ...input, text });
      if (row.kind === 'fakt') await mirror(() => vectors.upsert(row), 'upsert');
      return { row, duplicate: false };
    },

    async update(userId, id, rawText) {
      const text = cleanText(rawText);
      // Same aggregate budget as `create`: the block is in every prompt, and
      // repeated edits must not grow it past the cap a fresh save respects.
      assertWithinBudget(await db.list(userId), text.length, id);
      const row = await db.update(userId, id, text);
      if (!row) return null;
      if (row.kind === 'fakt') await mirror(() => vectors.upsert(row), 'upsert');
      return row;
    },

    async remove(userId, id) {
      const row = await db.remove(userId, id);
      if (!row) return null;
      if (row.kind === 'fakt') await mirror(() => vectors.remove(id), 'delete');
      return row;
    },

    async removeAll(userId) {
      const count = await db.removeAll(userId);
      await mirror(() => vectors.removeAll(userId), 'delete-all');
      return count;
    },
  };
}

export const memoryService: MemoryService = createMemoryService({
  db: drizzleMemoryDb,
  vectors: qdrantMemoryVectors,
});
