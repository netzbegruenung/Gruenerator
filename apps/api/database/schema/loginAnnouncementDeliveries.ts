import { type NotificationType } from '@gruenerator/contracts';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Delivery ledger for one-off login announcements. Kept separate from
// `notifications` because dismissal hard-deletes notification rows — this
// record must outlive the notification to keep delivery once-per-user.
export const loginAnnouncementDeliveries = pgTable(
  'login_announcement_deliveries',
  {
    user_id: uuid('user_id').notNull(),
    announcement_type: text('announcement_type').$type<NotificationType>().notNull(),
    delivered_at: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.announcement_type] })]
);
