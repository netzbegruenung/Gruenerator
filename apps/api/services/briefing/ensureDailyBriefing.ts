/**
 * Das Tagesbriefing einer Person für heute — höchstens einmal je Kalendertag.
 *
 * Zwei Auslöser, ein Weg: der Login-Hook (`session.create.after`) und der
 * Client beim App-Start (`POST /api/briefing/today`). Der Ledger
 * `daily_briefings` (PK `user_id, day`) ist der Claim: der erste INSERT gewinnt,
 * auch über Tabs, Geräte und Cluster-Worker. Ein `pending`/`failed`-Eintrag,
 * der älter als zwei Minuten ist, gilt als liegen geblieben und darf neu
 * geclaimt werden.
 *
 * Der Thread entsteht mitsamt seiner Nachricht in EINER Transaktion: einen
 * Thread ohne Nachricht räumt der Sidebar-Reaper als leer ab.
 *
 * Ein unbeantwortetes Briefing eines früheren Tages wird beim nächsten hart
 * gelöscht (samt Benachrichtigung) — der Papierkorb soll nicht täglich
 * volllaufen, dieselbe Begründung wie bei leeren Threads. Ein beantwortetes
 * bleibt als normaler Chat stehen.
 */
import { type BriefingTodayResponse } from '@gruenerator/contracts';
import { buildChatThreadSlug, generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { runWithUsageContext } from '../../utils/usageContext.js';
import {
  createNotification,
  dismissGroup,
  markGroupAsRead,
} from '../notifications/NotificationService.js';

import {
  collectBriefingInputs,
  loadBriefingProfile,
  type BriefingProfile,
} from './collectInputs.js';
import { composeBriefing, type ComposedBriefing } from './composeBriefing.js';
import { generatePersonalLines } from './personalLines.js';
import { berlinDay, shiftDay } from './time.js';

const log = createLogger('briefing');

const BRIEFING_AGENT_ID = 'gruenerator-universal';
/** Ab diesem Alter gilt ein `pending`/`failed`-Claim als liegen geblieben. */
const STALE_CLAIM_INTERVAL = '2 minutes';

export function briefingGroupKey(day: string): string {
  return `daily-briefing-${day}`;
}

const NONE = { threadId: null, slugSuffix: null } as const;

/** Atomarer Claim; true = dieser Aufruf baut das Briefing. */
async function claim(userId: string, day: string): Promise<boolean> {
  const rows = await getPostgresInstance().query(
    `INSERT INTO daily_briefings (user_id, day, status) VALUES ($1, $2, 'pending')
     ON CONFLICT (user_id, day) DO UPDATE SET status = 'pending', updated_at = NOW()
       WHERE daily_briefings.status IN ('pending', 'failed')
         AND daily_briefings.updated_at < NOW() - INTERVAL '${STALE_CLAIM_INTERVAL}'
     RETURNING user_id`,
    [userId, day]
  );
  return rows.length > 0;
}

async function existing(userId: string, day: string): Promise<BriefingTodayResponse> {
  const rows = (await getPostgresInstance().query(
    `SELECT b.status, t.id AS thread_id, t.slug_suffix
     FROM daily_briefings b
     LEFT JOIN chat_threads t ON t.id = b.thread_id AND t.deleted_at IS NULL
     WHERE b.user_id = $1 AND b.day = $2`,
    [userId, day]
  )) as Array<{ status: string; thread_id: string | null; slug_suffix: string | null }>;
  const row = rows[0];
  if (!row) return { status: 'pending', ...NONE };
  if (row.status === 'pending') return { status: 'pending', ...NONE };
  return { status: 'exists', threadId: row.thread_id, slugSuffix: row.slug_suffix };
}

async function setStatus(
  userId: string,
  day: string,
  status: 'created' | 'skipped' | 'failed',
  threadId: string | null = null
): Promise<void> {
  await getPostgresInstance().query(
    `UPDATE daily_briefings SET status = $3, thread_id = COALESCE($4, thread_id), updated_at = NOW()
     WHERE user_id = $1 AND day = $2`,
    [userId, day, status, threadId]
  );
}

/**
 * Frühere Briefing-Threads ohne eine einzige Nachricht der Person: hart löschen
 * (die Nachrichten gehen per FK-Kaskade mit, der Ledger behält seine Zeile mit
 * `thread_id = NULL`) und ihre Benachrichtigung mit.
 */
async function removeUnansweredEarlier(userId: string, day: string): Promise<void> {
  const db = getPostgresInstance();
  const stale = (await db.query(
    `SELECT b.day::text AS day, b.thread_id
     FROM daily_briefings b
     JOIN chat_threads t ON t.id = b.thread_id AND t.user_id = $1 AND t.deleted_at IS NULL
     WHERE b.user_id = $1 AND b.day < $2 AND b.thread_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.thread_id = b.thread_id AND m.role = 'user')`,
    [userId, day]
  )) as Array<{ day: string; thread_id: string }>;
  for (const row of stale) {
    await db.query(`DELETE FROM chat_threads WHERE id = $1 AND user_id = $2`, [
      row.thread_id,
      userId,
    ]);
    await dismissGroup(briefingGroupKey(row.day), userId);
  }
  if (stale.length > 0) log.info(`replaced ${stale.length} unanswered briefing(s) user=${userId}`);
}

/** Thread und erste (Assistant-)Nachricht in einer Transaktion. */
async function insertThread(
  userId: string,
  composed: ComposedBriefing,
  day: string
): Promise<{ id: string; slug_suffix: string }> {
  const db = getPostgresInstance();
  return db.transaction(async (client) => {
    let thread: { id: string; slug_suffix: string } | null = null;
    for (let attempt = 0; attempt < 5 && !thread; attempt++) {
      await client.query('SAVEPOINT briefing_thread');
      try {
        const result = await client.query(
          `INSERT INTO chat_threads (user_id, agent_id, title, thread_type, slug_suffix)
           VALUES ($1, $2, $3, 'chat', $4)
           RETURNING id, slug_suffix`,
          [userId, BRIEFING_AGENT_ID, composed.title, generateSlugSuffix()]
        );
        thread = result.rows[0] as { id: string; slug_suffix: string };
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT briefing_thread');
        if ((error as { code?: string }).code !== '23505') throw error;
      }
    }
    if (!thread) throw new Error('No free slug suffix for the briefing thread');
    await client.query(
      `INSERT INTO chat_messages (thread_id, role, content, tool_results, user_id)
       VALUES ($1, 'assistant', $2, $3, NULL)`,
      [
        thread.id,
        composed.markdown,
        JSON.stringify({
          intent: 'briefing',
          briefing: { day, sections: composed.sections },
          followUpSuggestions: composed.followUpSuggestions,
        }),
      ]
    );
    await client.query(
      `UPDATE daily_briefings SET status = 'created', thread_id = $3, updated_at = NOW()
       WHERE user_id = $1 AND day = $2`,
      [userId, day, thread.id]
    );
    return thread;
  });
}

async function build(
  userId: string,
  profile: BriefingProfile,
  day: string,
  now: Date
): Promise<BriefingTodayResponse> {
  const inputs = await collectBriefingInputs(userId, profile);
  const personal = await runWithUsageContext(
    { req: { user: { id: userId } }, feature: 'briefing' },
    () => generatePersonalLines(inputs, now)
  );
  const composed = composeBriefing(inputs, personal, now);
  if (!composed) {
    await setStatus(userId, day, 'skipped');
    log.info(`briefing skipped (nothing to say) user=${userId} day=${day}`);
    return { status: 'skipped', ...NONE };
  }

  await removeUnansweredEarlier(userId, day);
  const thread = await insertThread(userId, composed, day);

  await createNotification({
    userId,
    type: 'daily_briefing',
    title: composed.notificationTitle,
    body: composed.notificationBody,
    actionUrl: `/chat/${buildChatThreadSlug(composed.title, thread.slug_suffix)}`,
    groupKey: briefingGroupKey(day),
    metadata: { threadId: thread.id, day },
  }).catch((error: unknown) => {
    log.warn(`briefing notification failed user=${userId}: ${(error as Error).message}`);
  });

  log.info(
    `briefing created user=${userId} day=${day} tasks=${composed.sections.tasks} news=${composed.sections.news} ideas=${composed.sections.ideas} personal=${personal ? 'model' : 'fallback'}`
  );
  return { status: 'created', threadId: thread.id, slugSuffix: thread.slug_suffix };
}

/**
 * Das Briefing für heute sicherstellen. Wirft nicht: ein Fehler setzt den
 * Ledger auf `failed` (nach zwei Minuten neu versuchbar) und meldet `skipped`.
 */
export async function ensureDailyBriefing(
  userId: string,
  opts: { now?: Date } = {}
): Promise<BriefingTodayResponse> {
  const now = opts.now ?? new Date();
  const day = berlinDay(now);
  try {
    const profile = await loadBriefingProfile(userId);
    if (!profile || !profile.enabled || !profile.hasConsent) return { status: 'disabled', ...NONE };
    if (!(await claim(userId, day))) return await existing(userId, day);
    try {
      return await build(userId, profile, day, now);
    } catch (error) {
      log.error(`briefing build failed user=${userId} day=${day}: ${(error as Error).message}`);
      await setStatus(userId, day, 'failed').catch(() => undefined);
      return { status: 'skipped', ...NONE };
    }
  } catch (error) {
    log.warn(`ensureDailyBriefing failed user=${userId}: ${(error as Error).message}`);
    return { status: 'skipped', ...NONE };
  }
}

/** Die Person hat das Briefing geöffnet: Ledger und Glocke zugleich. */
export async function markBriefingOpened(userId: string, threadId: string): Promise<boolean> {
  const rows = (await getPostgresInstance().query(
    `UPDATE daily_briefings SET opened_at = COALESCE(opened_at, NOW()), updated_at = NOW()
     WHERE user_id = $1 AND thread_id = $2
     RETURNING day::text AS day`,
    [userId, threadId]
  )) as Array<{ day: string }>;
  const row = rows[0];
  if (!row) return false;
  await markGroupAsRead(briefingGroupKey(row.day), userId);
  return true;
}

/**
 * Nur Dev: das heutige Briefing verwerfen (Thread, Benachrichtigung, Ledger) und
 * neu bauen. Mit `simulateNextDay` wird der heutige Eintrag stattdessen auf
 * gestern datiert — dann greift „unbeantworteter Vortag wird ersetzt".
 */
export async function rerunDailyBriefing(
  userId: string,
  opts: { simulateNextDay?: boolean } = {}
): Promise<BriefingTodayResponse> {
  const db = getPostgresInstance();
  const day = berlinDay(new Date());
  if (opts.simulateNextDay) {
    const yesterday = shiftDay(day, -1);
    await db.query(`DELETE FROM daily_briefings WHERE user_id = $1 AND day = $2`, [
      userId,
      yesterday,
    ]);
    await db.query(`UPDATE daily_briefings SET day = $3 WHERE user_id = $1 AND day = $2`, [
      userId,
      day,
      yesterday,
    ]);
    await db.query(
      `UPDATE notifications SET group_key = $3 WHERE user_id = $1 AND group_key = $2`,
      [userId, briefingGroupKey(day), briefingGroupKey(yesterday)]
    );
  } else {
    const rows = (await db.query(
      `SELECT thread_id FROM daily_briefings WHERE user_id = $1 AND day = $2`,
      [userId, day]
    )) as Array<{ thread_id: string | null }>;
    const threadId = rows[0]?.thread_id;
    if (threadId) {
      await db.query(`DELETE FROM chat_threads WHERE id = $1 AND user_id = $2`, [threadId, userId]);
    }
    await dismissGroup(briefingGroupKey(day), userId);
    await db.query(`DELETE FROM daily_briefings WHERE user_id = $1 AND day = $2`, [userId, day]);
  }
  return ensureDailyBriefing(userId);
}
