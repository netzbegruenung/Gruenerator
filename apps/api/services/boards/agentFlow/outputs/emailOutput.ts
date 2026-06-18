/**
 * Output: "E-Mail" node — no-op.
 *
 * The agent's result is delivered to the requester by the unified
 * `agent_task_completed` notification fired in runFlow (`createNotification`), which
 * sends the email (preview + link) AND records the in-system entry, respecting the
 * user's notification preferences.
 *
 * This node used to send a *second*, raw email directly via `sendNotificationEmail` —
 * that bypassed preferences and produced an email with no matching in-system
 * notification (an orphan/duplicate). It was removed so every email has an in-system
 * twin. The executor stays registered so the exhaustive output registry stays valid.
 */
import { type OutputExecutor } from './types.js';

export const emailOutput: OutputExecutor = async () => {
  // Intentionally empty — email is handled by the completion notification in runFlow.
};
