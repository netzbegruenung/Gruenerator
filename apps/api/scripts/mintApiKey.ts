/**
 * Admin script — mint an API key for external programmatic access.
 *
 * Usage:
 *   pnpm --filter @gruenerator/api mint-api-key \
 *     --user <user-id> \
 *     --label "partner X" \
 *     --lv HH,BY \
 *     [--expires-in-days 365] \
 *     [--rate-limit 60]
 *
 * Use `--lv '*'` to grant access to all Landesverbände.
 *
 * Prints the plaintext key ONCE — store it immediately, it cannot be recovered.
 */

import { randomBytes } from 'crypto';

import { api_keys, type ApiKeyScopes } from '../database/schema/apiKeys.js';
import { getDrizzleInstance } from '../database/services/DrizzleService.js';
import { getPostgresInstance } from '../database/services/PostgresService/PostgresService.js';
import { hashApiKey } from '../middleware/apiKeyMiddleware.js';

interface ParsedArgs {
  user?: string;
  label?: string;
  lv?: string;
  expiresInDays?: number;
  rateLimit?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--user') out.user = value;
    else if (flag === '--label') out.label = value;
    else if (flag === '--lv') out.lv = value;
    else if (flag === '--expires-in-days') out.expiresInDays = Number(value);
    else if (flag === '--rate-limit') out.rateLimit = Number(value);
    else continue;
    i++;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.user) throw new Error('--user <profile-id> is required');
  if (!args.label) throw new Error('--label "<description>" is required');
  if (!args.lv) throw new Error('--lv HH,BY (or "*") is required');

  const landesverbaende: string[] | '*' =
    args.lv === '*'
      ? '*'
      : args.lv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  const scopes: ApiKeyScopes = {
    permissions: ['notebooks:read'],
    landesverbaende,
  };

  // Initialize Postgres pool so DrizzleInstance can attach.
  await getPostgresInstance().init();

  const plaintext = `gru_${randomBytes(32).toString('hex')}`;
  const hash = hashApiKey(plaintext);
  const prefix = plaintext.slice(0, 12);

  const expiresAt =
    args.expiresInDays && args.expiresInDays > 0
      ? new Date(Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const db = getDrizzleInstance();
  const [row] = await db
    .insert(api_keys)
    .values({
      user_id: args.user,
      key_hash: hash,
      key_prefix: prefix,
      label: args.label,
      scopes,
      ...(args.rateLimit && args.rateLimit > 0 && { rate_limit_per_minute: args.rateLimit }),
      ...(expiresAt && { expires_at: expiresAt }),
    })
    .returning({ id: api_keys.id });

  console.log('');
  console.log('=== API key minted ===');
  console.log(`id        : ${row.id}`);
  console.log(`user      : ${args.user}`);
  console.log(`label     : ${args.label}`);
  console.log(`scopes    : ${JSON.stringify(scopes)}`);
  console.log(`prefix    : ${prefix}`);
  console.log(`expires   : ${expiresAt ? expiresAt.toISOString() : 'never'}`);
  console.log('');
  console.log(`PLAINTEXT KEY (store now — cannot be recovered):`);
  console.log(`  ${plaintext}`);
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('[mintApiKey] FAILED:', err);
  process.exit(1);
});
