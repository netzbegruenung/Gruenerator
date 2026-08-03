/**
 * Issue an API key for the external push-ingest API (`/api/v1/push/*`).
 *
 * This is how the WordPress `gruenerator-sync` plugin (or any push client) gets a
 * credential. The plaintext key is printed ONCE — only its SHA-256 hash is
 * stored. Bypasses HTTP (writes the row directly), so run it on the backend host.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/createLvIngestKey.ts \
 *     --user <USER_UUID> --label "Grüne LSA WordPress" --lv LSA
 *
 *   # user notebook target (any notebook the user may edit): omit --lv or pass '*'
 *   pnpm --filter @gruenerator/api exec tsx scripts/createLvIngestKey.ts \
 *     --user <USER_UUID> --label "My WP site" --lv '*'
 *
 * Flags:
 *   --user <uuid>     (required) owner of the key; for notebook pushes this user
 *                     must have edit permission on the target notebook.
 *   --label <text>    (required) human-readable name shown in the keys table.
 *   --lv <codes>      comma-separated LV short codes (e.g. "LSA,MV") or "*".
 *                     Omit for notebook-only keys (no LV scope).
 *   --rate <n>        optional per-minute rate limit.
 */
import 'dotenv/config';
import { randomBytes, createHash } from 'crypto';

import { api_keys, type ApiKeyScopes } from '../database/schema/apiKeys.js';
import { getDrizzleInstance } from '../database/services/DrizzleService.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const userId = arg('--user');
  const label = arg('--label');
  const lvRaw = arg('--lv');
  const rateRaw = arg('--rate');

  if (!userId || !label) {
    console.error('Missing required flags. Usage:');
    console.error(
      "  tsx scripts/createLvIngestKey.ts --user <uuid> --label <text> [--lv 'LSA,MV'|'*'] [--rate <n>]"
    );
    process.exit(1);
  }

  const landesverbaende: ApiKeyScopes['landesverbaende'] | undefined =
    lvRaw === '*'
      ? '*'
      : lvRaw
        ? lvRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

  const scopes: ApiKeyScopes = {
    permissions: ['ingest:articles'],
    ...(landesverbaende ? { landesverbaende } : {}),
  };

  // grun_<48 hex chars>. The prefix is stored for display; the full key is hashed.
  const secret = randomBytes(24).toString('hex');
  const plaintext = `grun_${secret}`;
  const keyHash = createHash('sha256').update(plaintext).digest('hex');
  const keyPrefix = plaintext.slice(0, 12);

  const db = getDrizzleInstance();
  const [row] = await db
    .insert(api_keys)
    .values({
      user_id: userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      label,
      scopes,
      rate_limit_per_minute: rateRaw ? Number(rateRaw) : null,
    })
    .returning({ id: api_keys.id });

  console.log('\n✅ API key created.');
  console.log(`   id:     ${row.id}`);
  console.log(`   label:  ${label}`);
  console.log(`   scopes: ${JSON.stringify(scopes)}`);
  console.log('\n🔑 Plaintext key (shown once — store it in the plugin now):\n');
  console.log(`   ${plaintext}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create key:', err);
  process.exit(1);
});
