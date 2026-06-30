/**
 * Background worker that reminds card watchers about cards due soon.
 *
 * Card due dates live in the Yjs board doc; a relational mirror (board_card_due_dates,
 * kept in sync by the activity router) makes them scannable here. For each card due
 * today or tomorrow that hasn't been reminded yet, we notify its watchers and the
 * board owner, then stamp reminded_at so it fires once.
 */
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { createNotification } from '../notifications/NotificationService.js';

import { buildCardEmailMetadata } from './BoardService.js';
import { getCardSubscribers } from './cardSubscriptionService.js';

const log = createLogger('CardDueReminder');
const db = getPostgresInstance();

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

let intervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;

interface DueRow {
  board_id: string;
  card_id: string;
  due_date: string;
  board_title: string | null;
  board_owner: string;
}

async function runReminderScan(): Promise<void> {
  try {
    // Cards due today or tomorrow (date-only compare) not yet reminded.
    const rows = await db.query<DueRow>(
      `SELECT d.board_id, d.card_id, d.due_date,
              cd.title AS board_title, cd.created_by AS board_owner
       FROM board_card_due_dates d
       JOIN collaborative_documents cd ON cd.id = d.board_id
       WHERE d.reminded_at IS NULL
         AND d.due_date::date <= (CURRENT_DATE + INTERVAL '1 day')
         AND d.due_date::date >= CURRENT_DATE`,
      []
    );

    for (const row of rows) {
      const watchers = await getCardSubscribers(row.board_id, row.card_id);
      const recipients = new Set<string>(watchers);
      recipients.add(row.board_owner);

      // Card snapshot (title/status/assignees) once per card for the rich email —
      // the due_dates mirror only has the date, so without this the reminder is titleless.
      const cardMeta = await buildCardEmailMetadata(row.board_id, row.card_id, row.board_title);
      const cardTitle = typeof cardMeta.cardTitle === 'string' ? cardMeta.cardTitle : null;
      const title = cardTitle
        ? `Erinnerung: „${cardTitle}" ist bald fällig`
        : `Karte fällig${row.board_title ? ` in „${row.board_title}"` : ''}`;

      await Promise.all(
        Array.from(recipients).map((userId) =>
          createNotification({
            userId,
            type: 'board_due_date_reminder',
            title,
            body: `Fällig am ${row.due_date}`,
            actionUrl: `/boards/${row.board_id}?card=${row.card_id}`,
            metadata: cardMeta,
            groupKey: `board-due-${row.board_id}-${row.card_id}`,
          }).catch(() => null)
        )
      );

      await db.query(
        `UPDATE board_card_due_dates SET reminded_at = CURRENT_TIMESTAMP
         WHERE board_id = $1 AND card_id = $2`,
        [row.board_id, row.card_id]
      );
    }

    if (rows.length > 0) log.info(`Sent due-date reminders for ${rows.length} card(s)`);
  } catch (err: unknown) {
    log.error(`Due-date reminder scan failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startCardDueReminderWorker(): void {
  if (initialized) return;
  setTimeout(() => void runReminderScan().catch(() => {}), 90_000);
  intervalId = setInterval(() => void runReminderScan().catch(() => {}), CHECK_INTERVAL_MS);
  initialized = true;
  log.info('Card due-date reminder worker started (interval: 1h)');
}

export function stopCardDueReminderWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    initialized = false;
  }
}
