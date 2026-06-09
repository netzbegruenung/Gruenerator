/**
 * Identity of the asynchronous Grünerator board agent.
 *
 * The bot is a sentinel `profiles` row (seeded by the create_async_agent.sql
 * migration) so it can be @mentioned/assigned on board cards via the normal
 * mention machinery, and authored as the comment author when it replies with
 * results. The UUID is hardcoded and must match the migration.
 */
export const GRUENERATOR_BOT_USER_ID = '00000000-0000-0000-0000-000000000010';

export const GRUENERATOR_BOT_DISPLAY_NAME = 'Grünerator';
